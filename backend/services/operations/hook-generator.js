class HookGenerator {
  constructor(taskAgent) {
    this.taskAgent = taskAgent; // Reference to the Task tool agent
  }

  // Generate a hook using Claude Code
  async generateHook(request) {
    const {
      scope,
      eventType,
      pattern = '*',
      description,
      projectInfo = null,
      userEnv = {}
    } = request;

    if (!description || description.trim().length === 0) {
      throw new Error('Description is required for hook generation');
    }

    try {
      // Build the comprehensive prompt for Claude Code
      const prompt = this.buildGenerationPrompt({
        scope,
        eventType,
        pattern,
        description,
        projectInfo,
        userEnv
      });

      // Send to Claude Code via Task agent
      const result = await this.taskAgent.execute({
        description: "Generate JavaScript hook code",
        prompt: prompt,
        subagent_type: "general-purpose"
      });

      // Parse and validate the generated code
      const generatedCode = this.extractCodeFromResponse(result);
      const validationResult = await this.validateGeneratedCode(generatedCode, eventType);

      if (!validationResult.isValid) {
        throw new Error(`Generated code validation failed: ${validationResult.errors.join(', ')}`);
      }

      return {
        success: true,
        code: generatedCode,
        metadata: {
          generatedAt: Date.now(),
          eventType,
          pattern,
          description,
          scope,
          validation: validationResult
        }
      };

    } catch (error) {
      console.error('Hook generation failed:', error);
      return {
        success: false,
        error: error.message,
        metadata: {
          generatedAt: Date.now(),
          eventType,
          pattern,
          description,
          scope
        }
      };
    }
  }

  // Build the comprehensive prompt for Claude Code
  buildGenerationPrompt({ scope, eventType, pattern, description, projectInfo, userEnv }) {
    return `You are creating a JavaScript hook handler for the Claude Manager hook system.

HOOK REQUIREMENTS:
- Hook Type: ${eventType}
- Event Pattern: ${pattern}
- Scope: ${scope}
- User Description: ${description}

EXECUTION ENVIRONMENT:
The hook will be executed in a sandboxed Node.js VM with the following context:

AVAILABLE VARIABLES:
- hookEvent: {
    type: '${eventType}',
    toolName: 'string', // Name of the Claude tool that triggered this
    filePaths: ['array', 'of', 'file', 'paths'], // Files affected by the tool
    context: {}, // Additional context data
    timestamp: 1234567890
  }
- projectInfo: ${projectInfo ? `{
    name: '${projectInfo.name}',
    path: '${projectInfo.path}',
    config: {} // Project configuration
  }` : 'null // No project context for user-level hooks'}
- userEnv: {} // Filtered environment variables (sensitive keys removed)
- hookMeta: { id: 'string', name: 'string', scope: '${scope}' }

AVAILABLE SERVICES:
- Ollama LLM API: ${userEnv.OLLAMA_SERVICE_URL || 'http://100.83.40.11:11434'}
- TTS Service: ${userEnv.TTS_SERVICE_URL || 'http://100.83.40.11:8080'}

UTILITY FUNCTIONS:
- utils.log(...args) - Log messages
- utils.sleep(ms) - Sleep for milliseconds
- utils.fetch(url, options) - HTTP requests (restricted domains)
- utils.playSound(type) - Play notification sounds ('success', 'error', 'warning', 'info')
- utils.speak(text, options) - Text-to-speech
- utils.askOllama(prompt, options) - Query Ollama LLM
- utils.notify(message, type) - Send notifications

CONSOLE METHODS:
- console.log(), console.warn(), console.error()

HOOK EXECUTION PATTERNS:

${this.getHookPatternExamples(eventType)}

SECURITY CONSTRAINTS:
- No file system write access
- HTTP requests limited to approved domains
- 30-second execution timeout
- No access to sensitive environment variables
- Sandboxed execution environment

REQUIREMENTS:
1. Write JavaScript code that accomplishes: ${description}
2. Use async/await for asynchronous operations
3. Handle errors gracefully with try/catch
4. Return a meaningful result or status message
5. Use the available utility functions appropriately
6. Follow the hook execution pattern for ${eventType}

Generate only the JavaScript code without markdown formatting or explanations. The code should be ready to execute in the hook system.`;
  }

  // Get hook pattern examples based on event type
  getHookPatternExamples(eventType) {
    const examples = {
      'PreToolUse': `
EXAMPLE PreToolUse Hook:
// This runs BEFORE a Claude tool executes
if (hookEvent.toolName === 'Write' || hookEvent.toolName === 'Edit') {
  await utils.notify('Starting file operation', 'info');
  console.log('About to modify files:', hookEvent.filePaths);
}
return 'Pre-tool validation completed';`,

      'PostToolUse': `
EXAMPLE PostToolUse Hook:
// This runs AFTER a Claude tool executes
if (hookEvent.toolName === 'Write') {
  await utils.speak('File write completed');
  console.log('Files written:', hookEvent.filePaths);
  
  // Ask Ollama to summarize what was done
  const summary = await utils.askOllama(
    'Summarize this file operation: ' + JSON.stringify(hookEvent),
    { model: 'llama3.2', max_tokens: 100 }
  );
  
  return 'Post-tool processing: ' + summary;
}`,

      'Notification': `
EXAMPLE Notification Hook:
// This runs when Claude sends a notification
const message = hookEvent.context.message || 'Notification received';
await utils.speak(message);
await utils.playSound('info');
console.log('Notification processed:', message);
return 'Notification handled';`,

      'Stop': `
EXAMPLE Stop Hook:
// This runs when Claude completes a task
await utils.playSound('success');
await utils.speak('Claude task completed successfully');

// Optional: Summarize the session
if (projectInfo) {
  const summary = await utils.askOllama(
    'Create a brief summary of the completed Claude session for project: ' + projectInfo.name,
    { model: 'llama3.2', max_tokens: 150 }
  );
  console.log('Session summary:', summary);
  return summary;
}

return 'Task completion processed';`,

      'SubagentStop': `
EXAMPLE SubagentStop Hook:
// This runs when a Claude subagent completes
await utils.notify('Subagent task completed', 'success');
await utils.playSound('success');
console.log('Subagent completed at:', new Date().toISOString());
return 'Subagent completion processed';`
    };

    return examples[eventType] || `
EXAMPLE Generic Hook:
// Generic hook pattern for ${eventType}
console.log('Hook triggered:', hookEvent.type);
await utils.notify('Hook executed for ' + hookEvent.toolName);
return 'Hook executed successfully';`;
  }

  // Extract JavaScript code from Claude's response
  extractCodeFromResponse(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('Invalid response from Claude Code');
    }

    // Try to extract code from markdown code blocks
    const codeBlockMatch = response.match(/```(?:javascript|js)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code blocks, assume the entire response is code
    const cleanResponse = response.trim();
    if (cleanResponse.length > 0) {
      return cleanResponse;
    }

    throw new Error('No JavaScript code found in Claude response');
  }

  // Validate the generated JavaScript code
  async validateGeneratedCode(code, eventType) {
    const errors = [];
    const warnings = [];

    try {
      // Basic syntax validation
      new Function(code);
    } catch (syntaxError) {
      errors.push(`Syntax error: ${syntaxError.message}`);
    }

    // Check for required patterns
    if (!code.includes('hookEvent')) {
      warnings.push('Code does not reference hookEvent variable');
    }

    if (!code.includes('return')) {
      warnings.push('Code does not return a value');
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      'eval(',
      'Function(',
      'require(',
      'import ',
      'process.exit',
      'process.kill',
      '__dirname',
      '__filename'
    ];

    dangerousPatterns.forEach(pattern => {
      if (code.includes(pattern)) {
        errors.push(`Dangerous pattern detected: ${pattern}`);
      }
    });

    // Check for async/await usage with potentially async operations
    const asyncOperations = ['utils.fetch', 'utils.speak', 'utils.askOllama', 'utils.sleep'];
    const hasAsyncOps = asyncOperations.some(op => code.includes(op));
    const hasAwait = code.includes('await');
    const hasAsync = code.includes('async');

    if (hasAsyncOps && !hasAwait) {
      warnings.push('Code uses async operations but no await keywords found');
    }

    // Event type specific validation
    if (eventType === 'PreToolUse' && !code.includes('hookEvent.toolName')) {
      warnings.push('PreToolUse hooks typically check hookEvent.toolName');
    }

    if (eventType === 'PostToolUse' && !code.includes('hookEvent.filePaths')) {
      warnings.push('PostToolUse hooks typically reference hookEvent.filePaths');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      codeLength: code.length,
      hasAsyncOperations: hasAsyncOps,
      usesAwait: hasAwait
    };
  }

  // Generate hook code for common patterns
  async generateTemplateHook(template, customization = {}) {
    const templates = {
      'tts-notification': {
        eventType: 'Notification',
        pattern: '*',
        description: 'Speak all notifications using text-to-speech'
      },
      'file-backup': {
        eventType: 'PreToolUse',
        pattern: 'Write|Edit',
        description: 'Create backups before file modifications'
      },
      'completion-sound': {
        eventType: 'Stop',
        pattern: '*',
        description: 'Play success sound when tasks complete'
      },
      'ollama-summary': {
        eventType: 'PostToolUse',
        pattern: '*',
        description: 'Generate AI summary of completed operations using Ollama'
      }
    };

    const templateConfig = templates[template];
    if (!templateConfig) {
      throw new Error(`Unknown template: ${template}`);
    }

    const request = {
      ...templateConfig,
      ...customization,
      scope: customization.scope || 'user'
    };

    return await this.generateHook(request);
  }

  // Regenerate hook with modifications
  async regenerateHook(originalHook, modifications) {
    const request = {
      scope: originalHook.scope || 'user',
      eventType: originalHook.eventType,
      pattern: originalHook.pattern,
      description: modifications.description || originalHook.description,
      projectInfo: modifications.projectInfo,
      userEnv: modifications.userEnv || {}
    };

    // Add regeneration context
    request.description += `\n\nIMPROVEMENT REQUEST: ${modifications.improvement || 'Please improve the previous implementation'}`;
    
    if (originalHook.code) {
      request.description += `\n\nPREVIOUS CODE:\n${originalHook.code}`;
    }

    return await this.generateHook(request);
  }

  // Batch generate multiple hooks
  async generateMultipleHooks(requests) {
    const results = [];
    
    for (const request of requests) {
      try {
        const result = await this.generateHook(request);
        results.push(result);
        
        // Small delay between generations to avoid overwhelming Claude
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          request
        });
      }
    }
    
    return results;
  }
}

module.exports = HookGenerator;