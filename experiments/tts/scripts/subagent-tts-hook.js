#!/usr/bin/env node

/**
 * TTS Hook for SubagentStop events
 * Announces "sub agent finished" when a sub-agent completes
 */

const { quickTTS } = require('./tts-utils');

async function announceSubagentFinished() {
  console.log('[SubAgent TTS] Sub-agent completion detected');
  
  try {
    // Check if TTS is available
    const isWorking = await quickTTS.isWorking();
    if (!isWorking) {
      console.log('[SubAgent TTS] TTS service not available, skipping announcement');
      return;
    }

    // Announce sub-agent completion
    await quickTTS.say('Sub agent finished');
    console.log('[SubAgent TTS] ✅ Announcement completed');
    
  } catch (error) {
    console.error('[SubAgent TTS] ❌ Error:', error.message);
    // Don't exit with error code to avoid breaking the hook chain
  }
}

// Handle the hook event
if (require.main === module) {
  announceSubagentFinished().catch(console.error);
}

module.exports = { announceSubagentFinished };