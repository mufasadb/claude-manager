# Fish Speech TTS Integration

This directory contains the Fish Speech TTS integration for Claude Manager, supporting voice cloning with reference audio.

## Files Structure

```
tts/
├── scripts/
│   ├── fish-speech-tts.js     # Main TTS class with voice cloning
│   ├── tts-utils.js           # Utility functions for easy integration
│   └── test-fish-tts.js       # Test script
├── reference-audio/
│   └── sonnet29_reference_optimized.wav  # Reference voice (Sonnet 29)
├── outputs/                   # Generated audio files
├── tts-config.js             # Configuration settings
├── fish_speech_tts_guide.md  # Original API guide
└── README.md                 # This file
```

## Quick Start

### Test TTS Service

```bash
# Test with default text
node scripts/test-fish-tts.js

# Test with custom text
node scripts/test-fish-tts.js "Hello, this is a test of voice cloning"
```

### Basic Usage

```javascript
const { quickTTS } = require('./scripts/tts-utils');

// Simple speech
await quickTTS.say("Hello world");

// Tool announcements
await quickTTS.announceToolStart("Read");
await quickTTS.announceToolEnd("Read", ["file1.js", "file2.js"]);

// Notifications
await quickTTS.notify("Task completed successfully");
```

### Advanced Usage

```javascript
const { FishSpeechTTS } = require('./scripts/fish-speech-tts');

const tts = new FishSpeechTTS();

// Generate speech with custom settings
const result = await tts.cloneVoice("Custom text", {
  temperature: 0.8,
  top_p: 0.9,
  outputPath: "/path/to/output.wav"
});

// Play immediately
await tts.speak("Text to speak");

// Batch generation
const texts = ["First sentence", "Second sentence", "Third sentence"];
const results = await tts.batchGenerate(texts, {
  outputDir: "./batch_output"
});
```

## Configuration

Edit `tts-config.js` to customize:

- **Service endpoint**: Default `http://100.83.40.11:8080`
- **Reference audio**: Voice to clone from
- **Voice parameters**: Temperature, top_p, etc.
- **Hook integration**: When to announce events
- **Cleanup settings**: Auto-delete old files

## Integration with Claude Manager

### Hook Integration

To enable TTS announcements for hooks, update your hook configurations:

```javascript
// In your hook definitions
{
  name: "TTS Announcement",
  pattern: "*",
  hookType: "PreToolUse",
  enabled: true,
  command: "node /path/to/experiments/tts/scripts/announce-hook.js"
}
```

### Environment Variables

Add to your `.env` or user environment:

```bash
# Enable TTS globally
CLAUDE_TTS_ENABLED=true

# TTS service endpoint
CLAUDE_TTS_ENDPOINT=http://100.83.40.11:8080

# Output directory for generated audio
CLAUDE_TTS_OUTPUT_DIR=/Users/yourname/claude-tts-outputs
```

## API Reference

### FishSpeechTTS Class

- `cloneVoice(text, options)` - Generate speech with voice cloning
- `speak(text, options)` - Generate and play immediately
- `playAudio(filepath)` - Play existing audio file
- `healthCheck()` - Check if service is available
- `announceHookEvent(eventData, options)` - Hook integration
- `batchGenerate(textArray, options)` - Generate multiple files

### TTSUtils Class

- `speak(text, options)` - Quick speak function
- `generate(text, outputPath, options)` - Generate without playing
- `announceHook(eventType, toolName, details)` - Hook announcements
- `setEnabled(enabled)` - Enable/disable TTS
- `isHealthy()` - Health check

### Quick Functions

- `quickTTS.say(text)` - Simple speech
- `quickTTS.announceToolStart(toolName)` - Tool start announcement
- `quickTTS.announceToolEnd(toolName, filePaths)` - Tool completion
- `quickTTS.notify(message)` - Notification
- `quickTTS.taskComplete()` - Task completion
- `quickTTS.enable()` / `quickTTS.disable()` - Global enable/disable

## Reference Audio

The current reference audio (`sonnet29_reference_optimized.wav`) contains Shakespeare's Sonnet 29. To use a different voice:

1. Record or obtain a clear WAV file of the target voice
2. Place it in the `reference-audio/` directory
3. Update the transcript in `tts-config.js`
4. Update the path in your TTS initialization

## Troubleshooting

### Service Not Available
- Check if Fish Speech TTS server is running at `http://100.83.40.11:8080`
- Verify network connectivity to the server
- Run health check: `node scripts/test-fish-tts.js`

### Audio Playback Issues
- Ensure `afplay` is available (macOS) or appropriate audio player
- Check audio file permissions
- Verify output directory exists and is writable

### Voice Quality Issues
- Ensure reference audio is clear and high quality
- Match the transcript exactly to the reference audio content
- Adjust temperature and top_p parameters for different voice characteristics
- Try different repetition_penalty values for speech flow

### Performance Issues
- Voice cloning takes longer than simple TTS (5-15 seconds typical)
- Use batch generation for multiple texts
- Enable cleanup to prevent disk space issues
- Consider caching frequently used phrases

## Examples

See the `test-fish-tts.js` script for working examples, or check the generated audio files in the `outputs/` directory after running tests.