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
      
      // Try to generate with enhanced reliability
      const result = await this.generateWithEnhancedReliability(hookRequest);
      
      if (result.success) {
        return result.code;
      } else {
        // Return detailed error information instead of fallback code
        throw new Error(`Hook generation failed: ${result.error}. Suggestions: ${result.suggestions.join(', ')}`);
      }
      
    } catch (error) {
      console.error('Task tool execution failed:', error);
      throw new Error(`Task execution failed: ${error.message}`);
    }
  }

  // Generate hook code with enhanced reliability (no fallbacks)
  static async generateWithEnhancedReliability(hookRequest) {
    const errors = [];
    
    // Try Ollama first (local, fast, private)
    try {
      console.log('Attempting hook generation with Ollama...');
      const ollamaService = new OllamaService();
      
      // Check if Ollama is available
      const healthCheck = await ollamaService.healthCheck();
      if (healthCheck.available) {
        const result = await ollamaService.generateHookCode(hookRequest);
        
        if (result.success) {
          console.log('✅ Hook generated successfully with Ollama');
          return {
            success: true,
            code: result.code,
            provider: 'ollama',
            model: result.metadata?.modelUsed || 'llama3.2'
          };
        } else {
          errors.push({
            provider: 'ollama',
            error: result.error,
            suggestions: result.suggestions || []
          });
        }
      } else {
        errors.push({
          provider: 'ollama',
          error: healthCheck.error || 'Service not available',
          suggestions: healthCheck.suggestions || ['Start Ollama service: ollama serve']
        });
      }
    } catch (error) {
      errors.push({
        provider: 'ollama',
        error: error.message,
        suggestions: ['Check if Ollama is installed and running']
      });
    }
    
    // Try OpenRouter (cloud, reliable)
    try {
      console.log('Attempting hook generation with OpenRouter...');
      const openRouterService = new OpenRouterService();
      
      const result = await openRouterService.generateHookCode(hookRequest);
      
      if (result.success) {
        console.log('✅ Hook generated successfully with OpenRouter');
        return {
          success: true,
          code: result.code,
          provider: 'openrouter',
          model: result.model
        };
      } else {
        errors.push({
          provider: 'openrouter',
          error: result.error,
          suggestions: result.suggestions || []
        });
      }
    } catch (error) {
      errors.push({
        provider: 'openrouter',
        error: error.message,
        suggestions: ['Check OPENROUTER_API_KEY environment variable']
      });
    }
    
    // If both services failed, return comprehensive error information
    const allSuggestions = errors.flatMap(e => e.suggestions);
    const uniqueSuggestions = [...new Set(allSuggestions)];
    
    return {
      success: false,
      error: 'Hook code generation failed with all available services',
      details: {
        attempts: errors,
        totalProviders: 2,
        failureReasons: errors.map(e => `${e.provider}: ${e.error}`)
      },
      suggestions: uniqueSuggestions,
      troubleshooting: [
        'Ensure at least one LLM service is properly configured',
        'Check service availability and authentication',
        'Review error details for specific configuration issues'
      ]
    };
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
        ollama: ollamaMatch ? ollamaMatch[1] : require('../utils/service-config').serviceConfig.getOllamaUrl(),
        tts: ttsMatch ? ttsMatch[1] : require('../utils/service-config').serviceConfig.getTtsUrl()
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


  // Validate that at least one LLM service is available
  static async isAvailable() {
    try {
      // Check Ollama availability
      const ollamaService = new OllamaService();
      const ollamaHealth = await ollamaService.healthCheck();
      
      if (ollamaHealth.available) {
        return true;
      }
      
      // Check OpenRouter availability
      if (process.env.OPENROUTER_API_KEY) {
        return true;
      }
      
      // No fallbacks available - require at least one service
      return false;
    } catch (error) {
      return false;
    }
  }

  // Get tool information
  static getInfo() {
    return {
      name: 'Task',
      description: 'LLM-powered hook code generation with enhanced reliability (Ollama and OpenRouter)',
      version: '3.0.0',
      providers: ['ollama', 'openrouter'],
      fallbacksRemoved: true,
      reliability: 'enhanced',
      available: true
    };
  }
}

module.exports = TaskTool;