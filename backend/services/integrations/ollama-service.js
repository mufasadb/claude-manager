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
}

module.exports = OllamaService;