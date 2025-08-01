# Fish Speech TTS Voice Cloning Guide

## Service Details
- **URL**: http://100.83.40.11:8080/v1/tts
- **Method**: POST
- **Content-Type**: application/json

## Working API Format
```python
import requests
import base64

# Read reference audio file
with open('reference_audio.wav', 'rb') as f:
    reference_audio = base64.b64encode(f.read()).decode('utf-8')

# Make TTS request with voice cloning
response = requests.post('http://100.83.40.11:8080/v1/tts', json={
    'text': 'Text to synthesize in cloned voice',
    'references': [
        {
            'audio': reference_audio,  # Base64 encoded audio
            'text': 'Transcript of what the reference audio says'
        }
    ],
    'top_p': 0.8,
    'temperature': 0.7,
    'repetition_penalty': 1.1,
    'normalize': True
})

# Save output
if response.status_code == 200:
    with open('output.wav', 'wb') as f:
        f.write(response.content)
```

## Key Requirements
1. **references** must be an array (plural, not singular)
2. Each reference needs both **audio** (base64) and **text** (transcript)
3. Reference audio should be WAV format
4. Use Python requests library (curl has JSON escaping issues)

## Example Files
- Reference: `sonnet29_reference_optimized.wav` (Sonnet 29 voice)
- Output: `wizard_sonnet_voice.wav` (Generated with cloned voice)

## Play Audio
```bash
afplay output.wav
```