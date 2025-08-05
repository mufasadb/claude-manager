const axios = require('axios');
const { serviceConfig } = require('../../utils/service-config');

class OllamaService {
  constructor(baseUrl = null) {
    // Use centralized service configuration with fallback
    this.baseUrl = baseUrl || serviceConfig.getOllamaUrl();
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
    this.connectionPool = new Map(); // Track active connections
    this.modelCache = new Map(); // Cache model availability
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // Increased timeout for model operations
      headers: {
        'Content-Type': 'application/json'
      },
      // Connection pooling settings
      maxSockets: 10,
      keepAlive: true
    });

    // Add response interceptor for better error handling
    this.client.interceptors.response.use(
      response => response,
      error => this.handleAxiosError(error)
    );
  }

  // Enhanced error handling for axios errors
  handleAxiosError(error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Ollama service is not running. Please start Ollama first.');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Ollama service timed out. The model may be loading or overloaded.');
    } else if (error.response?.status === 404) {
      throw new Error('Requested model not found. Try pulling the model first.');
    } else if (error.response?.status === 500) {
      throw new Error('Ollama server error. Check server logs for details.');
    }
    throw error;
  }

  // Retry logic wrapper
  async withRetry(operation, context = '') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.message.includes('not running') || 
            error.message.includes('not found') ||
            error.response?.status === 404) {
          throw error;
        }
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`Ollama ${context} attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Ollama ${context} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  // Get available models with caching
  async getModels() {
    const cacheKey = 'models';
    const cached = this.modelCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }
    
    return this.withRetry(async () => {
      const response = await this.client.get('/api/tags');
      const models = response.data.models || [];
      
      // Cache the result
      this.modelCache.set(cacheKey, {
        data: models,
        timestamp: Date.now()
      });
      
      return models;
    }, 'model fetch');
  }

  // Check if a specific model is available
  async isModelAvailable(modelName) {
    try {
      const models = await this.getModels();
      return models.some(model => model.name === modelName || model.name.startsWith(modelName + ':'));
    } catch (error) {
      console.warn(`Could not check model availability for ${modelName}:`, error.message);
      return false;
    }
  }

  // Auto-pull model if not available
  async ensureModelAvailable(modelName) {
    const isAvailable = await this.isModelAvailable(modelName);
    
    if (!isAvailable) {
      console.log(`Model ${modelName} not found, attempting to pull...`);
      try {
        await this.pullModel(modelName);
        // Clear cache after pulling new model
        this.modelCache.delete('models');
        return true;
      } catch (error) {
        throw new Error(`Model ${modelName} is not available and could not be pulled: ${error.message}`);
      }
    }
    
    return true;
  }

  // Generate text completion with reliability improvements
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
      throw new Error('Prompt is required for text generation');
    }

    // Ensure model is available
    await this.ensureModelAvailable(model);

    return this.withRetry(async () => {
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
      
      // Validate response
      if (!response.data) {
        throw new Error('Empty response from Ollama');
      }
      
      if (stream) {
        return response.data;
      } else {
        const result = {
          response: response.data.response || '',
          model: response.data.model || model,
          created_at: response.data.created_at,
          done: response.data.done
        };
        
        // Validate we got actual content
        if (!result.response.trim()) {
          throw new Error('Ollama returned empty response content');
        }
        
        return result;
      }
    }, `text generation with model ${model}`);
  }

  // Chat completion with reliability improvements
  async chat(options = {}) {
    const {
      model = 'llama3.2',
      messages,
      stream = false,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 1000
    } = options;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Non-empty messages array is required for chat');
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        throw new Error('Each message must have role and content properties');
      }
    }

    // Ensure model is available
    await this.ensureModelAvailable(model);

    return this.withRetry(async () => {
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
      
      // Validate response
      if (!response.data) {
        throw new Error('Empty response from Ollama chat');
      }
      
      if (stream) {
        return response.data;
      } else {
        const result = {
          message: response.data.message,
          model: response.data.model || model,
          created_at: response.data.created_at,
          done: response.data.done
        };
        
        // Validate we got actual content
        if (!result.message?.content?.trim()) {
          throw new Error('Ollama chat returned empty message content');
        }
        
        return result;
      }
    }, `chat with model ${model}`);
  }

  // Pull a model with progress tracking
  async pullModel(modelName, progressCallback = null) {
    console.log(`Starting pull for model: ${modelName}`);
    
    return this.withRetry(async () => {
      // Use longer timeout for model pulling
      const pullClient = axios.create({
        baseURL: this.baseUrl,
        timeout: 300000, // 5 minutes for model downloads
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await pullClient.post('/api/pull', {
        name: modelName,
        stream: !!progressCallback
      });

      if (progressCallback && response.data.stream) {
        // Handle streaming progress updates
        return new Promise((resolve, reject) => {
          let lastStatus = '';
          
          response.data.on('data', (chunk) => {
            try {
              const data = JSON.parse(chunk.toString());
              if (data.status !== lastStatus) {
                progressCallback(data);
                lastStatus = data.status;
              }
              if (data.status === 'success' || data.done) {
                resolve(data);
              }
            } catch (parseError) {
              // Ignore parsing errors in streaming data
            }
          });
          
          response.data.on('error', reject);
          response.data.on('end', () => resolve(response.data));
        });
      }

      return response.data;
    }, `model pull for ${modelName}`);
  }

  // Enhanced health check with detailed status
  async healthCheck() {
    try {
      const startTime = Date.now();
      const response = await this.client.get('/api/tags');
      const responseTime = Date.now() - startTime;
      
      const models = response.data.models || [];
      const hasRecommendedModels = models.some(m => 
        m.name.includes('llama3.2') || 
        m.name.includes('codellama') || 
        m.name.includes('mistral')
      );

      return {
        status: 'healthy',
        available: true,
        responseTime,
        models: models.length,
        modelList: models.map(m => m.name),
        hasRecommendedModels,
        version: response.data.version || 'unknown',
        serverUrl: this.baseUrl
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        available: false,
        error: error.message,
        serverUrl: this.baseUrl,
        suggestions: this.getHealthSuggestions(error)
      };
    }
  }

  // Get suggestions based on health check errors
  getHealthSuggestions(error) {
    const suggestions = [];
    
    if (error.message.includes('not running')) {
      suggestions.push('Start Ollama service: `ollama serve`');
      suggestions.push('Check if Ollama is installed: `which ollama`');
    }
    
    if (error.message.includes('timed out')) {
      suggestions.push('Ollama may be starting up, wait 30 seconds and try again');
      suggestions.push('Check system resources (CPU/Memory)');
    }
    
    if (error.code === 'ECONNREFUSED') {
      suggestions.push(`Check if service is running on ${this.baseUrl}`);
      suggestions.push('Verify firewall settings if using remote Ollama');
    }
    
    return suggestions;
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
      
      // Provide detailed error information for troubleshooting
      const errorDetails = {
        type: error.constructor.name,
        message: error.message,
        context: {
          eventType,
          description,
          scope,
          modelUsed: 'llama3.2'
        }
      };

      // Add specific suggestions based on error type
      let suggestions = [];
      if (error.message.includes('not running')) {
        suggestions.push('Start Ollama service with: ollama serve');
        suggestions.push('Verify Ollama is installed and accessible');
      } else if (error.message.includes('not found')) {
        suggestions.push('Pull the required model: ollama pull llama3.2');
        suggestions.push('Check available models: ollama list');
      } else if (error.message.includes('empty response')) {
        suggestions.push('Try a different model or adjust generation parameters');
        suggestions.push('Check if the model is properly loaded');
      }

      return {
        success: false,
        error: error.message,
        details: errorDetails,
        suggestions,
        timestamp: Date.now()
      };
    }
  }

  // Build comprehensive prompt for hook code generation
  buildHookGenerationPrompt({ eventType, pattern, description, scope, projectInfo, userEnv, availableServices }) {
    const serviceUrls = serviceConfig.getAllServiceUrls();
    const ollamaUrl = availableServices.ollama || serviceUrls.ollama;
    const ttsUrl = availableServices.tts || serviceUrls.tts;

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

}

module.exports = OllamaService;