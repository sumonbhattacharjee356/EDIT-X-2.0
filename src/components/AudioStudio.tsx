import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  Scissors,
  Sliders,
  Square,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  computeWaveformPeaks,
  encodeStereoWav,
  STUDIO_AUDIO_LIBRARY,
  synthesizePresetSamples,
} from '../engine/audioEngine';
import { AudioStudioState, AudioTrackItem } from '../services/mediaAssets';

interface AudioStudioProps {
  projectName: string;
  initialState: AudioStudioState;
  onSaveAudioState: (next: AudioStudioState) => void;
  onBackToDashboard: () => void;
}

export const AudioStudio: React.FC<AudioStudioProps> = ({
  projectName,
  initialState,
  onSaveAudioState,
  onBackToDashboard,
}) => {
  const [audioState, setAudioState] = useState<AudioStudioState>(initialState);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playhead, setPlayhead] = useState<number>(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    initialState.tracks[0]?.id || null
  );
  const [isRecordingMic, setIsRecordingMic] = useState<boolean>(false);
  const [micError, setMicError] = useState<string>('');
  const [exportingWav, setExportingWav] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const decodedCustomBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const commitState = (next: AudioStudioState) => {
    setAudioState(next);
    onSaveAudioState(next);
  };

  const selectedTrack = useMemo(
    () => audioState.tracks.find((t) => t.id === selectedTrackId) || null,
    [audioState.tracks, selectedTrackId]
  );

  // Precompute deterministic waveform peak bars per track
  const waveformMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const trk of audioState.tracks) {
      if (trk.presetId) {
        const pcm = synthesizePresetSamples(trk.presetId, 8000);
        map.set(trk.id, computeWaveformPeaks(pcm.left, 72));
      } else if (trk.customAudioUrl && decodedCustomBuffersRef.current.has(trk.customAudioUrl)) {
        const buf = decodedCustomBuffersRef.current.get(trk.customAudioUrl)!;
        map.set(trk.id, computeWaveformPeaks(buf.getChannelData(0), 72));
      } else {
        map.set(
          trk.id,
          Array.from({ length: 72 }, (_, idx) => 0.25 + 0.55 * Math.abs(Math.sin(idx * 0.4)))
        );
      }
    }
    return map;
  }, [audioState.tracks]);

  const stopPlayback = () => {
    for (const s of activeSourcesRef.current) {
      try {
        s.stop();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current = [];
  };

  useEffect(() => {
    if (!isPlaying) {
      stopPlayback();
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    // Build 5-band parametric EQ chain -> Master Gain -> Destination
    const masterGain = ctx.createGain();
    masterGain.gain.value = audioState.masterVolume;

    const eqSpecs: Array<{ freq: number; gain: number; type: BiquadFilterType }> = [
      { freq: 60, gain: audioState.eqBands.sub60, type: 'lowshelf' },
      { freq: 250, gain: audioState.eqBands.low250, type: 'peaking' },
      { freq: 1000, gain: audioState.eqBands.mid1k, type: 'peaking' },
      { freq: 4000, gain: audioState.eqBands.presence4k, type: 'peaking' },
      { freq: 12000, gain: audioState.eqBands.air12k, type: 'highshelf' },
    ];

    let chainHead: AudioNode = masterGain;
    const filters = eqSpecs.map((spec) => {
      const f = ctx.createBiquadFilter();
      f.type = spec.type;
      f.frequency.value = spec.freq;
      f.gain.value = spec.gain;
      return f;
    });

    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }
    filters[filters.length - 1].connect(masterGain);
    masterGain.connect(ctx.destination);
    chainHead = filters[0];

    const hasSolo = audioState.tracks.some((t) => t.solo);
    const maxEnd = Math.max(4, ...audioState.tracks.map((t) => t.startTime + (t.trimEnd - t.trimStart)));

    for (const trk of audioState.tracks) {
      if (trk.muted || (hasSolo && !trk.solo)) continue;
      let buffer: AudioBuffer | null = null;
      if (trk.presetId) {
        const synth = synthesizePresetSamples(trk.presetId, ctx.sampleRate);
        buffer = ctx.createBuffer(2, synth.left.length, ctx.sampleRate);
        buffer.getChannelData(0).set(synth.left);
        buffer.getChannelData(1).set(synth.right);
      } else if (trk.customAudioUrl && decodedCustomBuffersRef.current.has(trk.customAudioUrl)) {
        buffer = decodedCustomBuffersRef.current.get(trk.customAudioUrl)!;
      }
      if (!buffer) continue;

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const trkGain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      panner.pan.value = trk.pan;

      const startWhen = ctx.currentTime + Math.max(0, trk.startTime - playhead);
      const offsetSec = trk.trimStart + Math.max(0, playhead - trk.startTime);
      const activeDur = Math.max(0.05, trk.trimEnd - offsetSec);

      // Volume + Fade In / Fade Out automation
      trkGain.gain.setValueAtTime(trk.fadeIn > 0.05 ? 0.01 : trk.volume, startWhen);
      if (trk.fadeIn > 0.05) {
        trkGain.gain.linearRampToValueAtTime(trk.volume, startWhen + Math.min(trk.fadeIn, activeDur * 0.5));
      }
      if (trk.fadeOut > 0.05) {
        trkGain.gain.setValueAtTime(trk.volume, startWhen + Math.max(0.05, activeDur - trk.fadeOut));
        trkGain.gain.linearRampToValueAtTime(0.001, startWhen + activeDur);
      }

      if (trk.noiseReduction) {
        // High-pass rumble cut + 60Hz hum filter
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 115;
        src.connect(hp).connect(trkGain).connect(panner).connect(chainHead);
      } else {
        src.connect(trkGain).connect(panner).connect(chainHead);
      }

      src.start(startWhen, offsetSec, activeDur);
      activeSourcesRef.current.push(src);
    }

    const startWall = performance.now();
    const initialPlayhead = playhead;
    const timer = window.setInterval(() => {
      const next = initialPlayhead + (performance.now() - startWall) / 1000;
      if (next >= maxEnd) {
        setPlayhead(0);
        setIsPlaying(false);
      } else {
        setPlayhead(next);
      }
    }, 80);

    return () => {
      window.clearInterval(timer);
      stopPlayback();
    };
  }, [isPlaying]);

  // Real Microphone Voice-Over Recording
  const toggleVoiceRecording = async () => {
    setMicError('');
    if (isRecordingMic && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingMic(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
        const arrayBuf = await blob.arrayBuffer();
        const decoded = await audioCtxRef.current.decodeAudioData(arrayBuf);
        decodedCustomBuffersRef.current.set(url, decoded);

        const newTrack: AudioTrackItem = {
          id: `vo_${Date.now()}`,
          name: 'Voice-Over Take',
          customAudioUrl: url,
          startTime: Number(playhead.toFixed(2)),
          duration: Number(decoded.duration.toFixed(2)),
          trimStart: 0,
          trimEnd: Number(decoded.duration.toFixed(2)),
          volume: 1.0,
          pan: 0,
          fadeIn: 0.1,
          fadeOut: 0.15,
          muted: false,
          solo: false,
          noiseReduction: true,
        };
        commitState({ ...audioState, tracks: [...audioState.tracks, newTrack] });
        setSelectedTrackId(newTrack.id);
      };

      rec.start();
      setIsRecordingMic(true);
    } catch (err: unknown) {
      setMicError(
        err instanceof Error
          ? err.message
          : 'Microphone permission denied or unavailable in this browser.'
      );
    }
  };

  // Offline Stereo WAV Mixdown Export
  const handleExportMasterWav = async () => {
    setExportingWav(true);
    try {
      const sr = 44100;
      const totalSec = Math.max(
        3,
        ...audioState.tracks.map((t) => t.startTime + (t.trimEnd - t.trimStart))
      );
      const totalSamples = Math.ceil(totalSec * sr);
      const mixL = new Float32Array(totalSamples);
      const mixR = new Float32Array(totalSamples);
      const hasSolo = audioState.tracks.some((t) => t.solo);

      for (const trk of audioState.tracks) {
        if (trk.muted || (hasSolo && !trk.solo)) continue;
        let srcL: Float32Array | null = null;
        let srcR: Float32Array | null = null;

        if (trk.presetId) {
          const synth = synthesizePresetSamples(trk.presetId, sr);
          srcL = synth.left;
          srcR = synth.right;
        } else if (trk.customAudioUrl && decodedCustomBuffersRef.current.has(trk.customAudioUrl)) {
          const b = decodedCustomBuffersRef.current.get(trk.customAudioUrl)!;
          srcL = b.getChannelData(0);
          srcR = b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0);
        }
        if (!srcL || !srcR) continue;

        const startIdx = Math.floor(trk.startTime * sr);
        const trimStartIdx = Math.floor(trk.trimStart * sr);
        const trimEndIdx = Math.min(srcL.length, Math.floor(trk.trimEnd * sr));
        const clipLen = Math.max(1, trimEndIdx - trimStartIdx);
        const lGain = trk.volume * audioState.masterVolume * Math.min(1, 1 - trk.pan);
        const rGain = trk.volume * audioState.masterVolume * Math.min(1, 1 + trk.pan);

        for (let i = 0; i < clipLen; i++) {
          const outIdx = startIdx + i;
          if (outIdx >= totalSamples) break;
          const localSec = i / sr;
          const remSec = (clipLen - i) / sr;
          let env = 1;
          if (trk.fadeIn > 0 && localSec < trk.fadeIn) env *= localSec / trk.fadeIn;
          if (trk.fadeOut > 0 && remSec < trk.fadeOut) env *= remSec / trk.fadeOut;

          mixL[outIdx] = Math.max(-0.99, Math.min(0.99, mixL[outIdx] + srcL[trimStartIdx + i] * lGain * env));
          mixR[outIdx] = Math.max(-0.99, Math.min(0.99, mixR[outIdx] + srcR[trimStartIdx + i] * rGain * env));
        }
      }

      const wavBytes = encodeStereoWav(mixL, mixR, sr);
      const blob = new Blob([wavBytes as unknown as BlobPart], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}_MasterMix.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingWav(false);
    }
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#09090D] text-[#F8FAFC] flex flex-col">
      <header className="h-13 px-4 bg-[#0E0E15] border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onBackToDashboard();
            }}
            className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-slate-200 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </button>
          <h1 className="font-display text-sm font-semibold text-white truncate">{projectName}</h1>
          <span className="hidden md:inline text-xs text-slate-400">
            Multi-Track Audio Studio · 5-Band EQ · Voice-Over DAW
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleVoiceRecording}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
              isRecordingMic
                ? 'bg-red-600 text-white'
                : 'bg-white/[0.08] hover:bg-white/[0.14] text-slate-200'
            }`}
          >
            {isRecordingMic ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-red-400" />}
            <span>{isRecordingMic ? 'Stop Recording' : 'Record Voice-Over'}</span>
          </button>

          <button
            type="button"
            disabled={exportingWav}
            onClick={handleExportMasterWav}
            className="px-4 py-2 min-h-[38px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingWav ? 'Mixing...' : 'Export Master WAV'}</span>
          </button>
        </div>
      </header>

      {micError && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-xs text-amber-200">
          {micError}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* Left Music & Sound Effects Library */}
        <aside className="lg:col-span-3 bg-[#0E0E15] border-b lg:border-b-0 lg:border-r border-white/[0.08] p-4 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold text-white flex items-center gap-1.5">
              <Music className="w-4 h-4 text-violet-400" />
              <span>Music & SFX Library</span>
            </h2>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded bg-violet-600/20 hover:bg-violet-600 text-violet-200 hover:text-white text-xs font-medium flex items-center gap-1"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              aria-label="Import local audio track"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
                const ab = await file.arrayBuffer();
                const decoded = await audioCtxRef.current.decodeAudioData(ab);
                decodedCustomBuffersRef.current.set(url, decoded);
                const item: AudioTrackItem = {
                  id: `aud_imp_${Date.now()}`,
                  name: file.name,
                  customAudioUrl: url,
                  startTime: 0,
                  duration: Number(decoded.duration.toFixed(2)),
                  trimStart: 0,
                  trimEnd: Number(decoded.duration.toFixed(2)),
                  volume: 0.9,
                  pan: 0,
                  fadeIn: 0.2,
                  fadeOut: 0.3,
                  muted: false,
                  solo: false,
                  noiseReduction: false,
                };
                commitState({ ...audioState, tracks: [...audioState.tracks, item] });
                setSelectedTrackId(item.id);
                e.target.value = '';
              }}
            />
          </div>

          <div className="space-y-2">
            {STUDIO_AUDIO_LIBRARY.map((preset) => (
              <div
                key={preset.id}
                className="rounded-xl bg-[#14141F] border border-white/[0.06] p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white truncate">{preset.name}</span>
                  <span className="text-[10px] font-mono text-violet-300 uppercase">
                    {preset.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{preset.description}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                    {preset.bpm} BPM · {preset.duration}s
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const trk: AudioTrackItem = {
                        id: `at_${Date.now()}`,
                        name: preset.name,
                        presetId: preset.id,
                        startTime: Number(playhead.toFixed(2)),
                        duration: preset.duration,
                        trimStart: 0,
                        trimEnd: preset.duration,
                        volume: 0.85,
                        pan: 0,
                        fadeIn: 0.2,
                        fadeOut: 0.3,
                        muted: false,
                        solo: false,
                        noiseReduction: false,
                      };
                      commitState({ ...audioState, tracks: [...audioState.tracks, trk] });
                      setSelectedTrackId(trk.id);
                    }}
                    className="px-2.5 py-1 rounded bg-white/[0.08] hover:bg-violet-600 text-[11px] font-semibold text-white flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Track</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Center Multi-Track Waveform Arrangement */}
        <section className="lg:col-span-6 bg-[#09090D] p-4 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="px-4 py-2 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isPlaying ? 'Stop Mix' : 'Play Multi-Track'}</span>
                </button>
                <span className="font-mono text-sm text-violet-300 tabular-nums ml-2">
                  {playhead.toFixed(2)}s
                </span>
              </div>

              {selectedTrack && (
                <button
                  type="button"
                  onClick={() => {
                    // Split selected audio clip in half
                    const mid = Number(((selectedTrack.trimStart + selectedTrack.trimEnd) / 2).toFixed(2));
                    if (mid - selectedTrack.trimStart < 0.3) return;
                    const firstHalf: AudioTrackItem = { ...selectedTrack, trimEnd: mid };
                    const secondHalf: AudioTrackItem = {
                      ...selectedTrack,
                      id: `${selectedTrack.id}_split_${Date.now()}`,
                      name: `${selectedTrack.name} (Part 2)`,
                      startTime: Number((selectedTrack.startTime + (mid - selectedTrack.trimStart)).toFixed(2)),
                      trimStart: mid,
                    };
                    commitState({
                      ...audioState,
                      tracks: audioState.tracks.flatMap((t) =>
                        t.id === selectedTrack.id ? [firstHalf, secondHalf] : [t]
                      ),
                    });
                  }}
                  className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#14141F] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center gap-1.5"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Split Audio</span>
                </button>
              )}
            </div>

            {/* Waveform Lanes */}
            <div className="space-y-2.5 pt-2">
              {audioState.tracks.map((trk) => {
                const peaks = waveformMap.get(trk.id) || [];
                const isSelected = trk.id === selectedTrackId;
                return (
                  <div
                    key={trk.id}
                    className={`rounded-xl bg-[#12121A] border p-3 space-y-2 transition-colors ${
                      isSelected ? 'border-violet-500' : 'border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTrackId(trk.id)}
                        className="text-xs font-semibold text-white hover:text-violet-300 truncate text-left"
                      >
                        {trk.name}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            commitState({
                              ...audioState,
                              tracks: audioState.tracks.map((t) =>
                                t.id === trk.id ? { ...t, solo: !t.solo } : t
                              ),
                            })
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            trk.solo ? 'bg-amber-500 text-black' : 'bg-white/[0.06] text-slate-400'
                          }`}
                        >
                          S
                        </button>
                        <button
                          type="button"
                          aria-label={`Mute ${trk.name}`}
                          onClick={() =>
                            commitState({
                              ...audioState,
                              tracks: audioState.tracks.map((t) =>
                                t.id === trk.id ? { ...t, muted: !t.muted } : t
                              ),
                            })
                          }
                          className={`p-1 rounded ${trk.muted ? 'text-red-400' : 'text-slate-400'}`}
                        >
                          {trk.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${trk.name}`}
                          onClick={() =>
                            commitState({
                              ...audioState,
                              tracks: audioState.tracks.filter((t) => t.id !== trk.id),
                            })
                          }
                          className="p-1 text-slate-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Interactive SVG Waveform Bar Graph */}
                    <button
                      type="button"
                      aria-label={`Select waveform for ${trk.name}`}
                      onClick={() => setSelectedTrackId(trk.id)}
                      className="w-full h-14 rounded-lg bg-[#09090D] border border-white/[0.05] px-2 flex items-center gap-[2px] overflow-hidden"
                    >
                      {peaks.map((pk, idx) => (
                        <span
                          key={idx}
                          style={{ height: `${Math.max(12, pk * 92)}%` }}
                          className={`flex-1 rounded-full ${
                            trk.muted
                              ? 'bg-slate-700'
                              : isSelected
                                ? 'bg-violet-400'
                                : 'bg-violet-600/70'
                          }`}
                        />
                      ))}
                    </button>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                      <span>Start: {trk.startTime.toFixed(1)}s</span>
                      <span>
                        Trim: {trk.trimStart.toFixed(1)}s – {trk.trimEnd.toFixed(1)}s
                      </span>
                      <span>Vol: {Math.round(trk.volume * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Track Channel Strip & 5-Band Master Equalizer */}
        <aside className="lg:col-span-3 bg-[#0E0E15] border-t lg:border-t-0 lg:border-l border-white/[0.08] p-4 space-y-5 overflow-y-auto text-xs">
          {selectedTrack && (
            <div className="space-y-3 pb-4 border-b border-white/[0.08]">
              <h2 className="font-display text-sm font-semibold text-white">
                Channel Strip: {selectedTrack.name}
              </h2>

              {(
                [
                  { label: 'Channel Volume', key: 'volume', min: 0, max: 1.5, step: 0.05 },
                  { label: 'Stereo Pan (L/R)', key: 'pan', min: -1, max: 1, step: 0.05 },
                  { label: 'Timeline Offset (s)', key: 'startTime', min: 0, max: 20, step: 0.2 },
                  { label: 'Fade In (s)', key: 'fadeIn', min: 0, max: 3, step: 0.1 },
                  { label: 'Fade Out (s)', key: 'fadeOut', min: 0, max: 3, step: 0.1 },
                ] as const
              ).map((c) => (
                <div key={c.key} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300">{c.label}</span>
                    <span className="font-mono tabular-nums">{selectedTrack[c.key].toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    aria-label={c.label}
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={selectedTrack[c.key]}
                    onChange={(e) =>
                      commitState({
                        ...audioState,
                        tracks: audioState.tracks.map((t) =>
                          t.id === selectedTrack.id
                            ? { ...t, [c.key]: Number(e.target.value) }
                            : t
                        ),
                      })
                    }
                    className="w-full"
                  />
                </div>
              ))}

              <label className="flex items-center justify-between pt-1 cursor-pointer">
                <span className="text-slate-200 font-medium">Vocal Noise & Rumble Reduction</span>
                <input
                  type="checkbox"
                  checked={selectedTrack.noiseReduction}
                  onChange={(e) =>
                    commitState({
                      ...audioState,
                      tracks: audioState.tracks.map((t) =>
                        t.id === selectedTrack.id
                          ? { ...t, noiseReduction: e.target.checked }
                          : t
                      ),
                    })
                  }
                  className="w-4 h-4 accent-violet-600"
                />
              </label>
            </div>
          )}

          {/* 5-Band Parametric Equalizer */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-white flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-violet-400" />
              <span>5-Band Parametric EQ</span>
            </h2>

            {(
              [
                { label: '60 Hz Sub Shelf', key: 'sub60' },
                { label: '250 Hz Warmth', key: 'low250' },
                { label: '1 kHz Presence', key: 'mid1k' },
                { label: '4 kHz Clarity', key: 'presence4k' },
                { label: '12 kHz Air Shelf', key: 'air12k' },
              ] as const
            ).map((band) => (
              <div key={band.key} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300">{band.label}</span>
                  <span className="font-mono text-violet-300 tabular-nums">
                    {audioState.eqBands[band.key] > 0 ? '+' : ''}
                    {audioState.eqBands[band.key]} dB
                  </span>
                </div>
                <input
                  type="range"
                  aria-label={band.label}
                  min={-12}
                  max={12}
                  step={0.5}
                  value={audioState.eqBands[band.key]}
                  onChange={(e) =>
                    commitState({
                      ...audioState,
                      eqBands: { ...audioState.eqBands, [band.key]: Number(e.target.value) },
                    })
                  }
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
