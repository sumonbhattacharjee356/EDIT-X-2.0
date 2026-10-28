import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Captions,
  CheckCircle2,
  Download,
  FileAudio,
  Sparkles,
  Volume2,
  Wand2,
} from 'lucide-react';
import {
  detectHighlightsAndActiveSegments,
  LutPresetId,
  TransitionType,
} from '../engine/timelineEngine';
import { synthesizePresetSamples } from '../engine/audioEngine';

interface AICreativeStudioProps {
  initialTool?: 'copilot' | 'subtitles' | 'tts' | 'scene' | 'highlights';
  onBackToDashboard: () => void;
  onApplyAiEditPlanToVideo: (plan: {
    title: string;
    lut: LutPresetId;
    transition: TransitionType;
    speed: number;
    captions: Array<{ startTime: number; duration: number; text: string }>;
  }) => void;
  onInjectSubtitlesToVideo: (
    cues: Array<{ startTime: number; endTime: number; text: string }>
  ) => void;
  onSendVoiceoverToAudioStudio: (name: string, wavDataUrl: string) => void;
}

export const AICreativeStudio: React.FC<AICreativeStudioProps> = ({
  initialTool = 'copilot',
  onBackToDashboard,
  onApplyAiEditPlanToVideo,
  onInjectSubtitlesToVideo,
  onSendVoiceoverToAudioStudio,
}) => {
  const [activeTool, setActiveTool] = useState<
    'copilot' | 'subtitles' | 'tts' | 'scene' | 'highlights'
  >(initialTool);
  const [apiStatus, setApiStatus] = useState<{ configured: boolean; disclosure: string } | null>(
    null
  );

  // 1. AI Co-Pilot state
  const [copilotPrompt, setCopilotPrompt] = useState(
    'Fast-paced Champions League football striker montage with dramatic slow-motion impact and bold captions'
  );
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState('');
  const [copilotResult, setCopilotResult] = useState<{
    title: string;
    summary: string;
    recommendedLut: string;
    recommendedTransition: string;
    recommendedSpeed: number;
    pacingTips: string[];
    captions: Array<{ startTime: number; duration: number; text: string }>;
  } | null>(null);

  // 2. Subtitles & Speech-to-Text state
  const [subScript, setSubScript] = useState(
    'Every frame counts when you step under the stadium lights. Precision, speed, and limitless vision.'
  );
  const [subLang, setSubLang] = useState('English');
  const [subAudioFile, setSubAudioFile] = useState<{ base64: string; mime: string; name: string } | null>(
    null
  );
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');
  const [subCues, setSubCues] = useState<
    Array<{ startTime: number; endTime: number; text: string }>
  >([]);

  // 3. AI Voiceover TTS state
  const [ttsScript, setTtsScript] = useState(
    'Welcome to Edit X Studio. Create cinema-grade edits without limits.'
  );
  const [ttsVoice, setTtsVoice] = useState('Kore');
  const [ttsStyle, setTtsStyle] = useState('Confident cinematic trailer narrator');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

  // 4. AI Vector Scene & Artwork Generator state
  const [scenePrompt, setScenePrompt] = useState(
    'Minimalist futuristic stadium floodlight silhouette over violet dusk horizon with geometric rays'
  );
  const [sceneAspect, setSceneAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState('');
  const [sceneResult, setSceneResult] = useState<{
    title: string;
    svgMarkup: string;
    suggestedMotion: string;
  } | null>(null);

  // 5. Local DSP Smart Highlight & Silence Detector state
  const [highlightPreset, setHighlightPreset] = useState('stadium-trap');
  const [dspReport, setDspReport] = useState<{
    activeSegments: Array<{ start: number; end: number }>;
    highlights: Array<{ time: number; score: number }>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then((d) => setApiStatus(d))
      .catch(() => null);
  }, []);

  const runCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotPrompt.trim()) return;
    setCopilotLoading(true);
    setCopilotError('');
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: copilotPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Co-Pilot request failed.');
      setCopilotResult(data);
    } catch (err: unknown) {
      setCopilotError(err instanceof Error ? err.message : 'AI Co-Pilot failed.');
    } finally {
      setCopilotLoading(false);
    }
  };

  const runSubtitles = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubLoading(true);
    setSubError('');
    try {
      const res = await fetch('/api/ai/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: subAudioFile?.base64,
          mimeType: subAudioFile?.mime,
          scriptText: subScript,
          targetLanguage: subLang,
          totalDuration: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Subtitle generation failed.');
      setSubCues(data.cues || []);
    } catch (err: unknown) {
      setSubError(err instanceof Error ? err.message : 'Subtitle generation failed.');
    } finally {
      setSubLoading(false);
    }
  };

  const runVoiceoverTts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttsScript.trim()) return;
    setTtsLoading(true);
    setTtsError('');
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsScript,
          voiceName: ttsVoice,
          style: ttsStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voice generation failed.');
      setTtsAudioUrl(data.audioDataUrl);
    } catch (err: unknown) {
      setTtsError(err instanceof Error ? err.message : 'Voice synthesis failed.');
    } finally {
      setTtsLoading(false);
    }
  };

  const runSceneGenerator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenePrompt.trim()) return;
    setSceneLoading(true);
    setSceneError('');
    try {
      const res = await fetch('/api/ai/scene-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: scenePrompt,
          aspectRatio: sceneAspect,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scene generation failed.');
      setSceneResult(data);
    } catch (err: unknown) {
      setSceneError(err instanceof Error ? err.message : 'Scene generation failed.');
    } finally {
      setSceneLoading(false);
    }
  };

  const runLocalDspAnalysis = () => {
    const pcm = synthesizePresetSamples(highlightPreset, 8000);
    const windowSec = 0.25;
    const winSamples = Math.floor(8000 * windowSec);
    const rmsEnv: number[] = [];
    for (let i = 0; i < pcm.left.length; i += winSamples) {
      let sumSq = 0;
      const sliceEnd = Math.min(pcm.left.length, i + winSamples);
      for (let j = i; j < sliceEnd; j++) {
        sumSq += pcm.left[j] * pcm.left[j];
      }
      rmsEnv.push(Math.sqrt(sumSq / Math.max(1, sliceEnd - i)));
    }
    setDspReport(detectHighlightsAndActiveSegments(rmsEnv, windowSec, 0.05, 0.78));
  };

  const exportSrtFile = () => {
    if (subCues.length === 0) return;
    const fmtSrt = (sec: number) => {
      const ms = Math.floor((sec % 1) * 1000);
      const s = Math.floor(sec) % 60;
      const m = Math.floor(sec / 60) % 60;
      const h = Math.floor(sec / 3600);
      const p2 = (n: number) => String(n).padStart(2, '0');
      return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, '0')}`;
    };
    const srt = subCues
      .map(
        (c, i) => `${i + 1}\n${fmtSrt(c.startTime)} --> ${fmtSrt(c.endTime)}\n${c.text}\n`
      )
      .join('\n');
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EDIT_X_Subtitles_${subLang}.srt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#09090D] text-[#F8FAFC] flex flex-col">
      <header className="h-14 px-4 sm:px-8 bg-[#0E0E15] border-b border-white/[0.08] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-slate-200 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </button>
          <h1 className="font-display text-base font-bold text-white">EDIT X · AI Creative Studio</h1>
        </div>

        <span className="text-xs text-slate-400 hidden sm:inline">
          Real Server-Side Gemini 3.8 + Local DSP · Zero Mock Outputs
        </span>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left AI Tool Navigation */}
        <aside className="lg:col-span-4 space-y-3">
          {[
            {
              id: 'copilot',
              title: 'AI Video Editing Co-Pilot',
              desc: 'Generate cut pacing, speed-ramps, LUTs & kinetic hooks via Gemini 3.8 Flash',
              icon: Wand2,
            },
            {
              id: 'subtitles',
              title: 'Speech-to-Text & Translation',
              desc: 'Transcribe audio via Gemini 3.5 Transcribe or translate timed SRT captions',
              icon: Captions,
            },
            {
              id: 'tts',
              title: 'AI Voiceover Studio (WAV)',
              desc: 'Synthesize studio narration with Gemini 3.8 TTS prebuilt voices',
              icon: Volume2,
            },
            {
              id: 'scene',
              title: 'AI Vector Scene Generator',
              desc: 'Generate layered custom SVG artwork & motion backgrounds from text',
              icon: Sparkles,
            },
            {
              id: 'highlights',
              title: 'Smart Highlight & Silence Trim',
              desc: '100% free local RMS energy beat peak & silence detector',
              icon: Activity,
            },
          ].map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id as typeof activeTool)}
                className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3 ${
                  activeTool === tool.id
                    ? 'bg-violet-600/20 border-violet-500 text-white'
                    : 'bg-[#12121A] border-white/[0.08] text-slate-300 hover:bg-[#171722]'
                }`}
              >
                <Icon className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-display text-sm font-semibold">{tool.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{tool.desc}</div>
                </div>
              </button>
            );
          })}

          {apiStatus && (
            <div className="rounded-xl bg-[#12121A] border border-white/[0.08] p-4 text-xs text-slate-400 leading-relaxed">
              <strong className="text-slate-200 block mb-1">API & Cost Transparency</strong>
              {apiStatus.disclosure}
            </div>
          )}
        </aside>

        {/* Right Active AI Tool Workspace */}
        <section className="lg:col-span-8 rounded-2xl bg-[#12121A] border border-white/[0.08] p-6 space-y-5">
          {activeTool === 'copilot' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  AI Video Editing Co-Pilot
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Describe the vibe, sport, or story—Gemini builds a timeline configuration you can launch immediately.
                </p>
              </div>

              <form onSubmit={runCopilot} className="space-y-3">
                <label htmlFor="copilot-textarea" className="block text-xs font-medium text-slate-300">
                  Creative Brief
                </label>
                <textarea
                  id="copilot-textarea"
                  rows={3}
                  value={copilotPrompt}
                  onChange={(e) => setCopilotPrompt(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#09090D] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-violet-500"
                />
                <button
                  type="submit"
                  disabled={copilotLoading}
                  className="px-5 py-2.5 min-h-[42px] rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white"
                >
                  {copilotLoading ? 'Generating Edit Plan...' : 'Generate AI Edit Plan'}
                </button>
              </form>

              {copilotError && (
                <p className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-200">
                  {copilotError}
                </p>
              )}

              {copilotResult && (
                <div className="rounded-xl bg-[#09090D] border border-violet-500/30 p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-white">
                      {copilotResult.title}
                    </h3>
                    <span className="text-xs font-mono text-violet-300 tabular-nums">
                      LUT: {copilotResult.recommendedLut} · Speed: {copilotResult.recommendedSpeed}x
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{copilotResult.summary}</p>
                  <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                    {copilotResult.pacingTips.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
                      onApplyAiEditPlanToVideo({
                        title: copilotResult.title,
                        lut: (copilotResult.recommendedLut as LutPresetId) || 'teal-amber',
                        transition:
                          (copilotResult.recommendedTransition as TransitionType) || 'whip-pan',
                        speed: Number(copilotResult.recommendedSpeed) || 1.2,
                        captions: copilotResult.captions || [],
                      })
                    }
                    className="px-4 py-2 min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Apply Plan & Open in Video Editor</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTool === 'subtitles' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Automatic Subtitles, Speech-to-Text & Translation
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Upload a recorded voice/video file for Gemini 3.5 Speech-to-Text or translate script text into timed captions.
                </p>
              </div>

              <form onSubmit={runSubtitles} className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="px-3.5 py-2 min-h-[40px] rounded-lg bg-[#09090D] border border-white/[0.12] hover:border-violet-500 text-xs font-medium text-slate-200 flex items-center gap-2 cursor-pointer">
                    <FileAudio className="w-4 h-4 text-violet-400" />
                    <span>
                      {subAudioFile ? `Audio: ${subAudioFile.name}` : 'Optional: Upload Audio/Video for Speech-to-Text'}
                    </span>
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = String(reader.result || '');
                          const base64 = dataUrl.split(',')[1] || '';
                          setSubAudioFile({
                            base64,
                            mime: f.type || 'audio/mp3',
                            name: f.name,
                          });
                        };
                        reader.readAsDataURL(f);
                      }}
                    />
                  </label>

                  <select
                    aria-label="Target subtitle language"
                    value={subLang}
                    onChange={(e) => setSubLang(e.target.value)}
                    className="px-3 py-2 min-h-[40px] rounded-lg bg-[#09090D] border border-white/[0.12] text-xs text-white"
                  >
                    {[
                      'English',
                      'Spanish',
                      'French',
                      'German',
                      'Portuguese',
                      'Japanese',
                      'Korean',
                      'Hindi',
                      'Bengali',
                      'Arabic',
                    ].map((l) => (
                      <option key={l} value={l}>
                        Translate / Caption in {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sub-script-input" className="block text-xs text-slate-300 mb-1">
                    Dialogue or Narration Text (used if no audio uploaded)
                  </label>
                  <textarea
                    id="sub-script-input"
                    rows={3}
                    value={subScript}
                    onChange={(e) => setSubScript(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#09090D] border border-white/[0.1] text-sm text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={subLoading}
                  className="px-5 py-2.5 min-h-[42px] rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white"
                >
                  {subLoading ? 'Generating Timed Captions...' : 'Generate Auto Subtitles'}
                </button>
              </form>

              {subError && (
                <p className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-200">
                  {subError}
                </p>
              )}

              {subCues.length > 0 && (
                <div className="rounded-xl bg-[#09090D] border border-white/[0.1] p-4 space-y-3">
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {subCues.map((cue, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 rounded bg-[#14141F] flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-white">{cue.text}</span>
                        <span className="font-mono text-violet-300 tabular-nums shrink-0">
                          {cue.startTime.toFixed(1)}s – {cue.endTime.toFixed(1)}s
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onInjectSubtitlesToVideo(subCues)}
                      className="px-4 py-2 min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                    >
                      Send Captions to Video Timeline
                    </button>
                    <button
                      type="button"
                      onClick={exportSrtFile}
                      className="px-4 py-2 min-h-[40px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .SRT</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTool === 'tts' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  AI Voice Generation Studio
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Powered by Gemini 3.8 TTS—synthesizes broadcast-grade 24kHz WAV narration ready for your timeline.
                </p>
              </div>

              <form onSubmit={runVoiceoverTts} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tts-voice-select" className="block text-xs text-slate-300 mb-1">
                      Studio Voice Persona
                    </label>
                    <select
                      id="tts-voice-select"
                      value={ttsVoice}
                      onChange={(e) => setTtsVoice(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#09090D] border border-white/[0.1] text-xs text-white"
                    >
                      <option value="Kore">Kore (Warm Studio Anchor)</option>
                      <option value="Puck">Puck (Energetic Creator)</option>
                      <option value="Charon">Charon (Deep Cinema Trailer)</option>
                      <option value="Fenrir">Fenrir (Bold Documentary)</option>
                      <option value="Zephyr">Zephyr (Crisp Commercial)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="tts-style-input" className="block text-xs text-slate-300 mb-1">
                      Delivery Direction
                    </label>
                    <input
                      id="tts-style-input"
                      type="text"
                      value={ttsStyle}
                      onChange={(e) => setTtsStyle(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#09090D] border border-white/[0.1] text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="tts-script-area" className="block text-xs text-slate-300 mb-1">
                    Voiceover Script
                  </label>
                  <textarea
                    id="tts-script-area"
                    rows={3}
                    value={ttsScript}
                    onChange={(e) => setTtsScript(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#09090D] border border-white/[0.1] text-sm text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={ttsLoading}
                  className="px-5 py-2.5 min-h-[42px] rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white"
                >
                  {ttsLoading ? 'Synthesizing WAV...' : 'Generate AI Voiceover'}
                </button>
              </form>

              {ttsError && (
                <p className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-200">
                  {ttsError}
                </p>
              )}

              {ttsAudioUrl && (
                <div className="rounded-xl bg-[#09090D] border border-violet-500/30 p-4 space-y-3">
                  <audio controls src={ttsAudioUrl} className="w-full" />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onSendVoiceoverToAudioStudio(`AI Voice (${ttsVoice})`, ttsAudioUrl)
                      }
                      className="px-4 py-2 min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                    >
                      Open in Audio Studio DAW
                    </button>
                    <a
                      href={ttsAudioUrl}
                      download={`EDIT_X_Voice_${ttsVoice}.wav`}
                      className="px-4 py-2 min-h-[40px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .WAV</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTool === 'scene' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  AI Vector Artwork & Motion Scene Generator
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Generates crisp scalable SVG vector scenes with Gemini 3.8 Flash—download as SVG or add to your project.
                </p>
              </div>

              <form onSubmit={runSceneGenerator} className="space-y-3">
                <div className="flex items-center gap-2">
                  {(['16:9', '9:16', '1:1'] as const).map((ar) => (
                    <button
                      key={ar}
                      type="button"
                      onClick={() => setSceneAspect(ar)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono ${
                        sceneAspect === ar
                          ? 'bg-violet-600 text-white'
                          : 'bg-[#09090D] text-slate-300 border border-white/[0.1]'
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  aria-label="Scene visual prompt"
                  value={scenePrompt}
                  onChange={(e) => setScenePrompt(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#09090D] border border-white/[0.1] text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={sceneLoading}
                  className="px-5 py-2.5 min-h-[42px] rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white"
                >
                  {sceneLoading ? 'Composing Vector Scene...' : 'Generate AI Scene'}
                </button>
              </form>

              {sceneError && (
                <p className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-200">
                  {sceneError}
                </p>
              )}

              {sceneResult && (
                <div className="rounded-xl bg-[#09090D] border border-white/[0.1] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{sceneResult.title}</span>
                    <span className="text-violet-300 font-mono">
                      Suggested Motion: {sceneResult.suggestedMotion}
                    </span>
                  </div>
                  <div
                    className="w-full max-h-64 overflow-hidden rounded-lg bg-black flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: sceneResult.svgMarkup }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([sceneResult.svgMarkup], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${sceneResult.title.replace(/\s+/g, '_')}.svg`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-4 py-2 min-h-[38px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Scalable .SVG</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTool === 'highlights' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Smart Audio Highlight & Silence Detector (Local DSP)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  100% free on-device RMS envelope scanner—detects beat impact peaks for velocity cuts and trims dead silence.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  aria-label="Audio source for highlight detection"
                  value={highlightPreset}
                  onChange={(e) => setHighlightPreset(e.target.value)}
                  className="px-3 py-2.5 rounded-lg bg-[#09090D] border border-white/[0.1] text-xs text-white"
                >
                  <option value="stadium-trap">Stadium Anthem 140 BPM</option>
                  <option value="cinematic-pulse">Anamorphic Horizon Pulse</option>
                  <option value="kinetic-drive">Kinetic Motion Drive</option>
                  <option value="sfx-sub-boom">Cinema Sub Impact</option>
                </select>
                <button
                  type="button"
                  onClick={runLocalDspAnalysis}
                  className="px-4 py-2.5 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white"
                >
                  Analyze Beat Peaks & Silence
                </button>
              </div>

              {dspReport && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-4 space-y-2">
                    <span className="text-xs font-semibold text-white">
                      Detected Impact Highlights ({dspReport.highlights.length})
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs tabular-nums">
                      {dspReport.highlights.slice(0, 8).map((h, i) => (
                        <div key={i} className="flex justify-between text-slate-300">
                          <span>Peak #{i + 1} at {h.time}s</span>
                          <span className="text-violet-300">RMS {h.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-4 space-y-2">
                    <span className="text-xs font-semibold text-white">
                      Non-Silent Active Segments ({dspReport.activeSegments.length})
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs tabular-nums">
                      {dspReport.activeSegments.map((seg, i) => (
                        <div key={i} className="flex justify-between text-emerald-300">
                          <span>Keep Clip #{i + 1}</span>
                          <span>
                            {seg.start}s → {seg.end}s
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
