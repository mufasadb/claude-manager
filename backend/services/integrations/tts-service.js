const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

class TTSService {
  constructor(baseUrl = 'http://100.83.40.11:8080') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    this.tempDir = path.join(os.tmpdir(), 'claude-manager-tts');
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.ensureDir(this.tempDir);
    } catch (error) {
      console.error('Error creating TTS temp directory:', error);
    }
  }

  // Convert text to speech and return audio file path
  async textToSpeech(text, options = {}) {
    const {
      voice = 'default',
      speed = 1.0,
      format = 'wav'
    } = options;

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for TTS');
    }

    try {
      const requestData = {
        text: text.trim(),
        voice,
        speed,
        format
      };

      const response = await this.client.post('/v1/tts', requestData, {
        responseType: 'arraybuffer'
      });

      // Save audio to temp file
      const filename = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${format}`;
      const filepath = path.join(this.tempDir, filename);
      
      await fs.writeFile(filepath, response.data);
      
      return {
        success: true,
        filepath,
        filename,
        size: response.data.length,
        format
      };
    } catch (error) {
      console.error('Error converting text to speech:', error.message);
      throw new Error(`TTS conversion failed: ${error.message}`);
    }
  }

  // Convert text to speech and play immediately
  async speak(text, options = {}) {
    try {
      const result = await this.textToSpeech(text, options);
      await this.playAudio(result.filepath);
      
      // Clean up temp file after playing
      setTimeout(() => {
        this.cleanupFile(result.filepath);
      }, 1000);
      
      return result;
    } catch (error) {
      console.error('Error speaking text:', error.message);
      throw error;
    }
  }

  // Play audio file using system audio player
  async playAudio(filepath) {
    return new Promise((resolve, reject) => {
      let command, args;
      
      // Determine audio player based on platform
      switch (process.platform) {
        case 'darwin': // macOS
          command = 'afplay';
          args = [filepath];
          break;
        case 'linux':
          command = 'aplay';
          args = [filepath];
          break;
        case 'win32':
          command = 'powershell';
          args = ['-c', `(New-Object Media.SoundPlayer "${filepath}").PlaySync()`];
          break;
        default:
          reject(new Error(`Unsupported platform: ${process.platform}`));
          return;
      }

      const player = spawn(command, args);
      
      player.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Audio player exited with code ${code}`));
        }
      });
      
      player.on('error', (error) => {
        reject(new Error(`Failed to play audio: ${error.message}`));
      });
    });
  }

  // Get available voices
  async getVoices() {
    try {
      const response = await this.client.get('/v1/voices');
      return response.data.voices || [];
    } catch (error) {
      console.error('Error fetching TTS voices:', error.message);
      return [];
    }
  }

  // Health check
  async healthCheck() {
    try {
      const response = await this.client.get('/v1/health');
      return {
        status: 'healthy',
        available: true,
        service: response.data
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        available: false,
        error: error.message
      };
    }
  }

  // Hook system integration helpers
  async announceHookEvent(eventData, options = {}) {
    const {
      voice = 'default',
      includeDetails = false
    } = options;

    let message = '';
    
    switch (eventData.eventType) {
      case 'PreToolUse':
        message = `About to execute ${eventData.toolName || 'tool'}`;
        break;
      case 'PostToolUse':
        message = `Completed ${eventData.toolName || 'tool'}`;
        if (includeDetails && eventData.filePaths?.length) {
          message += ` on ${eventData.filePaths.length} file${eventData.filePaths.length > 1 ? 's' : ''}`;
        }
        break;
      case 'Notification':
        message = eventData.message || 'Claude Code notification';
        break;
      case 'Stop':
        message = 'Claude task completed';
        break;
      default:
        message = `Claude Code ${eventData.eventType} event`;
    }

    try {
      await this.speak(message, { voice });
      return { success: true, message };
    } catch (error) {
      console.error('Error announcing hook event:', error);
      return { success: false, error: error.message };
    }
  }

  // Create notification sounds for different event types
  async playNotificationSound(eventType) {
    const soundMap = {
      'PreToolUse': 'Tool starting',
      'PostToolUse': 'Tool completed',
      'Notification': 'Notification',
      'Stop': 'Task finished',
      'SubagentStop': 'Subagent completed'
    };

    const message = soundMap[eventType] || 'Event occurred';
    
    try {
      await this.speak(message, { 
        voice: 'default',
        speed: 1.2 
      });
      return { success: true };
    } catch (error) {
      console.error('Error playing notification sound:', error);
      return { success: false, error: error.message };
    }
  }

  // Clean up temp files
  async cleanupFile(filepath) {
    try {
      if (await fs.pathExists(filepath)) {
        await fs.unlink(filepath);
      }
    } catch (error) {
      console.error('Error cleaning up TTS file:', error);
    }
  }

  // Clean up old temp files (older than 1 hour)
  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour

      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filepath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old TTS files:', error);
    }
  }

  // Custom TTS for hook-generated messages
  async speakHookResult(result, context = {}) {
    if (!result || typeof result !== 'string') {
      return { success: false, error: 'Invalid result to speak' };
    }

    // Limit message length for TTS
    let message = result;
    if (message.length > 200) {
      message = message.substring(0, 197) + '...';
    }

    // Remove special characters that might cause TTS issues
    message = message.replace(/[^\w\s.,!?-]/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      await this.speak(message, {
        voice: context.voice || 'default',
        speed: context.speed || 1.0
      });
      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = TTSService;