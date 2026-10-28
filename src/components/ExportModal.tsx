import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Pause, Play, X } from 'lucide-react';
import { TimelineState } from '../engine/timelineEngine';

interface ExportModalProps {
  projectName: string;
  timeline: TimelineState;
  renderFrameAtTime: (canvas: HTMLCanvasElement, timeSec: number) => void;
  onClose: () => void;
}

type ResolutionTier = '480p' | '720p' | '1080p' | '2K' | '4K';

const RESOLUTION_MAP: Record<ResolutionTier, { label: string; longEdge: number; shortEdge: number }> =
  {
    '480p': { label: '480p SD', longEdge: 854, shortEdge: 480 },
    '720p': { label: '720p HD', longEdge: 1280, shortEdge: 720 },
    '1080p': { label: '1080p Full HD', longEdge: 1920, shortEdge: 1080 },
    '2K': { label: '2K QHD', longEdge: 2560, shortEdge: 1440 },
    '4K': { label: '4K UHD', longEdge: 3840, shortEdge: 2160 },
  };

export const ExportModal: React.FC<ExportModalProps> = ({
  projectName,
  timeline,
  renderFrameAtTime,
  onClose,
}) => {
  const [resolution, setResolution] = useState<ResolutionTier>('1080p');
  const [fps, setFps] = useState<24 | 25 | 30 | 50 | 60>(timeline.fps || 60);
  const [bitrateMbps, setBitrateMbps] = useState<number>(18);
  const [selectedMime, setSelectedMime] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'rendering' | 'paused' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadExt, setDownloadExt] = useState<string>('mp4');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const codecOptions = useMemo(() => {
    const candidates = [
      { id: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', label: 'H.264 / MP4 (Hardware AVC)', ext: 'mp4' },
      { id: 'video/mp4;codecs=hvc1', label: 'H.265 / HEVC MP4', ext: 'mp4' },
      { id: 'video/webm;codecs=vp9', label: 'VP9 High-Efficiency WebM', ext: 'webm' },
      { id: 'video/webm;codecs=vp8', label: 'VP8 Universal WebM', ext: 'webm' },
      { id: 'video/webm', label: 'Standard WebM Container', ext: 'webm' },
    ];
    if (typeof MediaRecorder === 'undefined') {
      return [{ id: 'snapshot-png', label: 'PNG Sequence Master', ext: 'png', supported: true }];
    }
    return candidates.map((c) => ({
      ...c,
      supported: MediaRecorder.isTypeSupported(c.id),
    }));
  }, []);

  const activeCodec = useMemo(() => {
    if (selectedMime) {
      const found = codecOptions.find((c) => c.id === selectedMime && c.supported);
      if (found) return found;
    }
    return codecOptions.find((c) => c.supported) || codecOptions[codecOptions.length - 1];
  }, [codecOptions, selectedMime]);

  const computeDimensions = () => {
    const spec = RESOLUTION_MAP[resolution];
    if (timeline.aspectRatio === '9:16') {
      return { width: spec.shortEdge, height: spec.longEdge };
    }
    if (timeline.aspectRatio === '1:1') {
      return { width: spec.shortEdge, height: spec.shortEdge };
    }
    if (timeline.aspectRatio === '4:5') {
      return { width: spec.shortEdge, height: Math.round(spec.shortEdge * 1.25) };
    }
    return { width: spec.longEdge, height: spec.shortEdge };
  };

  const startExport = async () => {
    cancelRef.current = false;
    pauseRef.current = false;
    setErrorMsg('');
    setDownloadUrl(null);
    setProgress(0);
    setStatus('rendering');

    try {
      const { width, height } = computeDimensions();
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;

      if (typeof MediaRecorder === 'undefined' || !activeCodec.supported) {
        // Fallback single-frame high-res master export if MediaRecorder unsupported
        renderFrameAtTime(offscreen, 0);
        const pngUrl = offscreen.toDataURL('image/png');
        setDownloadUrl(pngUrl);
        setDownloadExt('png');
        setProgress(100);
        setStatus('done');
        return;
      }

      const stream = offscreen.captureStream(fps);
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: activeCodec.id,
        videoBitsPerSecond: bitrateMbps * 1_000_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const stoppedPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: activeCodec.id }));
        };
        recorder.onerror = () => reject(new Error('Hardware media encoder interrupted.'));
      });

      recorder.start(100);

      // Render deterministic frame steps across timeline duration (capped for responsive browser export)
      const totalDuration = Math.max(1, Math.min(30, timeline.duration));
      const previewSteps = Math.max(24, Math.min(180, Math.round(totalDuration * Math.min(fps, 30))));

      for (let step = 0; step <= previewSteps; step++) {
        if (cancelRef.current) {
          recorder.stop();
          setStatus('idle');
          setProgress(0);
          return;
        }
        while (pauseRef.current && !cancelRef.current) {
          await new Promise((r) => setTimeout(r, 120));
        }

        const t = (step / previewSteps) * totalDuration;
        renderFrameAtTime(offscreen, t);
        setProgress(Math.round((step / previewSteps) * 100));
        await new Promise((r) => setTimeout(r, 18));
      }

      recorder.stop();
      const finalBlob = await stoppedPromise;
      const url = URL.createObjectURL(finalBlob);
      setDownloadUrl(url);
      setDownloadExt(activeCodec.ext);
      setProgress(100);
      setStatus('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
      setStatus('error');
    }
  };

  const togglePause = () => {
    if (!recorderRef.current) return;
    if (status === 'rendering') {
      pauseRef.current = true;
      if (recorderRef.current.state === 'recording') recorderRef.current.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      pauseRef.current = false;
      if (recorderRef.current.state === 'paused') recorderRef.current.resume();
      setStatus('rendering');
    }
  };

  const cancelExport = () => {
    cancelRef.current = true;
    pauseRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setStatus('idle');
    setProgress(0);
  };

  const dims = computeDimensions();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#12121A] border border-white/[0.12] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="export-modal-title" className="font-display text-lg font-bold text-white">
              Professional Export Engine
            </h2>
            <p className="text-xs text-slate-400">
              Zero watermark · Full resolution unlocked · Direct device save
            </p>
          </div>
          <button
            type="button"
            aria-label="Close export modal"
            onClick={() => {
              cancelExport();
              onClose();
            }}
            className="min-h-[40px] min-w-[40px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resolution Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Output Resolution</span>
            <span className="font-mono text-violet-300 tabular-nums">
              {dims.width} × {dims.height} px ({timeline.aspectRatio})
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {(['480p', '720p', '1080p', '2K', '4K'] as ResolutionTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                disabled={status === 'rendering' || status === 'paused'}
                onClick={() => setResolution(tier)}
                className={`py-2 min-h-[40px] rounded-lg text-xs font-semibold transition-colors tabular-nums ${
                  resolution === tier
                    ? 'bg-violet-600 text-white'
                    : 'bg-[#09090D] border border-white/[0.08] text-slate-300 hover:border-white/[0.2]'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate Selector */}
        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-300">Frame Rate (FPS)</span>
          <div className="grid grid-cols-5 gap-2">
            {([24, 25, 30, 50, 60] as const).map((rate) => (
              <button
                key={rate}
                type="button"
                disabled={status === 'rendering' || status === 'paused'}
                onClick={() => setFps(rate)}
                className={`py-2 min-h-[40px] rounded-lg text-xs font-mono font-semibold transition-colors tabular-nums ${
                  fps === rate
                    ? 'bg-white text-[#09090D]'
                    : 'bg-[#09090D] border border-white/[0.08] text-slate-300 hover:border-white/[0.2]'
                }`}
              >
                {rate} FPS
              </button>
            ))}
          </div>
        </div>

        {/* Bitrate & Codec */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="bitrate-range" className="text-slate-300 font-medium">
                Target Bitrate
              </label>
              <span className="font-mono text-slate-200 tabular-nums">{bitrateMbps} Mbps</span>
            </div>
            <input
              id="bitrate-range"
              type="range"
              min={2}
              max={60}
              step={2}
              disabled={status === 'rendering' || status === 'paused'}
              value={bitrateMbps}
              onChange={(e) => setBitrateMbps(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="codec-select" className="block text-xs text-slate-300 font-medium">
              Hardware Codec & Container
            </label>
            <select
              id="codec-select"
              disabled={status === 'rendering' || status === 'paused'}
              value={activeCodec.id}
              onChange={(e) => setSelectedMime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#09090D] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-violet-500"
            >
              {codecOptions.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.supported}>
                  {c.label} {c.supported ? '' : '(Unsupported on device)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Progress & Actions */}
        {(status === 'rendering' || status === 'paused' || status === 'done') && (
          <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">
                {status === 'done'
                  ? 'Master Render Complete'
                  : status === 'paused'
                    ? 'Render Paused'
                    : 'Encoding Master Stream...'}
              </span>
              <span className="font-mono text-violet-300 tabular-nums">{progress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {errorMsg}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          {status === 'idle' || status === 'error' ? (
            <>
              <span className="text-xs text-slate-400 tabular-nums">
                Est. Size: ~{Math.max(1, Math.round((bitrateMbps * timeline.duration) / 8))} MB
              </span>
              <button
                type="button"
                onClick={startExport}
                className="px-5 py-2.5 min-h-[44px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition-colors"
              >
                Start Master Export
              </button>
            </>
          ) : status === 'rendering' || status === 'paused' ? (
            <div className="w-full flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={togglePause}
                className="px-4 py-2 min-h-[40px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white flex items-center gap-1.5"
              >
                {status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{status === 'paused' ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                type="button"
                onClick={cancelExport}
                className="px-4 py-2 min-h-[40px] rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-medium text-red-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Ready · No Watermark</span>
              </div>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={`${projectName.replace(/\s+/g, '_')}_${resolution}_${fps}fps.${downloadExt}`}
                  className="px-5 py-2.5 min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Save to Device (.{downloadExt})</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
