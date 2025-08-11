#!/usr/bin/env node

/**
 * Permission Notification TTS Hook
 * Provides audio notifications for Claude Code permission prompts
 * (like file edit requests, bash script execution approvals)
 * 
 * This hook is triggered by UserPromptSubmit events and attempts to detect
 * permission-related prompts to provide contextual audio feedback.
 */

const path = require('path');
const fs = require('fs');

// Try to import TTS service, but gracefully handle if it's not available
let TTSService;
try {
  TTSService = require('../../../backend/services/integrations/tts-service');
} catch (error) {
  console.error('[Permission TTS] Warning: TTS service not available:', error.message);
}

// Fish Speech TTS with fallback to macOS say
async function fallbackTTS(message) {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  // First try Fish Speech TTS server (preferred)
  try {
    const tempFile = `/tmp/tts_${Date.now()}.wav`;
    const command = `curl -s --connect-timeout 3 --max-time 10 -X POST "http://100.83.40.11:8080/v1/tts" -H "Content-Type: application/json" -d '{"text": "${message}"}' -o "${tempFile}" && afplay "${tempFile}" && rm -f "${tempFile}"`;
    
    await execAsync(command, { timeout: 15000 });
    console.log('[Permission TTS] ✅ Used Fish Speech TTS server');
    return;
  } catch (error) {
    console.log('[Permission TTS] Fish Speech TTS timeout or error, using macOS say as fallback');
  }
  
  // Fallback to macOS built-in say command
  if (process.platform === 'darwin') {
    try {
      await execAsync(`say "${message}"`, { timeout: 5000 });
      console.log('[Permission TTS] ✅ Used macOS say command (fallback)');
      return;
    } catch (error) {
      console.error('[Permission TTS] macOS say failed:', error.message);
    }
  }
  
  console.error('[Permission TTS] ❌ All TTS methods failed');
}

// Detect permission request patterns in the environment
function detectPermissionContext() {
  const context = {
    projectName: process.env.CLAUDE_PROJECT_NAME || path.basename(process.cwd()),
    toolName: process.env.CLAUDE_TOOL_NAME,
    filePaths: process.env.CLAUDE_FILE_PATHS ? process.env.CLAUDE_FILE_PATHS.split(' ') : [],
    eventType: process.env.CLAUDE_HOOK_EVENT || 'UserPromptSubmit',
    notification: process.env.CLAUDE_NOTIFICATION || '',
    toolInput: process.env.CLAUDE_TOOL_INPUT || ''
  };

  // Additional context from command line args
  const args = process.argv.slice(2);
  if (args.length > 0) {
    context.additionalInfo = args.join(' ');
  }

  return context;
}

// Generate appropriate notification message based on context
function generateNotificationMessage(context) {
  const { projectName, toolName, filePaths, toolInput, notification } = context;
  
  // Check for file editing permissions
  if (toolName && ['Edit', 'Write', 'MultiEdit'].includes(toolName) && filePaths.length > 0) {
    const fileCount = filePaths.length;
    const fileName = fileCount === 1 ? path.basename(filePaths[0]) : `${fileCount} files`;
    return `${projectName} wants permission to edit ${fileName}`;
  }
  
  // Check for bash script execution
  if (toolName === 'Bash' || (toolInput && toolInput.includes('bash'))) {
    return `${projectName} wants permission to run a bash script`;
  }
  
  // Check for general tool permissions
  if (toolName && !['Read', 'LS', 'Glob', 'Grep'].includes(toolName)) {
    return `${projectName} wants permission to use ${toolName}`;
  }
  
  // Check if there's a notification message that looks like a permission request
  if (notification) {
    const lowerNotification = notification.toLowerCase();
    if (lowerNotification.includes('permission') || 
        lowerNotification.includes('approve') || 
        lowerNotification.includes('allow') ||
        lowerNotification.includes('confirm')) {
      return `${projectName} needs approval: ${notification}`;
    }
  }
  
  // Generic permission request
  return `${projectName} is requesting permission`;
}

// Main hook handler
async function handlePermissionNotification() {
  console.log('[Permission TTS] Processing permission notification...');
  
  try {
    const context = detectPermissionContext();
    console.log('[Permission TTS] Context:', JSON.stringify(context, null, 2));
    
    // Only trigger for events that look like permission requests
    if (context.eventType !== 'UserPromptSubmit') {
      console.log('[Permission TTS] Skipping - not a UserPromptSubmit event');
      return;
    }
    
    const message = generateNotificationMessage(context);
    console.log('[Permission TTS] Generated message:', message);
    
    // Try to use the TTS service first, with timeout handling
    if (TTSService) {
      try {
        const ttsService = new TTSService();
        // Create a timeout wrapper for the TTS service
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TTS service timeout')), 12000)
        );
        
        await Promise.race([
          ttsService.speak(message, { speed: 1.1 }),
          timeoutPromise
        ]);
        
        console.log('[Permission TTS] ✅ Used Fish Speech TTS service successfully');
        return;
      } catch (error) {
        console.log('[Permission TTS] TTS service failed or timeout, using direct fallback');
      }
    }
    
    // Fallback to direct curl command
    await fallbackTTS(message);
    
  } catch (error) {
    console.error('[Permission TTS] ❌ Error handling notification:', error.message);
    process.exit(1);
  }
}

// Utility function to test the hook with mock data
async function testHook(testScenario = 'file_edit') {
  console.log(`[Permission TTS] Testing scenario: ${testScenario}`);
  
  const scenarios = {
    file_edit: {
      CLAUDE_PROJECT_NAME: 'my-project',
      CLAUDE_TOOL_NAME: 'Edit',
      CLAUDE_FILE_PATHS: '/path/to/file.js',
      CLAUDE_HOOK_EVENT: 'UserPromptSubmit'
    },
    bash_script: {
      CLAUDE_PROJECT_NAME: 'security-project',
      CLAUDE_TOOL_NAME: 'Bash',
      CLAUDE_TOOL_INPUT: 'npm install --save-dev',
      CLAUDE_HOOK_EVENT: 'UserPromptSubmit'
    },
    multi_file: {
      CLAUDE_PROJECT_NAME: 'web-app',
      CLAUDE_TOOL_NAME: 'MultiEdit',
      CLAUDE_FILE_PATHS: '/src/component.tsx /src/styles.css /src/utils.js',
      CLAUDE_HOOK_EVENT: 'UserPromptSubmit'
    },
    generic_permission: {
      CLAUDE_PROJECT_NAME: 'claude-manager',
      CLAUDE_NOTIFICATION: 'Please confirm this action requires your approval',
      CLAUDE_HOOK_EVENT: 'UserPromptSubmit'
    }
  };
  
  if (scenarios[testScenario]) {
    // Set environment variables for testing
    Object.entries(scenarios[testScenario]).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    await handlePermissionNotification();
  } else {
    console.error('[Permission TTS] Unknown test scenario:', testScenario);
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'test') {
    const scenario = process.argv[3] || 'file_edit';
    testHook(scenario).catch(console.error);
  } else {
    handlePermissionNotification().catch(console.error);
  }
}

module.exports = {
  handlePermissionNotification,
  detectPermissionContext,
  generateNotificationMessage,
  testHook
};