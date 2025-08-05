const vm = require('vm');
const axios = require('axios');
const OllamaService = require('../integrations/ollama-service');
const TTSService = require('../integrations/tts-service');
const { serviceConfig } = require('../../utils/service-config');

class HookExecutor {
  constructor(userEnvVars = {}) {
    this.userEnvVars = userEnvVars;
    // Use centralized service configuration
    this.ollamaService = new OllamaService();
    this.ttsService = new TTSService();
    
    // Execution timeout (30 seconds)
    this.executionTimeout = 30000;
  }

  // Execute a hook with the provided event data
  async executeHook(hook, eventData, projectInfo = null) {
    const startTime = Date.now();
    
    try {
      // Create execution context
      const context = this.createExecutionContext(eventData, projectInfo, hook);
      
      // Execute the hook code
      const result = await this.runHookCode(hook.code, context);
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        hookId: hook.id,
        hookName: hook.name,
        result,
        executionTime,
        timestamp: Date.now()
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        hookId: hook.id,
        hookName: hook.name,
        error: error.message,
        stack: error.stack,
        executionTime,
        timestamp: Date.now()
      };
    }
  }

  // Create the execution context for the hook
  createExecutionContext(eventData, projectInfo, hook) {
    const context = {
      // Event data
      hookEvent: {
        type: eventData.eventType,
        toolName: eventData.toolName,
        filePaths: eventData.filePaths || [],
        context: eventData.context || {},
        timestamp: eventData.timestamp || Date.now()
      },
      
      // Project information (if available)
      projectInfo: projectInfo ? {
        name: projectInfo.name,
        path: projectInfo.path,
        config: projectInfo.config || {}
      } : null,
      
      // Environment variables (filtered for security)
      userEnv: this.getFilteredEnvVars(),
      
      // Hook metadata
      hookMeta: {
        id: hook.id,
        name: hook.name,
        scope: hook.scope || 'unknown'
      },
      
      // Utility functions
      utils: {
        log: this.createLogFunction(hook),
        sleep: this.createSleepFunction(),
        fetch: this.createFetchFunction(),
        playSound: this.createPlaySoundFunction(),
        speak: this.createSpeakFunction(),
        askOllama: this.createOllamaFunction(),
        notify: this.createNotifyFunction()
      },
      
      // Console for debugging
      console: {
        log: this.createLogFunction(hook),
        warn: this.createLogFunction(hook, 'warn'),
        error: this.createLogFunction(hook, 'error')
      }
    };

    return context;
  }

  // Execute hook code in a sandboxed VM
  async runHookCode(code, context) {
    return new Promise((resolve, reject) => {
      // Create a new VM context
      const vmContext = vm.createContext({
        ...context,
        // Add global functions
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        Promise: Promise,
        JSON: JSON,
        Date: Date,
        Math: Math,
        console: context.console,
        
        // Result handling
        resolve: resolve,
        reject: reject
      });

      // Wrap the user code to handle async execution
      const wrappedCode = `
        (async function() {
          try {
            ${code}
          } catch (error) {
            reject(error);
          }
        })().then(result => {
          if (result !== undefined) {
            resolve(result);
          } else {
            resolve('Hook executed successfully');
          }
        }).catch(reject);
      `;

      // Set execution timeout
      const timer = setTimeout(() => {
        reject(new Error('Hook execution timed out'));
      }, this.executionTimeout);

      try {
        // Execute the code
        vm.runInContext(wrappedCode, vmContext, {
          timeout: this.executionTimeout,
          displayErrors: true
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }

      // Clear timeout when execution completes
      const originalResolve = resolve;
      const originalReject = reject;
      
      resolve = (result) => {
        clearTimeout(timer);
        originalResolve(result);
      };
      
      reject = (error) => {
        clearTimeout(timer);
        originalReject(error);
      };
    });
  }

  // Create filtered environment variables (remove sensitive ones)
  getFilteredEnvVars() {
    const sensitiveKeys = [
      'API_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'PRIVATE_KEY',
      'AWS_SECRET_ACCESS_KEY', 'ANTHROPIC_API_KEY'
    ];
    
    const filtered = {};
    
    Object.entries(this.userEnvVars).forEach(([key, value]) => {
      const isSensitive = sensitiveKeys.some(sensitiveKey => 
        key.toUpperCase().includes(sensitiveKey)
      );
      
      if (!isSensitive) {
        filtered[key] = value;
      }
    });
    
    // Always include service URLs from centralized configuration
    const serviceUrls = serviceConfig.getAllServiceUrls();
    filtered.OLLAMA_SERVICE_URL = serviceUrls.ollama;
    filtered.TTS_SERVICE_URL = serviceUrls.tts;
    
    return filtered;
  }

  // Create logging function
  createLogFunction(hook, level = 'info') {
    return (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      console.log(`[Hook:${hook.id}:${level}] ${message}`);
      
      // TODO: Store logs in hook execution history
      return message;
    };
  }

  // Create sleep function
  createSleepFunction() {
    return (ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
    };
  }

  // Create fetch function (limited version)
  createFetchFunction() {
    return async (url, options = {}) => {
      try {
        // Security: Only allow specific domains or localhost
        const allowedDomains = [
          'localhost',
          '127.0.0.1',
          '100.83.40.11', // User's specific services
          'api.github.com',
          'slack.com',
          'discord.com'
        ];
        
        const urlObj = new URL(url);
        const isAllowed = allowedDomains.some(domain => 
          urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
        );
        
        if (!isAllowed) {
          throw new Error(`Domain ${urlObj.hostname} not allowed in hook context`);
        }
        
        const response = await axios({
          url,
          method: options.method || 'GET',
          headers: options.headers || {},
          data: options.body,
          timeout: 10000
        });
        
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          json: () => Promise.resolve(response.data),
          text: () => Promise.resolve(typeof response.data === 'string' ? response.data : JSON.stringify(response.data))
        };
      } catch (error) {
        throw new Error(`Fetch failed: ${error.message}`);
      }
    };
  }

  // Create play sound function
  createPlaySoundFunction() {
    return async (soundType = 'default') => {
      try {
        const soundMap = {
          'success': 'Task completed successfully',
          'error': 'An error occurred',
          'warning': 'Warning',
          'info': 'Information',
          'default': 'Notification'
        };
        
        const message = soundMap[soundType] || soundMap.default;
        await this.ttsService.speak(message, { speed: 1.2 });
        
        return `Played sound: ${soundType}`;
      } catch (error) {
        throw new Error(`Failed to play sound: ${error.message}`);
      }
    };
  }

  // Create speak function
  createSpeakFunction() {
    return async (text, options = {}) => {
      try {
        await this.ttsService.speak(text, options);
        return `Spoke: ${text}`;
      } catch (error) {
        throw new Error(`Failed to speak: ${error.message}`);
      }
    };
  }

  // Create Ollama integration function
  createOllamaFunction() {
    return async (prompt, options = {}) => {
      try {
        const result = await this.ollamaService.processHookPrompt(prompt, options);
        return result;
      } catch (error) {
        throw new Error(`Ollama request failed: ${error.message}`);
      }
    };
  }

  // Create notification function
  createNotifyFunction() {
    return async (message, type = 'info') => {
      try {
        // This could integrate with various notification systems
        console.log(`[Hook Notification:${type}] ${message}`);
        
        // Try to speak the notification
        try {
          await this.ttsService.speak(message);
        } catch (ttsError) {
          // TTS failure shouldn't break the hook
          console.warn('TTS notification failed:', ttsError.message);
        }
        
        return `Notification sent: ${message}`;
      } catch (error) {
        throw new Error(`Notification failed: ${error.message}`);
      }
    };
  }

  // Execute multiple hooks in sequence
  async executeHooks(hooks, eventData, projectInfo = null) {
    const results = [];
    
    for (const hook of hooks) {
      try {
        const result = await this.executeHook(hook, eventData, projectInfo);
        results.push(result);
        
        // Short delay between hooks to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          success: false,
          hookId: hook.id,
          hookName: hook.name,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
    
    return results;
  }

  // Test hook execution (dry run)
  async testHook(hook, mockEventData = {}) {
    const testEventData = {
      eventType: 'test',
      toolName: 'test-tool',
      filePaths: ['/test/file.js'],
      context: {},
      timestamp: Date.now(),
      ...mockEventData
    };
    
    return await this.executeHook(hook, testEventData);
  }

  // Update environment variables
  updateEnvVars(newEnvVars) {
    this.userEnvVars = { ...this.userEnvVars, ...newEnvVars };
    
    // Update service configuration and recreate services if URLs changed
    if (newEnvVars.OLLAMA_SERVICE_URL || newEnvVars.TTS_SERVICE_URL) {
      serviceConfig.updateConfig(newEnvVars);
      this.ollamaService = new OllamaService();
      this.ttsService = new TTSService();
    }
  }

  // Get execution stats
  getStats() {
    return {
      executionTimeout: this.executionTimeout,
      ollamaService: this.ollamaService.baseUrl,
      ttsService: this.ttsService.baseUrl
    };
  }
}

module.exports = HookExecutor;