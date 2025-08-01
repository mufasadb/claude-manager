/**
 * TTS Configuration for Claude Manager
 */

const path = require('path');

const TTS_CONFIG = {
  // Fish Speech TTS service endpoint
  baseUrl: 'http://100.83.40.11:8080',
  
  // Reference audio settings
  referenceAudio: {
    path: path.join(__dirname, 'reference-audio/sonnet29_reference_optimized.wav'),
    transcript: 'That time of year thou mayst in me behold when yellow leaves or none or few do hang upon those boughs which shake against the cold'
  },

  // Voice generation settings
  voice: {
    top_p: 0.8,
    temperature: 0.7,
    repetition_penalty: 1.1,
    normalize: true
  },

  // Output settings
  output: {
    directory: path.join(__dirname, 'outputs'),
    format: 'wav'
  },

  // Hook integration settings
  hooks: {
    enabled: false, // Set to true to enable TTS for hooks
    announceTools: true,
    announceResults: false, // Can be noisy
    maxResultLength: 200,
    eventTypes: {
      PreToolUse: true,
      PostToolUse: true,
      Notification: true,
      Stop: true,
      SubagentStop: false
    }
  },

  // Cleanup settings
  cleanup: {
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
    enabled: true
  }
};

module.exports = TTS_CONFIG;