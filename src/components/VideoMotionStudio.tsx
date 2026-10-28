import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Film,
  FlipHorizontal,
  KeyRound,
  Lock,
  Magnet,
  Merge,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Snowflake,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Unlock,
  Upload,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BlendModeType,
  createDefaultChromaKey,
  createDefaultEffects,
  createDefaultTransform,
  EasingMode,
  evaluateEasing,
  formatTimecode,
  HistoryManager,
  interpolateClipProperty,
  KeyframeProperty,
  LutPresetId,
  MaskShape,
  mergeAdjacentClips,
  recomputeTimelineDuration,
  snapTimeToTargets,
  splitClipAtTime,
  TimelineClip,
  TimelineState,
  TrackKind,
  TransitionType,
} from '../engine/timelineEngine';
import { applyLutColorMatrix, clampByte, hexToRgb } from '../engine/imageEngine';
import { STUDIO_AUDIO_LIBRARY, synthesizePresetSamples } from '../engine/audioEngine';
import { STUDIO_MEDIA_ASSETS } from '../services/mediaAssets';
import { ExportModal } from './ExportModal';

interface VideoMotionStudioProps {
  mode: 'video' | 'motion';
  projectName: string;
  initialTimeline: TimelineState;
  magneticSnappingDefault: boolean;
  onTimelineChange: (next: TimelineState) => void;
  onRenameProject: (name: string) => void;
  onBackToDashboard: () => void;
  onOpenAiSubtitles: () => void;
}

export const VideoMotionStudio: React.FC<VideoMotionStudioProps> = ({
  mode,
  projectName,
  initialTimeline,
  magneticSnappingDefault,
  onTimelineChange,
  onRenameProject,
  onBackToDashboard,
  onOpenAiSubtitles,
}) => {
  const historyRef = useRef(new HistoryManager<TimelineState>(initialTimeline, 40));
  const [timeline, setTimeline] = useState<TimelineState>(initialTimeline);
  const [playhead, setPlayhead] = useState<number>(0);
  const playheadRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    initialTimeline.clips[0]?.id || null
  );
  const [zoomPxPerSec, setZoomPxPerSec] = useState<number>(68);
  const [snapping, setSnapping] = useState<boolean>(magneticSnappingDefault);
  const [inspectorTab, setInspectorTab] = useState<
    'transform' | 'effects' | 'keyframes' | 'media'
  >(mode === 'motion' ? 'keyframes' : 'transform');
  const [activeKfProp, setActiveKfProp] = useState<KeyframeProperty>('scale');
  const [showMotionPath, setShowMotionPath] = useState<boolean>(mode === 'motion');
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [mediaReadyTick, setMediaReadyTick] = useState<number>(0);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeAudioNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedClip = useMemo(
    () => timeline.clips.find((c) => c.id === selectedClipId) || null,
    [timeline.clips, selectedClipId]
  );

  const commitTimeline = useCallback(
    (next: TimelineState) => {
      const normalized = recomputeTimelineDuration(next);
      historyRef.current.push(normalized);
      setTimeline(normalized);
      onTimelineChange(normalized);
    },
    [onTimelineChange]
  );

  const handleUndo = () => {
    if (!historyRef.current.canUndo) return;
    const prev = historyRef.current.undo();
    setTimeline(prev);
    onTimelineChange(prev);
  };

  const handleRedo = () => {
    if (!historyRef.current.canRedo) return;
    const next = historyRef.current.redo();
    setTimeline(next);
    onTimelineChange(next);
  };

  // Preload image & video sources referenced by clips
  useEffect(() => {
    for (const clip of timeline.clips) {
      if (!clip.sourceUrl) continue;
      if (clip.mediaType === 'image' && !imageCacheRef.current.has(clip.sourceUrl)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = clip.sourceUrl;
        img.onload = () => {
          setMediaReadyTick((t) => t + 1);
        };
        imageCacheRef.current.set(clip.sourceUrl, img);
      } else if (clip.mediaType === 'video' && !videoCacheRef.current.has(clip.sourceUrl)) {
        const vid = document.createElement('video');
        vid.src = clip.sourceUrl;
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.onloadeddata = () => setMediaReadyTick((t) => t + 1);
        videoCacheRef.current.set(clip.sourceUrl, vid);
      }
    }
  }, [timeline.clips]);

  const getCanvasLogicalSize = useCallback(() => {
    switch (timeline.aspectRatio) {
      case '9:16':
        return { w: 540, h: 960 };
      case '1:1':
        return { w: 720, h: 720 };
      case '4:5':
        return { w: 720, h: 900 };
      default:
        return { w: 960, h: 540 };
    }
  }, [timeline.aspectRatio]);

  /**
   * Core Multi-Track NLE & Motion Graphics Frame Renderer
   */
  const renderCompositeFrame = useCallback(
    (canvas: HTMLCanvasElement, timeSec: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      ctx.save();
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);

      const hasSolo = timeline.tracks.some((t) => t.solo && t.kind !== 'audio');

      // Render tracks from bottom-most layer to top-most layer
      const orderedTracks = [...timeline.tracks].reverse();

      for (const track of orderedTracks) {
        if (track.kind === 'audio' || track.hidden) continue;
        if (hasSolo && !track.solo) continue;

        const activeClips = timeline.clips.filter(
          (c) =>
            c.trackId === track.id &&
            timeSec >= c.startTime &&
            timeSec <= c.startTime + c.duration
        );

        for (const clip of activeClips) {
          const localTime = timeSec - clip.startTime;
          let tx = interpolateClipProperty(clip, 'x', timeSec);
          let ty = interpolateClipProperty(clip, 'y', timeSec);
          let scale = interpolateClipProperty(clip, 'scale', timeSec);
          const rotation = interpolateClipProperty(clip, 'rotation', timeSec);
          let opacity = interpolateClipProperty(clip, 'opacity', timeSec);

          // Apply Transition In math (preserve resting poster frame at timeSec === 0 for clips at 0s unless dip-to-black)
          if (
            clip.transitionIn !== 'none' &&
            clip.transitionDuration > 0 &&
            localTime < clip.transitionDuration &&
            (clip.startTime > 0 || timeSec > 0 || clip.transitionIn === 'dip-to-black')
          ) {
            const p = Math.max(0, Math.min(1, localTime / clip.transitionDuration));
            const easeP = evaluateEasing(p, 'easeOut');
            if (clip.transitionIn === 'crossfade' || clip.transitionIn === 'dip-to-black') {
              opacity *= easeP;
            } else if (clip.transitionIn === 'whip-pan') {
              tx += (1 - easeP) * -45;
              opacity *= Math.min(1, easeP * 1.4);
            } else if (clip.transitionIn === 'zoom-burst') {
              scale *= 1.5 - 0.5 * easeP;
              opacity *= easeP;
            }
          }

          // Stabilization adds a clean 4% overscan crop buffer
          if (clip.effects.stabilize) {
            scale *= 1.04;
          }

          ctx.save();
          ctx.globalCompositeOperation = clip.blendMode as GlobalCompositeOperation;
          ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

          // Wipe-left transition or mask clipping
          if (
            clip.transitionIn === 'wipe-left' &&
            clip.transitionDuration > 0 &&
            localTime < clip.transitionDuration &&
            (clip.startTime > 0 || timeSec > 0)
          ) {
            const p = localTime / clip.transitionDuration;
            ctx.beginPath();
            ctx.rect(0, 0, W * p, H);
            ctx.clip();
          }

          // CSS filter hardware pass for brightness/contrast/saturation/blur
          const filters: string[] = [];
          if (clip.effects.brightness !== 0) {
            filters.push(`brightness(${100 + clip.effects.brightness}%)`);
          }
          if (clip.effects.contrast !== 0) {
            filters.push(`contrast(${100 + clip.effects.contrast}%)`);
          }
          if (clip.effects.saturation !== 0) {
            filters.push(`saturate(${Math.max(0, 100 + clip.effects.saturation)}%)`);
          }
          if (clip.effects.blur > 0) {
            filters.push(`blur(${clip.effects.blur}px)`);
          }
          ctx.filter = filters.length > 0 ? filters.join(' ') : 'none';

          if (clip.effects.glow > 0) {
            ctx.shadowColor = clip.accentColor || '#A78BFA';
            ctx.shadowBlur = clip.effects.glow * 0.6;
          }

          const drawSinglePass = (offsetX: number, offsetY: number, alphaMul: number) => {
            ctx.save();
            ctx.globalAlpha *= alphaMul;
            ctx.translate(W / 2 + ((tx + offsetX) / 100) * W, H / 2 + ((ty + offsetY) / 100) * H);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.scale(scale, scale);

            // Apply Masking in local clip space
            if (clip.mask !== 'none') {
              ctx.beginPath();
              if (clip.mask === 'circle') {
                ctx.arc(0, 0, Math.min(W, H) * 0.38, 0, Math.PI * 2);
              } else if (clip.mask === 'rectangle') {
                ctx.roundRect(-W * 0.36, -H * 0.36, W * 0.72, H * 0.72, 24);
              } else if (clip.mask === 'diamond') {
                ctx.moveTo(0, -H * 0.42);
                ctx.lineTo(W * 0.42, 0);
                ctx.lineTo(0, H * 0.42);
                ctx.lineTo(-W * 0.42, 0);
                ctx.closePath();
              } else if (clip.mask === 'linear-wipe') {
                ctx.rect(-W / 2, -H / 2, W * 0.75, H);
              }
              ctx.clip();
            }

            if (clip.mediaType === 'image' && clip.sourceUrl) {
              const img = imageCacheRef.current.get(clip.sourceUrl);
              if (img && img.complete && img.naturalWidth > 0) {
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const canvasAspect = W / H;
                let dw = W;
                let dh = H;
                if (imgAspect > canvasAspect) {
                  dh = H;
                  dw = H * imgAspect;
                } else {
                  dw = W;
                  dh = W / imgAspect;
                }
                const sx = (clip.transform.cropLeft / 100) * img.naturalWidth;
                const sy = (clip.transform.cropTop / 100) * img.naturalHeight;
                const sw =
                  img.naturalWidth *
                  (1 - (clip.transform.cropLeft + clip.transform.cropRight) / 100);
                const sh =
                  img.naturalHeight *
                  (1 - (clip.transform.cropTop + clip.transform.cropBottom) / 100);
                ctx.drawImage(img, sx, sy, Math.max(1, sw), Math.max(1, sh), -dw / 2, -dh / 2, dw, dh);
              }
            } else if (clip.mediaType === 'video' && clip.sourceUrl) {
              const vid = videoCacheRef.current.get(clip.sourceUrl);
              if (vid && vid.readyState >= 2) {
                const sourceTime =
                  clip.freezeFrameAt != null
                    ? clip.freezeFrameAt
                    : clip.reversed
                      ? Math.max(0, (vid.duration || clip.duration) - (clip.inPoint + localTime * clip.speed))
                      : clip.inPoint + localTime * clip.speed;
                if (Math.abs(vid.currentTime - sourceTime) > 0.12) {
                  try {
                    vid.currentTime = Math.max(0, sourceTime);
                  } catch {
                    // ignore seek bounds
                  }
                }
                ctx.drawImage(vid, -W / 2, -H / 2, W, H);
              }
            } else if (clip.mediaType === 'shape') {
              const color = clip.accentColor || '#8B5CF6';
              ctx.strokeStyle = color;
              ctx.fillStyle = color;
              ctx.lineWidth = Math.max(4, W * 0.008);
              const r = Math.min(W, H) * 0.24;
              if (clip.shapeKind === 'ring') {
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.setLineDash([18, 14]);
                ctx.arc(0, 0, r * 1.22, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
              } else if (clip.shapeKind === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
              } else if (clip.shapeKind === 'lower-third') {
                ctx.fillStyle = 'rgba(9, 9, 13, 0.86)';
                ctx.beginPath();
                ctx.roundRect(-W * 0.38, H * 0.24, W * 0.56, H * 0.12, 12);
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.stroke();
              } else {
                ctx.beginPath();
                ctx.roundRect(-r, -r * 0.65, r * 2, r * 1.3, 18);
                ctx.fill();
              }
            } else if (clip.mediaType === 'text' || clip.mediaType === 'sticker') {
              const rawText = clip.textContent || clip.name;
              const fontSize = Math.round(((clip.fontSize || 48) / 540) * H);
              ctx.font = `700 ${fontSize}px "${clip.fontFamily || 'Outfit'}", sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              let visibleText = rawText;
              let animY = 0;
              let animScale = 1;
              if (clip.textAnimation === 'typewriter' && localTime > 0) {
                const chars = Math.max(
                  1,
                  Math.floor(rawText.length * Math.min(1, localTime / Math.max(0.4, clip.duration * 0.6)))
                );
                visibleText = rawText.slice(0, chars);
              } else if (clip.textAnimation === 'pop' && localTime > 0 && localTime < 0.35) {
                animScale = Math.max(0.65, evaluateEasing(localTime / 0.35, 'overshoot'));
              } else if (clip.textAnimation === 'slide-up' && localTime > 0 && localTime < 0.45) {
                animY = (1 - evaluateEasing(localTime / 0.45, 'easeOut')) * 36;
              }

              ctx.scale(animScale, animScale);
              ctx.lineWidth = Math.max(3, fontSize * 0.1);
              ctx.strokeStyle = 'rgba(9, 9, 13, 0.85)';
              ctx.strokeText(visibleText, 0, animY);

              if (clip.textAnimation === 'karaoke') {
                const words = visibleText.split(' ');
                const activeIdx = Math.floor((localTime / Math.max(0.2, clip.duration)) * words.length);
                const fullWidth = ctx.measureText(visibleText).width;
                let cursorX = -fullWidth / 2;
                ctx.textAlign = 'left';
                words.forEach((word, idx) => {
                  const piece = idx < words.length - 1 ? `${word} ` : word;
                  ctx.fillStyle = idx <= activeIdx ? '#A78BFA' : clip.textColor || '#FFFFFF';
                  ctx.fillText(piece, cursorX, animY);
                  cursorX += ctx.measureText(piece).width;
                });
              } else {
                ctx.fillStyle = clip.textColor || '#FFFFFF';
                ctx.fillText(visibleText, 0, animY);
              }
            }

            ctx.restore();
          };

          // Motion blur multi-sample ghost trail when enabled
          if (clip.effects.motionBlur > 15) {
            const step = (clip.effects.motionBlur / 100) * 2.4;
            drawSinglePass(-step * 2, -step, 0.22);
            drawSinglePass(-step, -step * 0.5, 0.38);
          }
          drawSinglePass(0, 0, 1);

          //LUT & Chroma Key Pixel Pass when LUT != 'none' or ChromaKey enabled
          if (clip.effects.lut !== 'none' || clip.chromaKey.enabled) {
            const frame = ctx.getImageData(0, 0, W, H);
            const px = frame.data;
            const [kr, kg, kb] = hexToRgb(clip.chromaKey.keyColor);
            const sim = clip.chromaKey.similarity * 2.2;
            // Sample every pixel cleanly
            for (let i = 0; i < px.length; i += 4) {
              let r = px[i];
              let g = px[i + 1];
              let b = px[i + 2];
              if (clip.chromaKey.enabled) {
                const d = Math.hypot(r - kr, g - kg, b - kb);
                if (d < sim) {
                  px[i] = 9;
                  px[i + 1] = 9;
                  px[i + 2] = 13;
                  continue;
                }
              }
              if (clip.effects.lut !== 'none') {
                [r, g, b] = applyLutColorMatrix(r, g, b, clip.effects.lut);
                px[i] = r;
                px[i + 1] = g;
                px[i + 2] = b;
              }
            }
            ctx.putImageData(frame, 0, 0);
          }

          // Vignette Overlay
          if (clip.effects.vignette > 0) {
            const grad = ctx.createRadialGradient(
              W / 2,
              H / 2,
              Math.min(W, H) * 0.25,
              W / 2,
              H / 2,
              Math.max(W, H) * 0.72
            );
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${(clip.effects.vignette / 100) * 0.78})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
          }

          ctx.restore();
        }
      }

      // Draw Motion Path trajectory overlay in Motion Graphics mode (only on preview canvas, skipped during Export)
      if (showMotionPath && canvas === previewCanvasRef.current && selectedClip) {
        const xKfs = selectedClip.keyframes.filter((k) => k.property === 'x');
        const yKfs = selectedClip.keyframes.filter((k) => k.property === 'y');
        if (xKfs.length > 0 || yKfs.length > 0) {
          ctx.save();
          ctx.strokeStyle = '#A78BFA';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          for (let step = 0; step <= 24; step++) {
            const sampleT = selectedClip.startTime + (step / 24) * selectedClip.duration;
            const sx = W / 2 + (interpolateClipProperty(selectedClip, 'x', sampleT) / 100) * W;
            const sy = H / 2 + (interpolateClipProperty(selectedClip, 'y', sampleT) / 100) * H;
            if (step === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      ctx.restore();
    },
    [timeline, showMotionPath, selectedClip]
  );

  // On-demand render when paused or when state/playhead updates
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const { w, h } = getCanvasLogicalSize();
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!isPlaying) {
      renderCompositeFrame(canvas, playhead);
    }
  }, [playhead, timeline, showMotionPath, isPlaying, mediaReadyTick, getCanvasLogicalSize, renderCompositeFrame]);

  // Stop active Web Audio nodes helper
  const stopAudioPlayback = useCallback(() => {
    for (const node of activeAudioNodesRef.current) {
      try {
        node.stop();
      } catch {
        // ignore already stopped
      }
    }
    activeAudioNodesRef.current = [];
  }, []);

  // Playback loop (ONLY runs while isPlaying === true; throttles React timecode setState to ~15Hz)
  useEffect(() => {
    if (!isPlaying) {
      stopAudioPlayback();
      return;
    }

    // Schedule synthesized audio clips on Audio tracks
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
        const actx = audioCtxRef.current;
        if (actx.state === 'suspended') actx.resume();

        const startOffset = playheadRef.current;
        for (const track of timeline.tracks) {
          if (track.kind !== 'audio' || track.muted) continue;
          const aClips = timeline.clips.filter(
            (c) => c.trackId === track.id && c.synthPreset && c.startTime + c.duration > startOffset
          );
          for (const clip of aClips) {
            const synth = synthesizePresetSamples(clip.synthPreset!, actx.sampleRate);
            const buf = actx.createBuffer(2, synth.left.length, actx.sampleRate);
            buf.getChannelData(0).set(synth.left);
            buf.getChannelData(1).set(synth.right);
            const src = actx.createBufferSource();
            src.buffer = buf;
            const gain = actx.createGain();
            gain.gain.value = clip.volume * 0.7;
            src.connect(gain).connect(actx.destination);

            const when = actx.currentTime + Math.max(0, clip.startTime - startOffset);
            const clipOffset = Math.max(0, startOffset - clip.startTime);
            const playDur = Math.max(0.05, clip.duration - clipOffset);
            src.start(when, clipOffset, playDur);
            activeAudioNodesRef.current.push(src);
          }
        }
      }
    } catch {
      // Audio playback optional in headless environments
    }

    let rafId = 0;
    let lastTs = performance.now();
    let lastStateSync = lastTs;

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      let nextTime = playheadRef.current + dt;

      if (nextTime >= timeline.duration) {
        playheadRef.current = 0;
        setPlayhead(0);
        setIsPlaying(false);
        return;
      }

      playheadRef.current = nextTime;
      if (previewCanvasRef.current) {
        renderCompositeFrame(previewCanvasRef.current, nextTime);
      }
      if (now - lastStateSync >= 66) {
        lastStateSync = now;
        setPlayhead(nextTime);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      stopAudioPlayback();
    };
  }, [isPlaying, timeline, renderCompositeFrame, stopAudioPlayback]);

  // Keyboard shortcuts (Space = Play/Pause, S = Split, ArrowLeft/Right = Frame Step)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === ',' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        const next = Math.max(0, playheadRef.current - 1 / timeline.fps);
        playheadRef.current = next;
        setPlayhead(next);
      } else if (e.key === '.' || e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        const next = Math.min(timeline.duration, playheadRef.current + 1 / timeline.fps);
        playheadRef.current = next;
        setPlayhead(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [timeline.fps, timeline.duration]);

  const updateSelectedClip = (updater: (clip: TimelineClip) => TimelineClip) => {
    if (!selectedClipId) return;
    commitTimeline({
      ...timeline,
      clips: timeline.clips.map((c) => (c.id === selectedClipId ? updater(c) : c)),
    });
  };

  const handleSplitSelected = () => {
    const targetId =
      selectedClipId ||
      timeline.clips.find(
        (c) => playhead >= c.startTime + 0.16 && playhead <= c.startTime + c.duration - 0.16
      )?.id;
    if (!targetId) return;
    const next = splitClipAtTime(timeline, targetId, playhead);
    if (next !== timeline) commitTimeline(next);
  };

  const handleMergeWithNext = () => {
    if (!selectedClip) return;
    const siblings = timeline.clips
      .filter((c) => c.trackId === selectedClip.trackId && c.id !== selectedClip.id)
      .sort((a, b) => a.startTime - b.startTime);
    const neighbor = siblings.find((c) => c.startTime >= selectedClip.startTime);
    if (!neighbor) return;
    commitTimeline(mergeAdjacentClips(timeline, selectedClip.id, neighbor.id));
  };

  const handleFreezeFrame = () => {
    if (!selectedClip) return;
    const freezeClip: TimelineClip = {
      ...JSON.parse(JSON.stringify(selectedClip)),
      id: `freeze_${Date.now()}`,
      name: `${selectedClip.name} (Freeze)`,
      startTime: Number((selectedClip.startTime + selectedClip.duration).toFixed(2)),
      duration: 1.5,
      speed: 1,
      freezeFrameAt: playhead - selectedClip.startTime,
      keyframes: [],
    };
    commitTimeline({
      ...timeline,
      clips: [...timeline.clips, freezeClip],
    });
    setSelectedClipId(freezeClip.id);
  };

  const handleDuplicateClip = () => {
    if (!selectedClip) return;
    const copy: TimelineClip = {
      ...JSON.parse(JSON.stringify(selectedClip)),
      id: `dup_${Date.now()}`,
      name: `${selectedClip.name} Copy`,
      startTime: Number((selectedClip.startTime + selectedClip.duration).toFixed(2)),
    };
    commitTimeline({
      ...timeline,
      clips: [...timeline.clips, copy],
    });
    setSelectedClipId(copy.id);
  };

  const handleDeleteClip = () => {
    if (!selectedClipId) return;
    const remaining = timeline.clips.filter((c) => c.id !== selectedClipId);
    commitTimeline({
      ...timeline,
      clips: remaining,
    });
    setSelectedClipId(remaining[0]?.id || null);
  };

  const handleAddTrack = (kind: TrackKind) => {
    const count = timeline.tracks.filter((t) => t.kind === kind).length + 1;
    const labelMap: Record<TrackKind, string> = {
      video: `Video V${count}`,
      overlay: `Overlay PiP ${count}`,
      motion: `Motion Rig ${count}`,
      text: `Text & Subtitles ${count}`,
      audio: `Audio A${count}`,
    };
    const newTrack = {
      id: `trk_${kind}_${Date.now()}`,
      name: labelMap[kind],
      kind,
      muted: false,
      solo: false,
      locked: false,
      hidden: false,
    };
    commitTimeline({
      ...timeline,
      tracks: [newTrack, ...timeline.tracks],
    });
  };

  const handleAddTextClip = (textLabel: string = 'NEW KINETIC TITLE') => {
    let textTrack = timeline.tracks.find((t) => t.kind === 'text');
    let nextTracks = timeline.tracks;
    if (!textTrack) {
      textTrack = {
        id: `trk_txt_${Date.now()}`,
        name: 'Titles & Subtitles',
        kind: 'text',
        muted: false,
        solo: false,
        locked: false,
        hidden: false,
      };
      nextTracks = [textTrack, ...timeline.tracks];
    }
    const newClip: TimelineClip = {
      id: `clip_txt_${Date.now()}`,
      trackId: textTrack.id,
      name: textLabel,
      mediaType: 'text',
      textContent: textLabel,
      fontFamily: 'Outfit',
      fontSize: 52,
      textColor: '#FFFFFF',
      textAnimation: 'pop',
      startTime: Number(playhead.toFixed(2)),
      duration: 3.0,
      inPoint: 0,
      speed: 1,
      reversed: false,
      transform: createDefaultTransform(),
      blendMode: 'source-over',
      mask: 'none',
      chromaKey: createDefaultChromaKey(),
      effects: { ...createDefaultEffects(), glow: 20 },
      transitionIn: 'crossfade',
      transitionDuration: 0.3,
      keyframes: [],
      volume: 0,
      fadeIn: 0,
      fadeOut: 0,
    };
    commitTimeline({
      ...timeline,
      tracks: nextTracks,
      clips: [...timeline.clips, newClip],
    });
    setSelectedClipId(newClip.id);
  };

  const handleAddMotionShape = (shapeKind: 'ring' | 'circle' | 'lower-third') => {
    let motionTrack = timeline.tracks.find((t) => t.kind === 'motion' || t.kind === 'overlay');
    let nextTracks = timeline.tracks;
    if (!motionTrack) {
      motionTrack = {
        id: `trk_mot_${Date.now()}`,
        name: 'Motion Graphics',
        kind: 'motion',
        muted: false,
        solo: false,
        locked: false,
        hidden: false,
      };
      nextTracks = [motionTrack, ...timeline.tracks];
    }
    const newClip: TimelineClip = {
      id: `clip_shp_${Date.now()}`,
      trackId: motionTrack.id,
      name: `Motion ${shapeKind}`,
      mediaType: 'shape',
      shapeKind,
      accentColor: '#8B5CF6',
      startTime: Number(playhead.toFixed(2)),
      duration: 4.0,
      inPoint: 0,
      speed: 1,
      reversed: false,
      transform: createDefaultTransform(),
      blendMode: 'screen',
      mask: 'none',
      chromaKey: createDefaultChromaKey(),
      effects: { ...createDefaultEffects(), glow: 32, motionBlur: 25 },
      transitionIn: 'zoom-burst',
      transitionDuration: 0.4,
      keyframes: [
        { id: `kf_${Date.now()}_1`, timeOffset: 0, property: 'rotation', value: 0, easing: 'easeInOut' },
        { id: `kf_${Date.now()}_2`, timeOffset: 4, property: 'rotation', value: 180, easing: 'overshoot' },
      ],
      volume: 0,
      fadeIn: 0,
      fadeOut: 0,
    };
    commitTimeline({
      ...timeline,
      tracks: nextTracks,
      clips: [...timeline.clips, newClip],
    });
    setSelectedClipId(newClip.id);
  };

  const handleInsertMediaAsset = (
    name: string,
    url: string,
    mediaType: 'image' | 'video' | 'audio',
    synthPreset?: string
  ) => {
    const targetKind: TrackKind = mediaType === 'audio' ? 'audio' : 'video';
    let track = timeline.tracks.find((t) => t.kind === targetKind);
    let nextTracks = timeline.tracks;
    if (!track) {
      track = {
        id: `trk_${targetKind}_${Date.now()}`,
        name: targetKind === 'audio' ? 'Audio Track' : 'Video Track',
        kind: targetKind,
        muted: false,
        solo: false,
        locked: false,
        hidden: false,
      };
      nextTracks = [...timeline.tracks, track];
    }

    const newClip: TimelineClip = {
      id: `clip_med_${Date.now()}`,
      trackId: track.id,
      name,
      mediaType,
      sourceUrl: url || undefined,
      synthPreset,
      startTime: Number(playhead.toFixed(2)),
      duration: mediaType === 'audio' ? 6 : 4,
      inPoint: 0,
      speed: 1,
      reversed: false,
      transform: createDefaultTransform(),
      blendMode: 'source-over',
      mask: 'none',
      chromaKey: createDefaultChromaKey(),
      effects: createDefaultEffects(),
      transitionIn: 'crossfade',
      transitionDuration: 0.4,
      keyframes: [],
      volume: 0.9,
      fadeIn: 0.2,
      fadeOut: 0.3,
    };
    commitTimeline({
      ...timeline,
      tracks: nextTracks,
      clips: [...timeline.clips, newClip],
    });
    setSelectedClipId(newClip.id);
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    const kind = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : 'image';
    handleInsertMediaAsset(file.name, objUrl, kind);
    e.target.value = '';
  };

  const handleAddOrUpdateKeyframe = (easing: EasingMode = 'easeInOut') => {
    if (!selectedClip) return;
    const localOffset = Number(
      Math.max(0, Math.min(selectedClip.duration, playhead - selectedClip.startTime)).toFixed(2)
    );
    const currentVal = interpolateClipProperty(selectedClip, activeKfProp, playhead);
    updateSelectedClip((clip) => {
      const filtered = clip.keyframes.filter(
        (k) => !(k.property === activeKfProp && Math.abs(k.timeOffset - localOffset) < 0.08)
      );
      return {
        ...clip,
        keyframes: [
          ...filtered,
          {
            id: `kf_${Date.now()}`,
            timeOffset: localOffset,
            property: activeKfProp,
            value: Number(currentVal.toFixed(2)),
            easing,
          },
        ],
      };
    });
  };

  // SVG path string for the active Easing Curve in Graph Editor
  const buildEasingSvgPath = (easing: EasingMode) => {
    const pts: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const v = evaluateEasing(t, easing);
      const sx = 16 + t * 188;
      const sy = 112 - v * 84;
      pts.push(`${i === 0 ? 'M' : 'L'} ${sx.toFixed(1)} ${sy.toFixed(1)}`);
    }
    return pts.join(' ');
  };

  const timelineWidthPx = Math.max(720, Math.ceil((timeline.duration + 2) * zoomPxPerSec));

  return (
    <div className="min-h-screen lg:h-screen bg-[#09090D] text-[#F8FAFC] flex flex-col overflow-x-hidden">
      {/* Studio Top Bar */}
      <header className="h-13 px-3 sm:px-5 bg-[#0E0E15] border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onBackToDashboard();
            }}
            aria-label="Back to Home Dashboard"
            className="min-h-[38px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-slate-200 flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </button>

          <input
            type="text"
            aria-label="Project title"
            value={projectName}
            onChange={(e) => onRenameProject(e.target.value)}
            className="font-display text-sm font-semibold bg-transparent border border-transparent hover:border-white/[0.1] focus:border-violet-500 rounded px-2 py-1 text-white truncate max-w-[180px] sm:max-w-[260px] focus:outline-none"
          />

          <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap">
            {mode === 'motion' ? 'Motion Graphics & Keyframe Rig' : 'Multi-Track Video Engine'}
          </span>
        </div>

        {/* Aspect Ratio + FPS + Undo/Redo + Export */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label="Timeline aspect ratio"
            value={timeline.aspectRatio}
            onChange={(e) =>
              commitTimeline({
                ...timeline,
                aspectRatio: e.target.value as TimelineState['aspectRatio'],
              })
            }
            className="hidden sm:block px-2.5 py-1.5 rounded-lg bg-[#14141F] border border-white/[0.1] text-xs text-slate-200 font-mono"
          >
            <option value="16:9">16:9 Widescreen</option>
            <option value="9:16">9:16 Reels / Shorts</option>
            <option value="1:1">1:1 Square</option>
            <option value="4:5">4:5 Portrait</option>
          </select>

          <button
            type="button"
            aria-label="Undo edit"
            disabled={!historyRef.current.canUndo}
            onClick={handleUndo}
            className="min-h-[38px] min-w-[38px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 flex items-center justify-center text-slate-200"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Redo edit"
            disabled={!historyRef.current.canRedo}
            onClick={handleRedo}
            className="min-h-[38px] min-w-[38px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 flex items-center justify-center text-slate-200"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setShowExportModal(true);
            }}
            className="px-3.5 py-2 min-h-[38px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export 4K</span>
          </button>
        </div>
      </header>

      {/* Upper Workspace: Viewport + Right Inspector */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 border-b border-white/[0.08]">
        {/* Left Quick Media & Layer Bin (3 cols on lg) */}
        <aside className="lg:col-span-3 bg-[#0E0E15] border-b lg:border-b-0 lg:border-r border-white/[0.08] p-3 flex flex-col gap-3 overflow-y-auto max-h-[320px] lg:max-h-none">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold text-slate-200">Studio Assets & Tools</h2>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="px-2.5 py-1.5 min-h-[34px] rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Media</span>
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="video/*,image/*,audio/*"
              aria-label="Import local video, photo, or audio"
              className="hidden"
              onChange={handleLocalFileUpload}
            />
          </div>

          {/* Quick Generators: Text, Subtitles, Shapes */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleAddTextClip('CHAMPIONS CUT')}
              className="p-2.5 min-h-[40px] rounded-lg bg-[#151521] hover:bg-[#1D1D2D] border border-white/[0.07] text-xs font-medium text-slate-200 flex items-center gap-2"
            >
              <TypeIcon className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="truncate">Add Title</span>
            </button>
            <button
              type="button"
              onClick={onOpenAiSubtitles}
              className="p-2.5 min-h-[40px] rounded-lg bg-[#151521] hover:bg-[#1D1D2D] border border-white/[0.07] text-xs font-medium text-slate-200 flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="truncate">Auto Captions</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddMotionShape('ring')}
              className="p-2.5 min-h-[40px] rounded-lg bg-[#151521] hover:bg-[#1D1D2D] border border-white/[0.07] text-xs font-medium text-slate-200 flex items-center gap-2"
            >
              <Film className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="truncate">Motion Ring</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddMotionShape('lower-third')}
              className="p-2.5 min-h-[40px] rounded-lg bg-[#151521] hover:bg-[#1D1D2D] border border-white/[0.07] text-xs font-medium text-slate-200 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="truncate">Lower Third</span>
            </button>
          </div>

          {/* Studio Plates */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Click Plate to Insert at Playhead
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Stadium Strike', url: STUDIO_MEDIA_ASSETS.football },
                { name: 'Tokyo Rain 35mm', url: STUDIO_MEDIA_ASSETS.cinematic },
                { name: 'Studio Portrait', url: STUDIO_MEDIA_ASSETS.portrait },
                { name: 'Golden Skate 9:16', url: STUDIO_MEDIA_ASSETS.verticalReel },
              ].map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => handleInsertMediaAsset(item.name, item.url, 'image')}
                  className="group relative rounded-lg overflow-hidden aspect-video bg-[#181824] border border-white/[0.08] hover:border-violet-500 text-left"
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <span className="absolute bottom-1 left-1.5 right-1.5 text-[10px] font-medium text-white truncate">
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Built-in Score & SFX Inserts */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Royalty-Free Music & SFX
            </span>
            <div className="space-y-1">
              {STUDIO_AUDIO_LIBRARY.slice(0, 4).map((aud) => (
                <button
                  key={aud.id}
                  type="button"
                  onClick={() => handleInsertMediaAsset(aud.name, '', 'audio', aud.id)}
                  className="w-full px-2.5 py-2 rounded-lg bg-[#14141F] hover:bg-[#1C1C2B] border border-white/[0.06] flex items-center justify-between text-xs text-slate-200"
                >
                  <span className="truncate">{aud.name}</span>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0 ml-2">
                    {aud.duration}s
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Canvas Monitor & Transport (5 cols on lg) */}
        <section className="lg:col-span-5 bg-[#09090D] flex flex-col items-center justify-between p-3 sm:p-4 min-h-[280px]">
          <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
            <canvas
              ref={previewCanvasRef}
              data-testid="video-compositor-canvas"
              className="max-w-full max-h-[280px] lg:max-h-[340px] rounded-xl border border-white/[0.1] shadow-2xl bg-black object-contain"
            />
          </div>

          {/* Frame-Accurate Transport Controls */}
          <div className="w-full pt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] mt-3">
            <span
              aria-label="Current playhead timecode"
              className="font-mono text-xs sm:text-sm font-semibold text-violet-300 tabular-nums"
            >
              {formatTimecode(playhead, timeline.fps)}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous frame"
                onClick={() => {
                  setIsPlaying(false);
                  const prev = Math.max(0, playhead - 1 / timeline.fps);
                  playheadRef.current = prev;
                  setPlayhead(prev);
                }}
                className="min-h-[38px] min-w-[38px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                aria-label={isPlaying ? 'Pause playback' : 'Play timeline'}
                onClick={() => setIsPlaying((p) => !p)}
                className="min-h-[40px] px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center gap-1.5 text-xs font-semibold"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                aria-label="Next frame"
                onClick={() => {
                  setIsPlaying(false);
                  const next = Math.min(timeline.duration, playhead + 1 / timeline.fps);
                  playheadRef.current = next;
                  setPlayhead(next);
                }}
                className="min-h-[38px] min-w-[38px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {formatTimecode(timeline.duration, timeline.fps)}
            </span>
          </div>
        </section>

        {/* Right Clip & Keyframe Inspector (4 cols on lg) */}
        <aside className="lg:col-span-4 bg-[#0E0E15] border-t lg:border-t-0 lg:border-l border-white/[0.08] flex flex-col min-h-0 max-h-[380px] lg:max-h-none">
          <div className="p-2 border-b border-white/[0.08] grid grid-cols-3 gap-1">
            {(
              [
                { id: 'transform', label: 'Transform & Speed' },
                { id: 'effects', label: 'Color & Chroma' },
                { id: 'keyframes', label: 'Keyframes & Graph' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInspectorTab(tab.id)}
                className={`py-1.5 px-2 min-h-[34px] rounded-md text-[11px] font-semibold transition-colors truncate ${
                  inspectorTab === tab.id
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white bg-white/[0.03]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
            {!selectedClip ? (
              <p className="text-slate-400 text-center py-8">
                Select any clip on the multi-track timeline below to inspect properties, keyframes,
                and effects.
              </p>
            ) : inspectorTab === 'transform' ? (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white truncate">{selectedClip.name}</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {selectedClip.duration.toFixed(2)}s
                  </span>
                </div>

                {selectedClip.mediaType === 'text' && (
                  <div className="space-y-2 rounded-lg bg-[#14141F] p-2.5 border border-white/[0.06]">
                    <label htmlFor="clip-text-edit" className="block text-[11px] text-slate-300">
                      Caption / Title Text
                    </label>
                    <input
                      id="clip-text-edit"
                      type="text"
                      value={selectedClip.textContent || ''}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({ ...c, textContent: e.target.value, name: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-[#09090D] border border-white/[0.1] text-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="Title font family"
                        value={selectedClip.fontFamily || 'Outfit'}
                        onChange={(e) =>
                          updateSelectedClip((c) => ({ ...c, fontFamily: e.target.value }))
                        }
                        className="px-2 py-1.5 rounded bg-[#09090D] border border-white/[0.1] text-white"
                      >
                        <option value="Outfit">Outfit Sans</option>
                        <option value="Oswald">Oswald Bold</option>
                        <option value="Playfair Display">Playfair Serif</option>
                        <option value="Cinzel">Cinzel Cinema</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                      </select>
                      <select
                        aria-label="Title kinetic animation"
                        value={selectedClip.textAnimation || 'pop'}
                        onChange={(e) =>
                          updateSelectedClip((c) => ({
                            ...c,
                            textAnimation: e.target.value as TimelineClip['textAnimation'],
                          }))
                        }
                        className="px-2 py-1.5 rounded bg-[#09090D] border border-white/[0.1] text-white"
                      >
                        <option value="pop">Pop Bounce</option>
                        <option value="slide-up">Slide Up</option>
                        <option value="typewriter">Typewriter</option>
                        <option value="karaoke">Karaoke Highlight</option>
                        <option value="none">Static</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Scale, Position X/Y, Rotation, Opacity */}
                {(
                  [
                    { label: 'Scale', prop: 'scale', min: 0.2, max: 3.0, step: 0.05 },
                    { label: 'Position X (%)', prop: 'x', min: -60, max: 60, step: 1 },
                    { label: 'Position Y (%)', prop: 'y', min: -60, max: 60, step: 1 },
                    { label: 'Rotation (°)', prop: 'rotation', min: -180, max: 180, step: 1 },
                    { label: 'Opacity', prop: 'opacity', min: 0, max: 1, step: 0.05 },
                  ] as const
                ).map((ctrl) => (
                  <div key={ctrl.prop} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{ctrl.label}</span>
                      <span className="font-mono text-slate-200 tabular-nums">
                        {selectedClip.transform[ctrl.prop]}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={ctrl.label}
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={selectedClip.transform[ctrl.prop]}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          transform: { ...c.transform, [ctrl.prop]: Number(e.target.value) },
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                ))}

                {/* Speed Control, Reverse, Stabilization */}
                <div className="pt-2 border-t border-white/[0.06] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Speed Control / Ramp</span>
                    <span className="font-mono text-violet-300 tabular-nums">
                      {selectedClip.speed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Clip playback speed"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={selectedClip.speed}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({ ...c, speed: Number(e.target.value) }))
                    }
                    className="w-full"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateSelectedClip((c) => ({ ...c, reversed: !c.reversed }))}
                      className={`flex-1 py-1.5 min-h-[34px] rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 ${
                        selectedClip.reversed
                          ? 'bg-violet-600/25 border-violet-500 text-violet-200'
                          : 'bg-[#14141F] border-white/[0.08] text-slate-300'
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>Reverse</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedClip((c) => ({
                          ...c,
                          effects: { ...c.effects, stabilize: !c.effects.stabilize },
                        }))
                      }
                      className={`flex-1 py-1.5 min-h-[34px] rounded-lg border text-[11px] font-medium ${
                        selectedClip.effects.stabilize
                          ? 'bg-violet-600/25 border-violet-500 text-violet-200'
                          : 'bg-[#14141F] border-white/[0.08] text-slate-300'
                      }`}
                    >
                      Stabilize
                    </button>
                  </div>
                </div>
              </div>
            ) : inspectorTab === 'effects' ? (
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="lut-select" className="text-[11px] text-slate-300">
                      Cinema LUT
                    </label>
                    <select
                      id="lut-select"
                      value={selectedClip.effects.lut}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          effects: { ...c.effects, lut: e.target.value as LutPresetId },
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded bg-[#14141F] border border-white/[0.1] text-white"
                    >
                      <option value="none">Rec.709 Natural</option>
                      <option value="teal-amber">Teal & Amber</option>
                      <option value="kodak-2383">Kodak 2383 Print</option>
                      <option value="bleach-stadium">Bleach Stadium</option>
                      <option value="noir-silver">Noir Silver</option>
                      <option value="golden-velvia">Golden Hour</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="trans-select" className="text-[11px] text-slate-300">
                      Entry Transition
                    </label>
                    <select
                      id="trans-select"
                      value={selectedClip.transitionIn}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          transitionIn: e.target.value as TransitionType,
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded bg-[#14141F] border border-white/[0.1] text-white"
                    >
                      <option value="none">Hard Cut</option>
                      <option value="crossfade">Cross Dissolve</option>
                      <option value="whip-pan">Whip Pan</option>
                      <option value="zoom-burst">Zoom Burst</option>
                      <option value="wipe-left">Linear Wipe</option>
                      <option value="dip-to-black">Dip to Black</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="blend-select" className="text-[11px] text-slate-300">
                      Blend Mode
                    </label>
                    <select
                      id="blend-select"
                      value={selectedClip.blendMode}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          blendMode: e.target.value as BlendModeType,
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded bg-[#14141F] border border-white/[0.1] text-white"
                    >
                      <option value="source-over">Normal</option>
                      <option value="screen">Screen</option>
                      <option value="multiply">Multiply</option>
                      <option value="overlay">Overlay</option>
                      <option value="lighten">Lighten</option>
                      <option value="color-dodge">Color Dodge</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="mask-select" className="text-[11px] text-slate-300">
                      Layer Mask
                    </label>
                    <select
                      id="mask-select"
                      value={selectedClip.mask}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          mask: e.target.value as MaskShape,
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded bg-[#14141F] border border-white/[0.1] text-white"
                    >
                      <option value="none">No Mask</option>
                      <option value="circle">Circle PiP Mask</option>
                      <option value="rectangle">Rounded Frame</option>
                      <option value="diamond">Diamond Cut</option>
                      <option value="linear-wipe">Split Wipe</option>
                    </select>
                  </div>
                </div>

                {/* Effects Sliders */}
                {(
                  [
                    { label: 'Contrast', key: 'contrast', min: -50, max: 60 },
                    { label: 'Saturation', key: 'saturation', min: -100, max: 80 },
                    { label: 'Optical Glow', key: 'glow', min: 0, max: 80 },
                    { label: 'Gaussian Blur', key: 'blur', min: 0, max: 24 },
                    { label: 'Motion Blur', key: 'motionBlur', min: 0, max: 80 },
                    { label: 'Cinema Vignette', key: 'vignette', min: 0, max: 80 },
                  ] as const
                ).map((fx) => (
                  <div key={fx.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{fx.label}</span>
                      <span className="font-mono text-slate-200 tabular-nums">
                        {selectedClip.effects[fx.key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={fx.label}
                      min={fx.min}
                      max={fx.max}
                      value={selectedClip.effects[fx.key]}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          effects: { ...c.effects, [fx.key]: Number(e.target.value) },
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                ))}

                {/* Chroma Key / Green Screen */}
                <div className="pt-2 border-t border-white/[0.06] space-y-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-medium text-slate-200">Chroma Key / Green Screen</span>
                    <input
                      type="checkbox"
                      checked={selectedClip.chromaKey.enabled}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          chromaKey: { ...c.chromaKey, enabled: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 accent-violet-600"
                    />
                  </label>
                  {selectedClip.chromaKey.enabled && (
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        aria-label="Chroma key target color"
                        value={selectedClip.chromaKey.keyColor}
                        onChange={(e) =>
                          updateSelectedClip((c) => ({
                            ...c,
                            chromaKey: { ...c.chromaKey, keyColor: e.target.value },
                          }))
                        }
                        className="w-8 h-8 rounded bg-transparent cursor-pointer"
                      />
                      <input
                        type="range"
                        aria-label="Chroma key similarity"
                        min={5}
                        max={75}
                        value={selectedClip.chromaKey.similarity}
                        onChange={(e) =>
                          updateSelectedClip((c) => ({
                            ...c,
                            chromaKey: { ...c.chromaKey, similarity: Number(e.target.value) },
                          }))
                        }
                        className="flex-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Keyframe Animation & Bezier Graph Editor */
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <select
                    aria-label="Keyframe property"
                    value={activeKfProp}
                    onChange={(e) => setActiveKfProp(e.target.value as KeyframeProperty)}
                    className="px-2.5 py-1.5 rounded bg-[#14141F] border border-white/[0.1] text-white"
                  >
                    <option value="scale">Scale</option>
                    <option value="x">Position X</option>
                    <option value="y">Position Y</option>
                    <option value="rotation">Rotation</option>
                    <option value="opacity">Opacity</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleAddOrUpdateKeyframe('easeInOut')}
                    className="px-3 py-1.5 min-h-[34px] rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Add Keyframe ◆</span>
                  </button>
                </div>

                {/* Live Cubic-Bezier Graph Editor */}
                <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-300">
                      Easing Graph Curve
                    </span>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showMotionPath}
                        onChange={(e) => setShowMotionPath(e.target.checked)}
                        className="accent-violet-600"
                      />
                      <span>Motion Path</span>
                    </label>
                  </div>

                  {(() => {
                    const propKfs = selectedClip.keyframes.filter(
                      (k) => k.property === activeKfProp
                    );
                    const currentEasing = propKfs[0]?.easing || 'easeInOut';
                    return (
                      <>
                        <svg
                          viewBox="0 0 220 128"
                          className="w-full h-28 bg-[#0E0E15] rounded-lg border border-white/[0.05]"
                        >
                          <line x1="16" y1="112" x2="204" y2="112" stroke="#27273A" strokeWidth="1" />
                          <line x1="16" y1="28" x2="204" y2="28" stroke="#27273A" strokeDasharray="3 3" />
                          <path
                            d={buildEasingSvgPath(currentEasing)}
                            fill="none"
                            stroke="#8B5CF6"
                            strokeWidth="2.5"
                          />
                          <circle cx="16" cy="112" r="4" fill="#F8FAFC" />
                          <circle cx="204" cy="28" r="4" fill="#A78BFA" />
                        </svg>

                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              'linear',
                              'easeIn',
                              'easeOut',
                              'easeInOut',
                              'overshoot',
                              'bounce',
                            ] as EasingMode[]
                          ).map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() =>
                                updateSelectedClip((c) => ({
                                  ...c,
                                  keyframes: c.keyframes.map((k) =>
                                    k.property === activeKfProp ? { ...k, easing: em } : k
                                  ),
                                }))
                              }
                              className={`py-1 px-2 rounded text-[11px] font-medium capitalize ${
                                currentEasing === em
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-[#14141F] text-slate-400 hover:text-white'
                              }`}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Keyframe List */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400">
                    Active {activeKfProp} Keyframes ({selectedClip.keyframes.filter((k) => k.property === activeKfProp).length})
                  </span>
                  {selectedClip.keyframes
                    .filter((k) => k.property === activeKfProp)
                    .sort((a, b) => a.timeOffset - b.timeOffset)
                    .map((kf) => (
                      <div
                        key={kf.id}
                        className="px-2.5 py-1.5 rounded bg-[#14141F] border border-white/[0.06] flex items-center justify-between font-mono text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const t = selectedClip.startTime + kf.timeOffset;
                            playheadRef.current = t;
                            setPlayhead(t);
                          }}
                          className="text-violet-300 hover:underline tabular-nums"
                        >
                          ◆ +{kf.timeOffset.toFixed(2)}s → {kf.value}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove keyframe at ${kf.timeOffset}s`}
                          onClick={() =>
                            updateSelectedClip((c) => ({
                              ...c,
                              keyframes: c.keyframes.filter((item) => item.id !== kf.id),
                            }))
                          }
                          className="text-slate-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Lower Multi-Track Timeline Action Bar + Scrollable Tracks */}
      <div className="h-[250px] sm:h-[265px] bg-[#0B0B11] flex flex-col shrink-0">
        {/* Timeline Edit Toolbar */}
        <div className="px-3 py-1.5 bg-[#101018] border-b border-white/[0.08] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleSplitSelected}
              className="px-2.5 py-1.5 min-h-[34px] rounded-md bg-white/[0.06] hover:bg-violet-600 text-xs font-medium text-white flex items-center gap-1.5 whitespace-nowrap"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Split Clip</span>
            </button>
            <button
              type="button"
              onClick={handleMergeWithNext}
              className="px-2.5 py-1.5 min-h-[34px] rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Merge className="w-3.5 h-3.5" />
              <span>Merge</span>
            </button>
            <button
              type="button"
              onClick={handleFreezeFrame}
              className="px-2.5 py-1.5 min-h-[34px] rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Snowflake className="w-3.5 h-3.5" />
              <span>Freeze</span>
            </button>
            <button
              type="button"
              onClick={handleDuplicateClip}
              aria-label="Duplicate selected clip"
              className="min-h-[34px] min-w-[34px] rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-200"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDeleteClip}
              aria-label="Delete selected clip"
              className="min-h-[34px] min-w-[34px] rounded-md bg-white/[0.06] hover:bg-red-500/20 flex items-center justify-center text-slate-300 hover:text-red-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleAddTrack('video')}
              className="px-2.5 py-1.5 min-h-[34px] rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[11px] font-medium text-slate-200 whitespace-nowrap"
            >
              + Video Track
            </button>
            <button
              type="button"
              onClick={() => handleAddTrack('audio')}
              className="px-2.5 py-1.5 min-h-[34px] rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[11px] font-medium text-slate-200 whitespace-nowrap"
            >
              + Audio Track
            </button>

            <button
              type="button"
              aria-label="Toggle magnetic timeline snapping"
              onClick={() => setSnapping((s) => !s)}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-md text-[11px] font-medium flex items-center gap-1 ${
                snapping ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40' : 'bg-white/[0.05] text-slate-400'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Snap</span>
            </button>

            <button
              type="button"
              aria-label="Zoom out timeline"
              onClick={() => setZoomPxPerSec((z) => Math.max(30, z - 16))}
              className="min-h-[34px] min-w-[34px] rounded-md bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-300"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Zoom in timeline"
              onClick={() => setZoomPxPerSec((z) => Math.min(160, z + 16))}
              className="min-h-[34px] min-w-[34px] rounded-md bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-300"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Multi-Track Headers & Lanes */}
        <div className="flex-1 overflow-auto flex">
          {/* Track Header Column */}
          <div className="w-40 sm:w-48 bg-[#101018] border-r border-white/[0.08] shrink-0">
            <div className="h-7 border-b border-white/[0.08] px-3 flex items-center text-[10px] font-mono text-slate-400">
              TRACKS ({timeline.tracks.length})
            </div>
            {timeline.tracks.map((trk) => (
              <div
                key={trk.id}
                className="h-11 px-2.5 border-b border-white/[0.06] flex items-center justify-between gap-1"
              >
                <span className="text-xs font-medium text-slate-200 truncate">{trk.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Mute ${trk.name}`}
                    onClick={() =>
                      commitTimeline({
                        ...timeline,
                        tracks: timeline.tracks.map((t) =>
                          t.id === trk.id ? { ...t, muted: !t.muted } : t
                        ),
                      })
                    }
                    className={`p-1 rounded ${trk.muted ? 'text-red-400' : 'text-slate-400 hover:text-white'}`}
                  >
                    {trk.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Hide ${trk.name}`}
                    onClick={() =>
                      commitTimeline({
                        ...timeline,
                        tracks: timeline.tracks.map((t) =>
                          t.id === trk.id ? { ...t, hidden: !t.hidden } : t
                        ),
                      })
                    }
                    className={`p-1 rounded ${trk.hidden ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}
                  >
                    {trk.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Lock ${trk.name}`}
                    onClick={() =>
                      commitTimeline({
                        ...timeline,
                        tracks: timeline.tracks.map((t) =>
                          t.id === trk.id ? { ...t, locked: !t.locked } : t
                        ),
                      })
                    }
                    className={`p-1 rounded ${trk.locked ? 'text-violet-400' : 'text-slate-400 hover:text-white'}`}
                  >
                    {trk.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Timeline Canvas Ruler + Clips */}
          <div
            className="relative select-none"
            style={{ width: `${timelineWidthPx}px` }}
          >
            {/* Clickable Time Ruler */}
            <button
              type="button"
              aria-label="Timeline ruler scrubber"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const rawSec = Math.max(0, (e.clientX - rect.left) / zoomPxPerSec);
                const nextSec = snapping
                  ? snapTimeToTargets(rawSec, timeline.clips, playhead)
                  : Number(rawSec.toFixed(2));
                setIsPlaying(false);
                playheadRef.current = nextSec;
                setPlayhead(nextSec);
              }}
              className="w-full h-7 bg-[#13131D] border-b border-white/[0.08] relative block text-left cursor-pointer"
            >
              {Array.from({ length: Math.ceil(timeline.duration) + 2 }).map((_, sec) => (
                <span
                  key={sec}
                  style={{ left: `${sec * zoomPxPerSec}px` }}
                  className="absolute top-1.5 text-[10px] font-mono text-slate-400 pl-1 border-l border-white/[0.15] tabular-nums"
                >
                  {sec}s
                </span>
              ))}
            </button>

            {/* Track Lanes */}
            {timeline.tracks.map((trk) => {
              const clipsOnTrack = timeline.clips.filter((c) => c.trackId === trk.id);
              return (
                <div
                  key={trk.id}
                  className="h-11 border-b border-white/[0.06] relative bg-[#0B0B11]"
                >
                  {clipsOnTrack.map((clip) => {
                    const leftPx = clip.startTime * zoomPxPerSec;
                    const widthPx = Math.max(28, clip.duration * zoomPxPerSec);
                    const isSelected = clip.id === selectedClipId;
                    const toneClass =
                      trk.kind === 'audio'
                        ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-100'
                        : trk.kind === 'text'
                          ? 'bg-amber-900/45 border-amber-500/50 text-amber-100'
                          : 'bg-violet-900/50 border-violet-500/60 text-violet-100';

                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => setSelectedClipId(clip.id)}
                        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                        className={`absolute top-1 bottom-1 rounded-md border px-2 flex items-center justify-between text-[11px] font-medium overflow-hidden transition-shadow ${toneClass} ${
                          isSelected ? 'ring-2 ring-white z-10' : 'hover:brightness-110'
                        }`}
                      >
                        <span className="truncate">{clip.name}</span>
                        {clip.keyframes.length > 0 && (
                          <span className="font-mono text-[10px] text-white/80 ml-1 shrink-0">
                            ◆{clip.keyframes.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Vertical Playhead Needle */}
            <div
              style={{ left: `${playhead * zoomPxPerSec}px` }}
              className="absolute top-0 bottom-0 w-[2px] bg-violet-400 pointer-events-none z-20"
            >
              <div className="w-3 h-3 -ml-[5px] bg-violet-400 rotate-45 -mt-1.5" />
            </div>
          </div>
        </div>
      </div>

      {showExportModal && (
        <ExportModal
          projectName={projectName}
          timeline={timeline}
          renderFrameAtTime={renderCompositeFrame}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
};
