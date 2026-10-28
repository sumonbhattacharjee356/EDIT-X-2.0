import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Configure it in Settings > Secrets to use cloud AI features.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '35mb' }));

  // 1. AI Capability & Cost Disclosure Status
  app.get('/api/ai/status', (_req, res) => {
    const configured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      configured,
      disclosure:
        'All built-in EDIT X video, photo, motion, graphic, and audio tools run locally for free with zero watermarks. Cloud AI features invoke Google Gemini APIs on the server and are subject to your configured API key quota.',
    });
  });

  // 2. AI Video Editing Director & Smart Suggestions
  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const { prompt, projectSummary } = req.body as {
        prompt?: string;
        projectSummary?: string;
      };
      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Please describe your creative goal or edit style.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Creative Request: ${prompt}\nCurrent Timeline Context: ${projectSummary || 'New multi-track project'}`,
        config: {
          systemInstruction:
            'You are EDIT X Senior Creative Director and NLE Video Engineer. Return a concrete, actionable editing plan with cut pacing, recommended LUT preset (one of: none, teal-amber, kodak-2383, bleach-stadium, noir-silver, golden-velvia), transition style (crossfade, whip-pan, zoom-burst, dip-to-black), speed ramp multiplier (0.5 to 2.5), and 3 timed kinetic caption hooks.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Concise title for this edit direction' },
              summary: { type: Type.STRING, description: 'Editorial rationale and pacing notes' },
              recommendedLut: { type: Type.STRING, description: 'LUT preset ID' },
              recommendedTransition: { type: Type.STRING, description: 'Transition ID' },
              recommendedSpeed: { type: Type.NUMBER, description: 'Playback speed multiplier' },
              pacingTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 concrete editing actions',
              },
              captions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startTime: { type: Type.NUMBER },
                    duration: { type: Type.NUMBER },
                    text: { type: Type.STRING },
                  },
                  required: ['startTime', 'duration', 'text'],
                },
              },
            },
            required: [
              'title',
              'summary',
              'recommendedLut',
              'recommendedTransition',
              'recommendedSpeed',
              'pacingTips',
              'captions',
            ],
          },
        },
      });

      const raw = response.text || '{}';
      res.json(JSON.parse(raw));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI assistant request failed.';
      res.status(500).json({ error: message });
    }
  });

  // 3. AI Speech-to-Text Audio Transcription + Auto Subtitles & Translation
  app.post('/api/ai/subtitles', async (req, res) => {
    try {
      const { audioBase64, mimeType, scriptText, targetLanguage, totalDuration } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        scriptText?: string;
        targetLanguage?: string;
        totalDuration?: number;
      };

      const ai = getGenAIClient();
      const lang = targetLanguage || 'English';
      const durationSec = Math.max(4, Math.min(120, Number(totalDuration) || 12));

      let sourceTranscript = scriptText?.trim() || '';

      if (audioBase64 && mimeType) {
        const transcribeResp = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe the spoken words accurately.',
              },
            ],
          },
        });
        sourceTranscript = (transcribeResp.text || '').trim();
      }

      if (!sourceTranscript) {
        res.status(400).json({
          error: 'Provide an audio/video clip with speech or enter dialogue text to caption.',
        });
        return;
      }

      const timedResp = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Source text: "${sourceTranscript}"\nTarget language: ${lang}\nTotal timeline duration: ${durationSec} seconds.\nSegment into crisp timed subtitle cues (${lang}) spanning across 0 to ${durationSec}s.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedTranscript: { type: Type.STRING },
              language: { type: Type.STRING },
              cues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    text: { type: Type.STRING },
                  },
                  required: ['startTime', 'endTime', 'text'],
                },
              },
            },
            required: ['detectedTranscript', 'language', 'cues'],
          },
        },
      });

      res.json(JSON.parse(timedResp.text || '{}'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Subtitle generation failed.';
      res.status(500).json({ error: message });
    }
  });

  // 4. AI Voiceover Studio (Real Gemini 3.8 TTS WAV Output)
  app.post('/api/ai/tts', async (req, res) => {
    try {
      const { text, voiceName, style } = req.body as {
        text?: string;
        voiceName?: string;
        style?: string;
      };
      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Enter narration script text to synthesize.' });
        return;
      }

      const allowedVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];
      const selectedVoice = allowedVoices.includes(voiceName || '') ? voiceName! : 'Kore';

      const ai = getGenAIClient();
      const styledPrompt = style?.trim()
        ? `Speak in a ${style.trim()} tone: ${text.trim()}`
        : text.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: styledPrompt }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data
      )?.inlineData?.data;

      if (!base64Audio) {
        res.status(502).json({ error: 'Model did not return audio data.' });
        return;
      }

      res.json({
        audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
        voiceName: selectedVoice,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI voice synthesis failed.';
      res.status(500).json({ error: message });
    }
  });

  // 5. AI Multimodal Image Auto-Grade & Portrait Enhancement Analysis
  app.post('/api/ai/enhance-recipe', async (req, res) => {
    try {
      const { imageBase64, mimeType, intent } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        intent?: string;
      };
      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: 'Image payload is required for AI color analysis.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: `Analyze this photograph's luminance, dynamic range, white balance, and subject. Compute professional Lightroom-grade adjustments for intent: "${intent || 'Balanced editorial clarity and natural skin tones'}". Values must stay within safe ranges: exposure (-1.5 to 1.5), contrast (-40 to 50), highlights (-60 to 40), shadows (-40 to 60), saturation (-30 to 40), vibrance (-30 to 50), temperature (-40 to 40), tint (-25 to 25), skinSmoothing (0 to 60).`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              critique: { type: Type.STRING },
              exposure: { type: Type.NUMBER },
              contrast: { type: Type.NUMBER },
              highlights: { type: Type.NUMBER },
              shadows: { type: Type.NUMBER },
              saturation: { type: Type.NUMBER },
              vibrance: { type: Type.NUMBER },
              temperature: { type: Type.NUMBER },
              tint: { type: Type.NUMBER },
              skinSmoothing: { type: Type.NUMBER },
            },
            required: [
              'critique',
              'exposure',
              'contrast',
              'highlights',
              'shadows',
              'saturation',
              'vibrance',
              'temperature',
              'tint',
              'skinSmoothing',
            ],
          },
        },
      });

      res.json(JSON.parse(response.text || '{}'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI photo analysis failed.';
      res.status(500).json({ error: message });
    }
  });

  // 6. AI Vector Artwork & Motion Scene Generator
  app.post('/api/ai/scene-generator', async (req, res) => {
    try {
      const { prompt, aspectRatio } = req.body as {
        prompt?: string;
        aspectRatio?: string;
      };
      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Enter a visual description to generate artwork.' });
        return;
      }

      const dims =
        aspectRatio === '9:16'
          ? { w: 1080, h: 1920 }
          : aspectRatio === '1:1'
            ? { w: 1080, h: 1080 }
            : { w: 1920, h: 1080 };

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Create a rich, detailed, museum-grade layered SVG illustration for: "${prompt.trim()}".
ViewBox must be exactly "0 0 ${dims.w} ${dims.h}". Use rich gradients, atmospheric lighting shapes, crisp foreground silhouettes, and clean geometric composition. Do not include external <image> URLs or <script> tags.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              svgMarkup: { type: Type.STRING, description: 'Complete valid <svg ...>...</svg> string' },
              suggestedMotion: {
                type: Type.STRING,
                description: 'Suggested camera motion (zoom-in, pan-right, float, dramatic-push)',
              },
            },
            required: ['title', 'svgMarkup', 'suggestedMotion'],
          },
        },
      });

      res.json(JSON.parse(response.text || '{}'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI artwork generation failed.';
      res.status(500).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EDIT X Studio Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
