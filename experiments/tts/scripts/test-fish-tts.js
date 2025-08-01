#!/usr/bin/env node

/**
 * Test script for Fish Speech TTS with voice cloning
 * Usage: node test-fish-tts.js [text]
 */

const FishSpeechTTS = require('./fish-speech-tts');
const path = require('path');

async function main() {
  const tts = new FishSpeechTTS();
  
  // Get text from command line args or use default
  const text = process.argv.slice(2).join(' ') || 
    'Hello! This is a test of the Fish Speech TTS voice cloning system. The voice should sound like the reference audio.';

  console.log('🐟 Fish Speech TTS Test');
  console.log('======================');
  console.log(`Text to synthesize: "${text}"`);
  console.log('');

  try {
    // Health check first
    console.log('🔍 Checking TTS service health...');
    const health = await tts.healthCheck();
    console.log('Health status:', health);
    console.log('');

    if (!health.available) {
      console.error('❌ TTS service is not available');
      process.exit(1);
    }

    // Generate and play audio
    console.log('🎤 Generating speech with cloned voice...');
    const result = await tts.cloneVoice(text, {
      outputPath: path.join(__dirname, '../outputs', `test_${Date.now()}.wav`)
    });

    console.log('✅ Speech generated successfully!');
    console.log('📁 File saved to:', result.filepath);
    console.log('📏 File size:', result.size, 'bytes');
    console.log('');

    // Play the audio
    console.log('🔊 Playing audio...');
    await tts.playAudio(result.filepath);
    console.log('✅ Audio playback completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Handle CLI usage
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };