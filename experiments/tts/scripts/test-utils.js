#!/usr/bin/env node

/**
 * Test the TTS utility functions
 */

const { quickTTS } = require('./tts-utils');

async function testUtils() {
  console.log('🧪 Testing TTS Utility Functions');
  console.log('================================');

  try {
    // Test health check
    console.log('🔍 Checking if TTS is working...');
    const isWorking = await quickTTS.isWorking();
    console.log('TTS Status:', isWorking ? '✅ Working' : '❌ Not available');
    
    if (!isWorking) {
      console.log('❌ TTS service not available, skipping tests');
      return;
    }

    // Test simple speak
    console.log('\n🗣️  Testing simple speech...');
    await quickTTS.say('Hello from the TTS utility functions');

    // Test tool announcements
    console.log('\n🔧 Testing tool announcements...');
    await quickTTS.announceToolStart('Read');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    await quickTTS.announceToolEnd('Read', ['file1.js', 'file2.js']);

    // Test notification
    console.log('\n📢 Testing notification...');
    await quickTTS.notify('This is a test notification from Claude Manager');

    // Test task completion
    console.log('\n✅ Testing task completion...');
    await quickTTS.taskComplete();

    console.log('\n🎉 All utility tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testUtils().catch(console.error);
}