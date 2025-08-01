#!/usr/bin/env node

/**
 * Example hook script that uses Fish Speech TTS
 * This can be called from Claude Manager hooks
 */

const { quickTTS } = require('./tts-utils');
const path = require('path');

async function handleHookEvent() {
  // Get hook event data from environment variables or command line
  const eventType = process.env.CLAUDE_HOOK_EVENT_TYPE || process.argv[2] || 'Notification';
  const toolName = process.env.CLAUDE_HOOK_TOOL_NAME || process.argv[3] || 'unknown tool';
  const message = process.env.CLAUDE_HOOK_MESSAGE || process.argv.slice(4).join(' ') || '';

  console.log(`[Hook TTS] Event: ${eventType}, Tool: ${toolName}`);

  try {
    switch (eventType) {
      case 'PreToolUse':
        await quickTTS.announceToolStart(toolName);
        break;
        
      case 'PostToolUse':
        await quickTTS.announceToolEnd(toolName);
        break;
        
      case 'Notification':
        if (message) {
          await quickTTS.notify(message);
        } else {
          await quickTTS.notify('Claude Code notification');
        }
        break;
        
      case 'Stop':
        await quickTTS.taskComplete();
        break;
        
      default:
        await quickTTS.say(`Claude Code ${eventType} event`);
    }

    console.log('[Hook TTS] ✅ Audio announcement completed');
  } catch (error) {
    console.error('[Hook TTS] ❌ Error:', error.message);
    process.exit(1);
  }
}

// Example hook configurations for Claude Manager
const HOOK_EXAMPLES = {
  ttsPreTool: {
    name: "TTS Tool Start Announcement",
    pattern: "*",
    hookType: "PreToolUse",
    enabled: false, // Set to true to enable
    command: `node ${__filename} PreToolUse`,
    description: "Announces when a tool is about to be used"
  },
  
  ttsPostTool: {
    name: "TTS Tool Completion Announcement", 
    pattern: "*",
    hookType: "PostToolUse",
    enabled: false,
    command: `node ${__filename} PostToolUse`,
    description: "Announces when a tool has completed"
  },
  
  ttsNotification: {
    name: "TTS Notification Reader",
    pattern: "*", 
    hookType: "Notification",
    enabled: false,
    command: `node ${__filename} Notification`,
    description: "Reads notifications aloud"
  },
  
  ttsTaskComplete: {
    name: "TTS Task Completion",
    pattern: "*",
    hookType: "Stop", 
    enabled: false,
    command: `node ${__filename} Stop`,
    description: "Announces task completion"
  }
};

// If run directly, handle the hook event
if (require.main === module) {
  handleHookEvent().catch(console.error);
}

module.exports = {
  handleHookEvent,
  HOOK_EXAMPLES
};