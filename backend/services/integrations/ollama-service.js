const axios = require('axios');

class OllamaService {
  constructor(baseUrl = 'http://100.83.40.11:11434') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Get available models
  async getModels() {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models || [];
    } catch (error) {
      console.error('Error fetching Ollama models:', error.message);
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  // Generate text completion
  async generate(options = {}) {
    const {
      model = 'llama3.2',
      prompt,
      stream = false,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 1000,
      stop = null
    } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    try {
      const requestData = {
        model,
        prompt,
        stream,
        options: {
          temperature,
          top_p,
          num_predict: max_tokens,
          stop: stop ? (Array.isArray(stop) ? stop : [stop]) : undefined
        }
      };

      const response = await this.client.post('/api/generate', requestData);
      
      if (stream) {
        return response.data; // Return stream response as-is
      } else {
        return {
          response: response.data.response,
          model: response.data.model,
          created_at: response.data.created_at,
          done: response.data.done
        };
      }
    } catch (error) {
      console.error('Error generating with Ollama:', error.message);
      throw new Error(`Ollama generation failed: ${error.message}`);
    }
  }

  // Chat completion (for conversation-style interactions)
  async chat(options = {}) {
    const {
      model = 'llama3.2',
      messages,
      stream = false,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 1000
    } = options;

    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages array is required');
    }

    try {
      const requestData = {
        model,
        messages,
        stream,
        options: {
          temperature,
          top_p,
          num_predict: max_tokens
        }
      };

      const response = await this.client.post('/api/chat', requestData);
      
      if (stream) {
        return response.data;
      } else {
        return {
          message: response.data.message,
          model: response.data.model,
          created_at: response.data.created_at,
          done: response.data.done
        };
      }
    } catch (error) {
      console.error('Error chatting with Ollama:', error.message);
      throw new Error(`Ollama chat failed: ${error.message}`);
    }
  }

  // Pull a model (download if not available)
  async pullModel(modelName) {
    try {
      const response = await this.client.post('/api/pull', {
        name: modelName
      });
      return response.data;
    } catch (error) {
      console.error('Error pulling Ollama model:', error.message);
      throw new Error(`Failed to pull model ${modelName}: ${error.message}`);
    }
  }

  // Check if service is available
  async healthCheck() {
    try {
      const response = await this.client.get('/api/tags');
      return {
        status: 'healthy',
        available: true,
        models: response.data.models?.length || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        available: false,
        error: error.message
      };
    }
  }

  // Helper method for hook system integration
  async processHookPrompt(prompt, context = {}) {
    const {
      model = 'llama3.2',
      temperature = 0.7,
      maxTokens = 500
    } = context;

    const systemPrompt = `You are assisting with a Claude Code hook event. 
Context: ${JSON.stringify(context, null, 2)}

Respond concisely and helpfully.`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];

      const result = await this.chat({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      });

      return result.message?.content || result.response || 'No response';
    } catch (error) {
      console.error('Error processing hook prompt:', error.message);
      return `Error: ${error.message}`;
    }
  }

  // Create a summarization prompt for hook events
  async summarizeHookEvent(eventData) {
    const prompt = `Summarize this Claude Code hook event:
Event Type: ${eventData.eventType}
Tool: ${eventData.toolName || 'N/A'}
Files: ${eventData.filePaths?.join(', ') || 'N/A'}
Context: ${JSON.stringify(eventData.context || {}, null, 2)}

Provide a brief, human-readable summary of what happened.`;

    return await this.processHookPrompt(prompt, { 
      model: 'llama3.2',
      temperature: 0.3,
      maxTokens: 200 
    });
  }

  // Generate JavaScript hook code based on user requirements
  async generateHookCode(hookRequest) {
    const {
      eventType,
      pattern = '*',
      description,
      scope = 'user',
      projectInfo = null,
      userEnv = {},
      availableServices = {}
    } = hookRequest;

    // Build comprehensive prompt for hook generation
    const prompt = this.buildHookGenerationPrompt({
      eventType,
      pattern,
      description,
      scope,
      projectInfo,
      userEnv,
      availableServices
    });

    try {
      const result = await this.generate({
        model: 'llama3.2', // Good for code generation
        prompt,
        temperature: 0.1, // Low temperature for consistent code
        max_tokens: 1500,
        stop: ['```', 'END_CODE']
      });

      // Extract and clean the generated code
      const generatedCode = this.extractJavaScriptCode(result.response);
      
      return {
        success: true,
        code: generatedCode,
        model: result.model,
        metadata: {
          eventType,
          pattern,
          description,
          scope,
          generatedAt: Date.now()
        }
      };

    } catch (error) {
      console.error('Hook code generation failed:', error);
      return {
        success: false,
        error: error.message,
        fallbackCode: this.generateFallbackHookCode(eventType, description)
      };
    }
  }

  // Build comprehensive prompt for hook code generation
  buildHookGenerationPrompt({ eventType, pattern, description, scope, projectInfo, userEnv, availableServices }) {
    const ollamaUrl = availableServices.ollama || 'http://100.83.40.11:11434';
    const ttsUrl = availableServices.tts || 'http://100.83.40.11:8080';

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
Event Type: ${eventType}
File Pattern: ${pattern}
Scope: ${scope}
Description: ${description}

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

CRITICAL: Generate ONLY plain JavaScript code that can be executed directly in the VM context. DO NOT wrap it in a function definition. DO NOT use function parameters. The variables (hookEvent, projectInfo, userEnv, hookMeta, utils, console) are available as globals in the execution context.

Generate ONLY the JavaScript code without markdown formatting. The code should be ready to execute in the hook system.`;
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

  // Extract JavaScript code from LLM response
  extractJavaScriptCode(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('Invalid response from LLM');
    }

    // Remove markdown code blocks if present
    const codeBlockMatch = response.match(/```(?:javascript|js)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code blocks, clean and return the response
    const cleaned = response.trim()
      .replace(/^```javascript\s*/i, '')
      .replace(/^```js\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    if (cleaned.length === 0) {
      throw new Error('No JavaScript code found in LLM response');
    }

    return cleaned;
  }

  // Generate fallback hook code if LLM fails
  generateFallbackHookCode(eventType, description) {
    const fallbacks = {
      'PreToolUse': `// Pre-tool hook: ${description}
console.log('Pre-tool event:', hookEvent.toolName);
await utils.notify('About to execute: ' + hookEvent.toolName, 'info');
return 'Pre-tool hook executed';`,

      'PostToolUse': `// Post-tool hook: ${description}  
console.log('Post-tool event:', hookEvent.toolName);
if (hookEvent.filePaths && hookEvent.filePaths.length > 0) {
  await utils.notify('Completed ' + hookEvent.toolName + ' on ' + hookEvent.filePaths.length + ' files', 'success');
}
return 'Post-tool hook executed';`,

      'Notification': `// Notification hook: ${description}
const message = hookEvent.context?.message || 'Notification received';
console.log('Notification:', message);
await utils.notify(message, 'info');
return 'Notification processed';`,

      'Stop': `// Task completion hook: ${description}
console.log('Task completed at:', new Date().toISOString());
await utils.playSound('success');
await utils.notify('Claude task completed', 'success');
return 'Task completion processed';`,

      'SubagentStop': `// Subagent completion hook: ${description}
console.log('Subagent completed at:', new Date().toISOString());
await utils.notify('Subagent task completed', 'success');
return 'Subagent completion processed';`
    };

    return fallbacks[eventType] || `// Generic hook: ${description}
console.log('Hook triggered:', hookEvent.type);
await utils.notify('Hook executed', 'info');
return 'Hook executed successfully';`;
  }
}

module.exports = OllamaService;