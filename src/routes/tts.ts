import express from 'express';
import { OpenAITTSService } from '../services/ai/OpenAITTSService';

const router = express.Router();

/**
 * POST /api/tts/speech
 * Generate speech audio using OpenAI TTS
 */
router.post('/speech', async (req, res) => {
  try {
    const { text, voice = 'nova', quality = 'standard' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    if (text.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Text too long (max 4096 characters)'
      });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }

    const ttsService = new OpenAITTSService(openaiApiKey);
    
    const audioBuffer = quality === 'hd' 
      ? await ttsService.generateHighQualitySpeech(text, voice)
      : await ttsService.generateSpeech(text, voice);

    // Set appropriate headers for audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate speech'
    });
  }
});

export default router;