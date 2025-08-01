const FishSpeechTTS = require('./fish-speech-tts');
const path = require('path');

/**
 * TTS Utility functions for easy integration with Claude Manager
 */
class TTSUtils {
  constructor(options = {}) {
    this.tts = new FishSpeechTTS(options.baseUrl);
    this.enabled = options.enabled !== false; // Default to enabled
  }

  /**
   * Quick speak function - generates and plays audio immediately
   */
  async speak(text, options = {}) {
    if (!this.enabled) {
      console.log('[TTS] Disabled - would have said:', text);
      return { success: true, disabled: true };
    }

    try {
      return await this.tts.speak(text, options);
    } catch (error) {
      console.error('[TTS] Error speaking:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate audio file without playing
   */
  async generate(text, outputPath, options = {}) {
    if (!this.enabled) {
      console.log('[TTS] Disabled - would have generated audio for:', text);
      return { success: true, disabled: true };
    }

    try {
      return await this.tts.cloneVoice(text, { ...options, outputPath });
    } catch (error) {
      console.error('[TTS] Error generating audio:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Hook event announcements
   */
  async announceHook(eventType, toolName, details = {}) {
    if (!this.enabled) return { success: true, disabled: true };

    const eventData = {
      eventType,
      toolName,
      ...details
    };

    return await this.tts.announceHookEvent(eventData);
  }

  /**
   * Speak hook results with processing
   */
  async speakResult(result, context = {}) {
    if (!this.enabled) return { success: true, disabled: true };

    return await this.tts.speakHookResult(result, context);
  }

  /**
   * Enable/disable TTS
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[TTS] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Health check
   */
  async isHealthy() {
    try {
      const health = await this.tts.healthCheck();
      return health.available;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up old files
   */
  async cleanup() {
    if (this.tts.cleanupOldFiles) {
      await this.tts.cleanupOldFiles();
    }
  }
}

/**
 * Pre-configured TTS instance for Claude Manager
 */
let globalTTS = null;

/**
 * Initialize global TTS instance
 */
function initTTS(options = {}) {
  globalTTS = new TTSUtils(options);
  return globalTTS;
}

/**
 * Get global TTS instance (creates if not exists)
 */
function getTTS(options = {}) {
  if (!globalTTS) {
    globalTTS = initTTS(options);
  }
  return globalTTS;
}

/**
 * Quick functions for common use cases
 */
const quickTTS = {
  // Simple speak function
  say: async (text) => {
    const tts = getTTS();
    return await tts.speak(text);
  },

  // Announce tool usage
  announceToolStart: async (toolName) => {
    const tts = getTTS();
    return await tts.announceHook('PreToolUse', toolName);
  },

  announceToolEnd: async (toolName, filePaths = []) => {
    const tts = getTTS();
    return await tts.announceHook('PostToolUse', toolName, { filePaths });
  },

  // Notification
  notify: async (message) => {
    const tts = getTTS();
    return await tts.announceHook('Notification', null, { message });
  },

  // Task completion
  taskComplete: async () => {
    const tts = getTTS();
    return await tts.announceHook('Stop', null);
  },

  // Enable/disable globally
  enable: () => {
    const tts = getTTS();
    tts.setEnabled(true);
  },

  disable: () => {
    const tts = getTTS();
    tts.setEnabled(false);
  },

  // Health check
  isWorking: async () => {
    const tts = getTTS();
    return await tts.isHealthy();
  }
};

module.exports = {
  TTSUtils,
  initTTS,
  getTTS,
  quickTTS,
  FishSpeechTTS
};