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
    const { serviceConfig } = require('../../utils/service-config');
    const serviceUrls = serviceConfig.getAllServiceUrls();
    const ollamaUrl = userEnv.OLLAMA_SERVICE_URL || serviceUrls.ollama;
    const ttsUrl = userEnv.TTS_SERVICE_URL || serviceUrls.tts;

    return `You are generating JavaScript code for Claude Code's hook system.

CLAUDE CODE HOOK SYSTEM EXPLANATION:

Claude Code is Anthropic's CLI tool for software development. It has a hook system that allows users to execute custom JavaScript code in response to Claude's actions.

HOOK LIFECYCLE:
1. User works with Claude Code (AI assistant)
2. Claude uses tools like Write, Edit, Bash, Read, Grep, MultiEdit, etc.
3. Before/after each tool use, Claude Code triggers hook events
4. Your generated JavaScript code executes in a sandboxed Node.js VM
5. The code can perform actions like notifications, file operations, API calls

HOOK EVENT TYPES:
- PreToolUse: Runs BEFORE Claude executes a tool (validation, backups, warnings)
- PostToolUse: Runs AFTER Claude executes a tool (cleanup, formatting, git operations)
- Notification: Runs when Claude sends status messages
- Stop: Runs when Claude completes a task/conversation
- SubagentStop: Runs when a Claude subagent completes its work

EXECUTION ENVIRONMENT:
- Sandboxed Node.js VM (30-second timeout)
- No file system write access (security)
- Limited HTTP requests to approved domains
- Access to local services (Ollama LLM, TTS)

YOUR JAVASCRIPT CODE RECEIVES:

hookEvent = {
  type: '${eventType}', // The event type for this hook
  toolName: 'Write|Edit|Bash|Read|Grep|MultiEdit|etc', // Claude tool that triggered this
  filePaths: ['/path/to/affected/file.js'], // Files Claude is working with
  context: { /* Tool-specific data like file content, command args */ },
  timestamp: 1234567890
}

projectInfo = ${projectInfo ? `{
  name: '${projectInfo.name}',           // Name of the current project
  path: '${projectInfo.path}',          // Full project path
  config: { /* Claude project settings */ }
}` : 'null // null for user-level hooks'}

userEnv = { /* Safe environment variables - sensitive keys filtered */ }

hookMeta = {
  id: 'hook-uuid',
  name: 'Generated Hook',
  scope: '${scope}'
}

utils = {
  log(...args),                         // Console logging
  sleep(milliseconds),                  // Async delay
  fetch(url, options),                  // HTTP requests (restricted domains)
  playSound('success|error|warning|info'), // System sounds
  speak(text, options),                 // Text-to-speech via ${ttsUrl}
  askOllama(prompt, options),           // Query Ollama LLM at ${ollamaUrl}
  notify(message, type)                 // System notifications
}

console = {
  log(...args),   // Logging
  warn(...args),  // Warnings
  error(...args)  // Errors
}

USER REQUEST:
Hook Type: ${eventType}
Event Pattern: ${pattern}
Scope: ${scope}
User Description: ${description}

GENERATE JAVASCRIPT CODE THAT:
1. Properly handles the ${eventType} event
2. Matches files/tools using pattern: ${pattern}
3. Implements: ${description}
4. Uses hookEvent data appropriately
5. Includes error handling and user feedback
6. Uses available utilities (utils.notify, utils.speak, etc.)
7. Returns a meaningful status message

EVENT-SPECIFIC GUIDANCE:
${this.getEventSpecificGuidance(eventType)}

CODE REQUIREMENTS:
- Must be valid JavaScript for Node.js VM
- Use async/await for asynchronous operations  
- Include try/catch error handling
- No file system writes, no dangerous operations
- Comment the code to explain the logic
- Return a string status message

EXAMPLE HOOK STRUCTURE:
\`\`\`javascript
// ${description}
try {
  // Check if this event matches our criteria
  if (hookEvent.toolName === 'Write' || hookEvent.toolName === 'Edit') {
    // Your logic here
    console.log('Processing event:', hookEvent.type);
    
    // Use utilities
    await utils.notify('Hook executed', 'info');
    
    return 'Hook completed successfully';
  }
  
  return 'Event ignored - no match';
} catch (error) {
  console.error('Hook failed:', error);
  return 'Hook failed: ' + error.message;
}
\`\`\`

Generate only the JavaScript code without markdown formatting or explanations. The code should be ready to execute in the hook system.`;
  }

  // Get event-specific guidance for prompt
  getEventSpecificGuidance(eventType) {
    const guidance = {
      'PreToolUse': `
This runs BEFORE Claude executes a tool. Use this for:
- Validation and safety checks
- Creating backups
- User warnings/confirmations
- Preprocessing

You can prevent the tool from running by throwing an error.
Access intended action via hookEvent.toolName and hookEvent.filePaths.`,

      'PostToolUse': `
This runs AFTER Claude completes a tool action. Use this for:
- Cleanup and formatting
- Git operations (add, commit, push)  
- Analysis and reporting
- Integration with external tools

Files have already been modified. Use hookEvent.filePaths to see what changed.`,

      'Notification': `
This runs when Claude sends status messages. Use this for:
- User experience improvements
- Text-to-speech notifications
- External integrations
- Logging and monitoring

Access message via hookEvent.context.message.`,

      'Stop': `
This runs when Claude completes a task/conversation. Use this for:
- Task completion notifications
- Session summaries
- Cleanup operations
- External reporting

Perfect for "task done" feedback to users.`,

      'SubagentStop': `
This runs when a Claude subagent completes. Use this for:
- Subagent completion feedback
- Chain of task notifications
- Progress tracking
- Workflow management`
    };

    return guidance[eventType] || 'Generic hook - adapt based on your needs.';
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
      // Basic syntax validation with mock context
      // Create a mock environment with the variables that hooks expect
      // Wrap the code in an async function to handle await statements
      const mockContext = `
        const hookEvent = { type: '${eventType}', toolName: 'test', filePaths: [], context: {}, timestamp: Date.now() };
        const projectInfo = { name: 'test', path: '/test', config: {} };
        const userEnv = {};
        const hookMeta = { id: 'test', name: 'test', scope: 'user' };
        const utils = {
          log: () => {},
          sleep: () => Promise.resolve(),
          fetch: () => Promise.resolve({}),
          playSound: () => Promise.resolve(),
          speak: () => Promise.resolve(),
          askOllama: () => Promise.resolve(),
          notify: () => Promise.resolve()
        };
        const console = { log: () => {}, warn: () => {}, error: () => {} };
        
        // Wrap in async function to handle await statements
        (async () => {
          ${code}
        })();
      `;
      new Function(mockContext);
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