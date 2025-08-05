/**
 * Centralized Service Configuration Manager
 * 
 * Manages URLs and configuration for external services (Ollama, TTS, etc.)
 * with proper fallback hierarchy and environment variable support.
 */

const fs = require('fs');
const path = require('path');
const { parseEnvFile } = require('./env-utils');

class ServiceConfig {
  constructor() {
    this.config = null;
    this.loadConfig();
  }

  loadConfig() {
    // Load configuration from multiple sources in priority order
    const sources = [
      // 1. Process environment (highest priority)
      process.env,
      
      // 2. User environment file
      this.loadUserEnvFile(),
      
      // 3. Project environment file  
      this.loadProjectEnvFile(),
      
      // 4. Default configuration (lowest priority)
      this.getDefaults()
    ];

    // Merge configurations with priority order
    this.config = Object.assign({}, ...sources.reverse());
    
    console.log('Service configuration loaded:', {
      ollama: this.config.OLLAMA_SERVICE_URL,
      tts: this.config.TTS_SERVICE_URL,
      sources: sources.length
    });
  }

  loadUserEnvFile() {
    try {
      const userEnvPath = path.join(require('os').homedir(), '.claude-manager', 'user.env');
      if (fs.existsSync(userEnvPath)) {
        const content = fs.readFileSync(userEnvPath, 'utf8');
        return parseEnvFile(content);
      }
    } catch (error) {
      console.warn('Could not load user env file:', error.message);
    }
    return {};
  }

  loadProjectEnvFile() {
    try {
      const projectEnvPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(projectEnvPath)) {
        const content = fs.readFileSync(projectEnvPath, 'utf8');
        return parseEnvFile(content);
      }
    } catch (error) {
      console.warn('Could not load project env file:', error.message);
    }
    return {};
  }

  getDefaults() {
    return {
      // Default service URLs - can be overridden by environment variables
      OLLAMA_SERVICE_URL: 'http://localhost:11434',
      TTS_SERVICE_URL: 'http://localhost:8080',
      
      // Timeout settings
      OLLAMA_TIMEOUT: '60000',
      TTS_TIMEOUT: '30000',
      
      // Retry settings
      OLLAMA_MAX_RETRIES: '3',
      OLLAMA_RETRY_DELAY: '1000'
    };
  }

  // Get Ollama service URL with fallback
  getOllamaUrl(fallbackUrl = null) {
    return this.config.OLLAMA_SERVICE_URL || 
           fallbackUrl || 
           'http://localhost:11434';
  }

  // Get TTS service URL with fallback
  getTtsUrl(fallbackUrl = null) {
    return this.config.TTS_SERVICE_URL || 
           fallbackUrl || 
           'http://localhost:8080';
  }

  // Get service configuration for a specific service
  getServiceConfig(serviceName) {
    const serviceConfigs = {
      ollama: {
        url: this.getOllamaUrl(),
        timeout: parseInt(this.config.OLLAMA_TIMEOUT || '60000'),
        maxRetries: parseInt(this.config.OLLAMA_MAX_RETRIES || '3'),
        retryDelay: parseInt(this.config.OLLAMA_RETRY_DELAY || '1000')
      },
      tts: {
        url: this.getTtsUrl(),
        timeout: parseInt(this.config.TTS_TIMEOUT || '30000'),
        maxRetries: parseInt(this.config.TTS_MAX_RETRIES || '3'),
        retryDelay: parseInt(this.config.TTS_RETRY_DELAY || '1000')
      }
    };

    return serviceConfigs[serviceName.toLowerCase()] || null;
  }

  // Get all service URLs for templates and prompts
  getAllServiceUrls() {
    return {
      ollama: this.getOllamaUrl(),
      tts: this.getTtsUrl()
    };
  }

  // Reload configuration (useful for runtime updates)
  reload() {
    this.loadConfig();
  }

  // Get configuration summary for debugging
  getSummary() {
    return {
      ollama: this.getOllamaUrl(),
      tts: this.getTtsUrl(),
      configSources: [
        'process.env',
        '~/.claude-manager/user.env',
        './.env',
        'defaults'
      ],
      lastLoaded: new Date().toISOString()
    };
  }

  // Update configuration at runtime
  updateConfig(updates) {
    Object.assign(this.config, updates);
    console.log('Service configuration updated:', updates);
  }

  // Validate service URLs are accessible
  async validateServices() {
    const results = {};
    
    // Test Ollama
    try {
      const response = await fetch(`${this.getOllamaUrl()}/api/tags`, {
        method: 'GET',
        timeout: 5000
      });
      results.ollama = {
        url: this.getOllamaUrl(),
        accessible: response.ok,
        status: response.status
      };
    } catch (error) {
      results.ollama = {
        url: this.getOllamaUrl(),
        accessible: false,
        error: error.message
      };
    }

    // Test TTS
    try {
      const response = await fetch(`${this.getTtsUrl()}/health`, {
        method: 'GET',
        timeout: 5000
      });
      results.tts = {
        url: this.getTtsUrl(),
        accessible: response.ok,
        status: response.status
      };
    } catch (error) {
      results.tts = {
        url: this.getTtsUrl(),
        accessible: false,
        error: error.message
      };
    }

    return results;
  }
}

// Create singleton instance
const serviceConfig = new ServiceConfig();

module.exports = {
  ServiceConfig,
  serviceConfig
};