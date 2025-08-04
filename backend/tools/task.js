/**
 * Task Tool with Real LLM Integration for Hook Generation
 * 
 * This provides LLM-powered hook code generation using:
 * - Primary: Ollama (local, fast, private)
 * - Fallback: OpenRouter (cloud, reliable)
 */

const OllamaService = require('../services/integrations/ollama-service');
const OpenRouterService = require('../services/openrouter-service');

class TaskTool {
  static async execute(request) {
    try {
      const { description, prompt, subagent_type } = request;
      
      // Extract hook parameters from the comprehensive prompt
      const hookRequest = this.parseHookRequest(prompt);
      
      console.log('Generating hook code with LLM integration...');
      console.log('Hook request:', {
        eventType: hookRequest.eventType,
        description: hookRequest.description,
        scope: hookRequest.scope
      });
      
      // Try to generate with real LLM services
      const result = await this.generateWithLLMFallback(hookRequest);
      
      return result;
      
    } catch (error) {
      console.error('Task tool execution failed:', error);
      throw new Error(`Task execution failed: ${error.message}`);
    }
  }

  // Generate hook code with LLM fallback system
  static async generateWithLLMFallback(hookRequest) {
    let result = null;
    
    // Try Ollama first (local, fast, private)
    try {
      console.log('Attempting hook generation with Ollama...');
      const ollamaService = new OllamaService();
      
      // Check if Ollama is available
      const healthCheck = await ollamaService.healthCheck();
      if (healthCheck.available) {
        result = await ollamaService.generateHookCode(hookRequest);
        
        if (result.success) {
          console.log('✅ Hook generated successfully with Ollama');
          return result.code;
        } else {
          console.log('⚠️ Ollama generation failed:', result.error);
        }
      } else {
        console.log('⚠️ Ollama service not available:', healthCheck.error);
      }
    } catch (error) {
      console.log('⚠️ Ollama generation error:', error.message);
    }
    
    // Fallback to OpenRouter (cloud, reliable)
    try {
      console.log('Falling back to OpenRouter for hook generation...');
      const openRouterService = new OpenRouterService();
      
      result = await openRouterService.generateHookCode(hookRequest);
      
      if (result.success) {
        console.log('✅ Hook generated successfully with OpenRouter');
        return result.code;
      } else {
        console.log('⚠️ OpenRouter generation failed:', result.error);
        // Use fallback code if available
        if (result.fallbackCode) {
          console.log('📝 Using fallback template code');
          return result.fallbackCode;
        }
      }
    } catch (error) {
      console.log('⚠️ OpenRouter generation error:', error.message);
    }
    
    // Final fallback - generate basic template
    console.log('🔄 Using final fallback template generation');
    return this.generateBasicTemplate(hookRequest);
  }

  // Parse hook request from the comprehensive prompt
  static parseHookRequest(prompt) {
    // Extract information from the HookGenerator prompt format
    const eventTypeMatch = prompt.match(/Hook Type: (\w+)/);
    const patternMatch = prompt.match(/Event Pattern: ([^\n]+)/);
    const scopeMatch = prompt.match(/Scope: (\w+)/);
    const descriptionMatch = prompt.match(/User Description: ([^\n]+)/);
    const projectInfoMatch = prompt.match(/PROJECT CONTEXT:\s*Project: ([^\n]+) at ([^\n]+)/);
    const ollamaMatch = prompt.match(/Ollama LLM API: ([^\n]+)/);
    const ttsMatch = prompt.match(/TTS Service: ([^\n]+)/);
    
    const hookRequest = {
      eventType: eventTypeMatch ? eventTypeMatch[1] : 'Notification',
      pattern: patternMatch ? patternMatch[1] : '*',
      scope: scopeMatch ? scopeMatch[1] : 'user',
      description: descriptionMatch ? descriptionMatch[1] : 'Custom hook',
      projectInfo: null,
      userEnv: {},
      availableServices: {
        ollama: ollamaMatch ? ollamaMatch[1] : 'http://100.83.40.11:11434',
        tts: ttsMatch ? ttsMatch[1] : 'http://100.83.40.11:8080'
      }
    };
    
    // Parse project info if available
    if (projectInfoMatch) {
      hookRequest.projectInfo = {
        name: projectInfoMatch[1],
        path: projectInfoMatch[2],
        config: {}
      };
    }
    
    return hookRequest;
  }

  // Generate basic template as final fallback
  static generateBasicTemplate(hookRequest) {
    const { eventType, description } = hookRequest;
    
    const templates = {
      'PreToolUse': `// Pre-tool hook: ${description}
try {
  console.log('Pre-tool event triggered:', hookEvent.toolName);
  
  if (hookEvent.toolName === 'Write' || hookEvent.toolName === 'Edit') {
    console.log('Files to be modified:', hookEvent.filePaths);
    await utils.notify('About to modify files: ' + hookEvent.filePaths.join(', '), 'info');
  }
  
  return 'Pre-tool validation completed';
} catch (error) {
  console.error('Pre-tool hook error:', error);
  return 'Pre-tool hook failed: ' + error.message;
}`,

      'PostToolUse': `// Post-tool hook: ${description}
try {
  console.log('Post-tool event triggered:', hookEvent.toolName);
  
  if (hookEvent.filePaths && hookEvent.filePaths.length > 0) {
    console.log('Files modified:', hookEvent.filePaths);
    await utils.notify('Completed ' + hookEvent.toolName + ' on ' + hookEvent.filePaths.length + ' files', 'success');
    
    // Optional: Use Ollama for AI summary
    if (hookEvent.toolName === 'Write' || hookEvent.toolName === 'Edit') {
      try {
        const summary = await utils.askOllama(
          'Briefly describe what was accomplished: ' + hookEvent.toolName + ' was used on files: ' + hookEvent.filePaths.join(', '),
          { model: 'llama3.2', max_tokens: 100 }
        );
        console.log('AI Summary:', summary);
      } catch (aiError) {
        console.log('AI summary failed:', aiError.message);
      }
    }
  }
  
  return 'Post-tool processing completed';
} catch (error) {
  console.error('Post-tool hook error:', error);
  return 'Post-tool hook failed: ' + error.message;
}`,

      'Notification': `// Notification hook: ${description}
try {
  const message = hookEvent.context?.message || 'Notification received';
  console.log('Notification received:', message);
  
  // Process the notification
  await utils.notify(message, 'info');
  
  // Optional: Speak the notification if it contains important keywords
  if (message.toLowerCase().includes('error') || message.toLowerCase().includes('complete')) {
    await utils.speak(message);
  }
  
  return 'Notification processed: ' + message;
} catch (error) {
  console.error('Notification hook error:', error);
  return 'Notification hook failed: ' + error.message;
}`,

      'Stop': `// Task completion hook: ${description}
try {
  console.log('Claude task completed at:', new Date().toISOString());
  
  // Provide completion feedback
  await utils.playSound('success');
  await utils.speak('Claude task completed successfully');
  
  if (projectInfo) {
    console.log('Task completed in project:', projectInfo.name);
    await utils.notify('Claude task completed in ' + projectInfo.name, 'success');
  } else {
    await utils.notify('Claude task completed', 'success');
  }
  
  return 'Task completion notification sent';
} catch (error) {
  console.error('Task completion hook error:', error);
  return 'Task completion hook failed: ' + error.message;
}`,

      'SubagentStop': `// Subagent completion hook: ${description}
try {
  console.log('Subagent task completed at:', new Date().toISOString());
  
  await utils.playSound('success');
  await utils.notify('Subagent task completed', 'success');
  
  return 'Subagent completion processed';
} catch (error) {
  console.error('Subagent completion hook error:', error);
  return 'Subagent completion hook failed: ' + error.message;
}`
    };
    
    return templates[eventType] || `// Generic hook: ${description}
try {
  console.log('Hook triggered:', hookEvent.type);
  console.log('Event data:', JSON.stringify(hookEvent, null, 2));
  
  if (hookEvent.toolName) {
    await utils.notify('Hook processed for ' + hookEvent.toolName, 'info');
  }
  
  return 'Hook executed successfully';
} catch (error) {
  console.error('Hook execution error:', error);
  return 'Hook failed: ' + error.message;
}`;
  }

  // Validate that LLM services are available
  static async isAvailable() {
    try {
      // Check Ollama availability
      const ollamaService = new OllamaService();
      const ollamaHealth = await ollamaService.healthCheck();
      
      if (ollamaHealth.available) {
        return true;
      }
      
      // Check OpenRouter availability
      const openRouterService = new OpenRouterService();
      if (process.env.OPENROUTER_API_KEY) {
        return true;
      }
      
      // At least fallback templates are always available
      return true;
    } catch (error) {
      // Fallback templates are always available
      return true;
    }
  }

  // Get tool information
  static getInfo() {
    return {
      name: 'Task',
      description: 'LLM-powered hook code generation with Ollama and OpenRouter fallback',
      version: '2.0.0',
      providers: ['ollama', 'openrouter', 'templates'],
      available: true
    };
  }
}

module.exports = TaskTool;