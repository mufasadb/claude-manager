const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Fish Speech TTS Service with Voice Cloning
 * Supports voice cloning using reference audio files
 */
class FishSpeechTTS {
  constructor(baseUrl = 'http://100.83.40.11:8080') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // Longer timeout for voice cloning
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    this.tempDir = path.join(os.tmpdir(), 'claude-manager-fish-tts');
    this.referenceAudioPath = path.join(__dirname, '../reference-audio/sonnet29_reference_optimized.wav');
    this.referenceText = 'That time of year thou mayst in me behold when yellow leaves or none or few do hang upon those boughs which shake against the cold';
    
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.ensureDir(this.tempDir);
    } catch (error) {
      console.error('Error creating Fish TTS temp directory:', error);
    }
  }

  /**
   * Convert reference audio file to base64
   */
  async loadReferenceAudio(audioPath = this.referenceAudioPath) {
    try {
      if (!await fs.pathExists(audioPath)) {
        throw new Error(`Reference audio file not found: ${audioPath}`);
      }
      
      const audioBuffer = await fs.readFile(audioPath);
      return audioBuffer.toString('base64');
    } catch (error) {
      console.error('Error loading reference audio:', error);
      throw error;
    }
  }

  /**
   * Generate speech with voice cloning using Fish Speech TTS
   */
  async cloneVoice(text, options = {}) {
    const {
      referenceAudioPath = this.referenceAudioPath,
      referenceText = this.referenceText,
      top_p = 0.8,
      temperature = 0.7,
      repetition_penalty = 1.1,
      normalize = true,
      outputPath = null
    } = options;

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for TTS');
    }

    try {
      // Load reference audio as base64
      const referenceAudio = await this.loadReferenceAudio(referenceAudioPath);
      
      // Prepare request data using Fish Speech format
      const requestData = {
        text: text.trim(),
        references: [
          {
            audio: referenceAudio,
            text: referenceText
          }
        ],
        top_p,
        temperature,
        repetition_penalty,
        normalize
      };

      console.log(`Generating speech for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      
      const response = await this.client.post('/v1/tts', requestData, {
        responseType: 'arraybuffer'
      });

      // Save audio to file
      const timestamp = Date.now();
      const filename = outputPath || `cloned_voice_${timestamp}.wav`;
      const filepath = path.isAbsolute(filename) ? filename : path.join(this.tempDir, filename);
      
      await fs.writeFile(filepath, response.data);
      
      return {
        success: true,
        filepath,
        filename: path.basename(filepath),
        size: response.data.length,
        format: 'wav',
        text: text.trim()
      };
    } catch (error) {
      console.error('Error in voice cloning:', error.message);
      if (error.response?.data) {
        console.error('Server response:', error.response.data.toString());
      }
      throw new Error(`Voice cloning failed: ${error.message}`);
    }
  }

  /**
   * Generate speech and play immediately
   */
  async speak(text, options = {}) {
    try {
      const result = await this.cloneVoice(text, options);
      await this.playAudio(result.filepath);
      
      // Clean up temp file after playing (unless custom output path specified)
      if (!options.outputPath) {
        setTimeout(() => {
          this.cleanupFile(result.filepath);
        }, 2000);
      }
      
      return result;
    } catch (error) {
      console.error('Error speaking with cloned voice:', error.message);
      throw error;
    }
  }

  /**
   * Play audio file using system player
   */
  async playAudio(filepath) {
    return new Promise((resolve, reject) => {
      let command, args;
      
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

  /**
   * Health check for Fish Speech TTS service
   */
  async healthCheck() {
    try {
      // Test with a simple TTS request
      const testResult = await this.cloneVoice('Testing Fish Speech TTS service', {
        outputPath: path.join(this.tempDir, 'health_check.wav')
      });
      
      // Clean up test file
      setTimeout(() => this.cleanupFile(testResult.filepath), 1000);
      
      return {
        status: 'healthy',
        available: true,
        service: 'Fish Speech TTS',
        voiceCloning: true,
        referenceAudio: await fs.pathExists(this.referenceAudioPath)
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        available: false,
        error: error.message,
        service: 'Fish Speech TTS'
      };
    }
  }

  /**
   * Hook integration - announce events with cloned voice
   */
  async announceHookEvent(eventData, options = {}) {
    const { includeDetails = false } = options;

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
      await this.speak(message, options);
      return { success: true, message };
    } catch (error) {
      console.error('Error announcing hook event:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate speech for hook results with text processing
   */
  async speakHookResult(result, context = {}) {
    if (!result || typeof result !== 'string') {
      return { success: false, error: 'Invalid result to speak' };
    }

    // Process text for better TTS
    let message = result;
    
    // Limit length
    if (message.length > 300) {
      message = message.substring(0, 297) + '...';
    }

    // Clean up text for TTS
    message = message
      .replace(/[^\w\s.,!?-]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b(http|https):\/\/[^\s]+/g, 'link') // Replace URLs
      .trim();

    try {
      const result = await this.speak(message, context);
      return { success: true, message, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupFile(filepath) {
    try {
      if (await fs.pathExists(filepath)) {
        await fs.unlink(filepath);
      }
    } catch (error) {
      console.error('Error cleaning up TTS file:', error);
    }
  }

  /**
   * Clean up old temporary files
   */
  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours

      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filepath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old Fish TTS files:', error);
    }
  }

  /**
   * Generate multiple audio files from text array (batch processing)
   */
  async batchGenerate(textArray, options = {}) {
    const results = [];
    const { outputDir = this.tempDir, filePrefix = 'batch' } = options;

    await fs.ensureDir(outputDir);

    for (let i = 0; i < textArray.length; i++) {
      const text = textArray[i];
      const filename = `${filePrefix}_${i + 1}.wav`;
      const outputPath = path.join(outputDir, filename);

      try {
        const result = await this.cloneVoice(text, {
          ...options,
          outputPath
        });
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          text,
          index: i
        });
      }
    }

    return results;
  }
}

module.exports = FishSpeechTTS;