/**
 * ActionFlow AI — Voice Transcription Service (Phase 1)
 *
 * Provides resilient, multi-engine speech-to-text:
 * 1. Whisper API (OpenAI / Local Whisper endpoint)
 * 2. Gemini Multimodal Audio Transcription (Gemini Flash audio understanding)
 * 3. Graceful offline/mock fallback for automated test suites
 */

import { config } from '../config.js';
import { auditLog } from './auditService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Normalizes input audio into a raw Buffer and mimeType
 * @param {string|Buffer} audioInput - Base64 string, data URL, or Buffer
 * @param {string} [mimeType='audio/webm']
 * @returns {{ buffer: Buffer, mimeType: string }}
 */
function parseAudioInput(audioInput, mimeType = 'audio/webm') {
  if (Buffer.isBuffer(audioInput)) {
    return { buffer: audioInput, mimeType };
  }

  if (typeof audioInput === 'string') {
    if (audioInput.startsWith('data:')) {
      const match = audioInput.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          buffer: Buffer.from(match[2], 'base64'),
          mimeType: match[1] || mimeType
        };
      }
    }
    // Plain base64 string
    return {
      buffer: Buffer.from(audioInput, 'base64'),
      mimeType
    };
  }

  throw new Error('Invalid audio input format. Expected base64 string or Buffer.');
}

/**
 * Transcribes audio using the OpenAI/Whisper HTTP API
 */
async function transcribeWithWhisper(buffer, mimeType, language) {
  const boundary = `----ActionFlowFormBoundary${Date.now()}`;
  const filename = `recording.${mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'webm'}`;

  // Build multipart/form-data payload
  const parts = [];
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `${config.whisper.model}\r\n`
  );

  if (language && language !== 'auto') {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `${language}\r\n`
    );
  }

  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `verbose_json\r\n`
  );

  const preBuffer = Buffer.from(parts.join(''), 'utf-8');
  const fileHeader = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`,
    'utf-8'
  );
  const postBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');

  const fullBody = Buffer.concat([preBuffer, fileHeader, buffer, postBuffer]);

  const response = await fetch(config.whisper.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.whisper.apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(fullBody.length)
    },
    body: fullBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API HTTP ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  return {
    transcript: (json.text || '').trim(),
    language: json.language || language || 'en',
    durationSeconds: json.duration || 0,
    confidence: 0.95,
    engine: 'whisper'
  };
}

/**
 * Transcribes audio using Gemini Multimodal Audio
 */
async function transcribeWithGemini(buffer, mimeType) {
  if (!config.gemini.apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: config.gemini.model || 'gemini-1.5-flash' });

  const base64Data = buffer.toString('base64');
  const prompt = `Transcribe this audio recording verbatim in its exact original spoken language.
Preserve Hindi, Hinglish, and English words accurately without translating.
Respond ONLY with a JSON object:
{
  "transcript": "exact verbatim transcript",
  "language": "hi|en|hinglish",
  "confidence": 0.95,
  "speakerCount": 1
}`;

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64Data,
        mimeType
      }
    },
    prompt
  ]);

  const text = result.response.text();
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    transcript: (parsed.transcript || '').trim(),
    language: parsed.language || 'en',
    durationSeconds: Math.round(buffer.length / 16000), // approximate
    confidence: parsed.confidence || 0.9,
    engine: 'gemini-multimodal'
  };
}

/**
 * Main transcription dispatcher
 * @param {Object} params
 * @param {string|Buffer} params.audio - Audio base64 string or Buffer
 * @param {string} [params.mimeType='audio/webm'] - MIME type
 * @param {string} [params.language='auto'] - Language hint ('auto', 'hi', 'en')
 * @param {string} [params.mode='quick'] - 'quick' | 'conversation' | 'meeting'
 * @param {string} [params.sessionId]
 * @returns {Promise<{ transcript: string, language: string, durationSeconds: number, confidence: number, engine: string }>}
 */
export async function transcribeAudio({ audio, mimeType = 'audio/webm', language = 'auto', mode = 'quick', sessionId = null }) {
  if (!audio) {
    throw new Error('No audio data provided for transcription.');
  }

  const { buffer, mimeType: resolvedMime } = parseAudioInput(audio, mimeType);

  // 1. Try Whisper if API key is configured
  if (config.whisper?.isAvailable) {
    try {
      const res = await transcribeWithWhisper(buffer, resolvedMime, language);
      await auditLog({
        event: 'AUDIO_TRANSCRIBED',
        sessionId,
        details: { engine: 'whisper', language: res.language, duration: res.durationSeconds, mode }
      });
      return res;
    } catch (err) {
      console.warn('[Transcription] Whisper failed, trying Gemini fallback:', err.message);
    }
  }

  // 2. Try Gemini Multimodal Audio if available
  if (config.gemini?.isAvailable) {
    try {
      const res = await transcribeWithGemini(buffer, resolvedMime);
      await auditLog({
        event: 'AUDIO_TRANSCRIBED',
        sessionId,
        details: { engine: 'gemini', language: res.language, mode }
      });
      return res;
    } catch (err) {
      console.warn('[Transcription] Gemini audio transcription failed:', err.message);
    }
  }

  // 3. Fallback: Simulation/Offline Mode for development or tests
  await auditLog({
    event: 'AUDIO_TRANSCRIBE_SIMULATED',
    sessionId,
    details: { bytes: buffer.length, mimeType: resolvedMime, mode }
  });

  return {
    transcript: 'Voice audio received successfully. Please confirm action.',
    language: language !== 'auto' ? language : 'en',
    durationSeconds: Math.max(1, Math.round(buffer.length / 32000)),
    confidence: 0.85,
    engine: 'simulation'
  };
}

