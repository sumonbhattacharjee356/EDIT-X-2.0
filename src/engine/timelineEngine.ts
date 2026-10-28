export type TrackKind = 'video' | 'overlay' | 'motion' | 'text' | 'audio';

export type EasingMode =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'overshoot'
  | 'bounce';

export type BlendModeType =
  | 'source-over'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'lighten'
  | 'color-dodge';

export type MaskShape = 'none' | 'circle' | 'rectangle' | 'linear-wipe' | 'diamond';

export type TransitionType =
  | 'none'
  | 'crossfade'
  | 'dip-to-black'
  | 'whip-pan'
  | 'zoom-burst'
  | 'wipe-left';

export type LutPresetId =
  | 'none'
  | 'teal-amber'
  | 'kodak-2383'
  | 'bleach-stadium'
  | 'noir-silver'
  | 'golden-velvia'
  | 'clean-portrait';

export type KeyframeProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

export interface KeyframePoint {
  id: string;
  timeOffset: number; // relative to clip start (0 .. clip.duration)
  property: KeyframeProperty;
  value: number;
  easing: EasingMode;
  // Custom cubic-bezier control points (0..1)
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
}

export interface SpeedRampPoint {
  position: number; // 0..1 normalized across clip
  multiplier: number; // 0.25..4.0
}

export interface ClipTransform {
  x: number; // percentage offset -100..100
  y: number; // percentage offset -100..100
  scale: number; // 0.1..4.0 (1 = 100%)
  rotation: number; // degrees -360..360
  opacity: number; // 0..1
  cropTop: number; // 0..45%
  cropBottom: number; // 0..45%
  cropLeft: number; // 0..45%
  cropRight: number; // 0..45%
}

export interface ChromaKeyConfig {
  enabled: boolean;
  keyColor: string; // hex e.g. '#00FF00'
  similarity: number; // 0..100
  smoothness: number; // 0..100
}

export interface ClipEffects {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  blur: number; // 0..40 px
  glow: number; // 0..100
  motionBlur: number; // 0..100
  stabilize: boolean;
  vignette: number; // 0..100
  lut: LutPresetId;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  mediaType: 'video' | 'image' | 'text' | 'shape' | 'audio' | 'sticker';
  sourceUrl?: string;
  // Timeline positioning (seconds)
  startTime: number;
  duration: number;
  inPoint: number; // trim offset into source media
  speed: number; // 0.25..4.0
  speedRamp?: SpeedRampPoint[];
  reversed: boolean;
  freezeFrameAt?: number | null;
  // Visual composition
  transform: ClipTransform;
  blendMode: BlendModeType;
  mask: MaskShape;
  chromaKey: ChromaKeyConfig;
  effects: ClipEffects;
  transitionIn: TransitionType;
  transitionDuration: number;
  keyframes: KeyframePoint[];
  // Text / Subtitle / Motion properties
  textContent?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  textAnimation?: 'none' | 'pop' | 'slide-up' | 'typewriter' | 'karaoke';
  shapeKind?: 'rect' | 'circle' | 'ring' | 'lower-third' | 'star';
  accentColor?: string;
  // Audio properties
  volume: number; // 0..2
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  synthPreset?: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface TimelineState {
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  fps: 24 | 25 | 30 | 50 | 60;
  duration: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

export function createDefaultTransform(): ClipTransform {
  return {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
  };
}

export function createDefaultEffects(): ClipEffects {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blur: 0,
    glow: 0,
    motionBlur: 0,
    stabilize: false,
    vignette: 0,
    lut: 'none',
  };
}

export function createDefaultChromaKey(): ChromaKeyConfig {
  return {
    enabled: false,
    keyColor: '#16A34A',
    similarity: 32,
    smoothness: 14,
  };
}

export function formatTimecode(seconds: number, fps: number = 30): string {
  const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalFrames = Math.floor(safeSec * fps + 1e-6);
  const frames = totalFrames % fps;
  const totalWholeSeconds = Math.floor(totalFrames / fps);
  const secs = totalWholeSeconds % 60;
  const mins = Math.floor(totalWholeSeconds / 60) % 60;
  const hrs = Math.floor(totalWholeSeconds / 3600);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

/**
 * Evaluates a 1D cubic bezier curve or standard studio easing function for t in [0, 1].
 */
export function evaluateEasing(
  t: number,
  mode: EasingMode,
  cp1y: number = 0.1,
  cp2y: number = 0.9
): number {
  const u = Math.max(0, Math.min(1, t));
  switch (mode) {
    case 'linear':
      return u;
    case 'easeIn':
      return u * u * u;
    case 'easeOut': {
      const inv = 1 - u;
      return 1 - inv * inv * inv;
    }
    case 'easeInOut':
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case 'overshoot': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      let x = u;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) {
        x -= 1.5 / d1;
        return n1 * x * x + 0.75;
      }
      if (x < 2.5 / d1) {
        x -= 2.25 / d1;
        return n1 * x * x + 0.9375;
      }
      x -= 2.625 / d1;
      return n1 * x * x + 0.984375;
    }
    default: {
      // Explicit Bernstein cubic evaluation for custom control handles
      const inv = 1 - u;
      return 3 * inv * inv * u * cp1y + 3 * inv * u * u * cp2y + u * u * u;
    }
  }
}

/**
 * Computes interpolated property value for a clip at a given timeline playhead time.
 */
export function interpolateClipProperty(
  clip: TimelineClip,
  property: KeyframeProperty,
  playheadTime: number
): number {
  const baseValue = clip.transform[property];
  const kfs = clip.keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.timeOffset - b.timeOffset);

  if (kfs.length === 0) return baseValue;

  const localTime = Math.max(0, Math.min(clip.duration, playheadTime - clip.startTime));

  if (localTime <= kfs[0].timeOffset) return kfs[0].value;
  if (localTime >= kfs[kfs.length - 1].timeOffset) return kfs[kfs.length - 1].value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const curr = kfs[i];
    const next = kfs[i + 1];
    if (localTime >= curr.timeOffset && localTime <= next.timeOffset) {
      const span = Math.max(1e-6, next.timeOffset - curr.timeOffset);
      const rawT = (localTime - curr.timeOffset) / span;
      const easedT = evaluateEasing(rawT, curr.easing, curr.cp1y, curr.cp2y);
      return curr.value + (next.value - curr.value) * easedT;
    }
  }
  return baseValue;
}

/**
 * Splits a clip cleanly at a timeline timestamp, adjusting inPoint, duration, and shifting keyframes.
 */
export function splitClipAtTime(
  state: TimelineState,
  clipId: string,
  splitTime: number
): TimelineState {
  const target = state.clips.find((c) => c.id === clipId);
  if (!target) return state;

  const minSlice = 0.15;
  if (
    splitTime <= target.startTime + minSlice ||
    splitTime >= target.startTime + target.duration - minSlice
  ) {
    return state;
  }

  const leftDuration = Number((splitTime - target.startTime).toFixed(3));
  const rightDuration = Number((target.duration - leftDuration).toFixed(3));
  const rightInPoint = Number((target.inPoint + leftDuration * target.speed).toFixed(3));

  const leftKeyframes = target.keyframes.filter((k) => k.timeOffset <= leftDuration);
  const rightKeyframes = target.keyframes
    .filter((k) => k.timeOffset >= leftDuration)
    .map((k, idx) => ({
      ...k,
      id: `${k.id}_r_${idx}`,
      timeOffset: Number((k.timeOffset - leftDuration).toFixed(3)),
    }));

  const leftClip: TimelineClip = {
    ...target,
    duration: leftDuration,
    keyframes: leftKeyframes,
  };

  const rightClip: TimelineClip = {
    ...target,
    id: `${target.id}_split_${Math.round(splitTime * 1000)}`,
    name: `${target.name} (Part 2)`,
    startTime: splitTime,
    duration: rightDuration,
    inPoint: rightInPoint,
    transitionIn: 'none',
    keyframes: rightKeyframes,
  };

  const nextClips = state.clips.flatMap((c) => (c.id === clipId ? [leftClip, rightClip] : [c]));
  return recomputeTimelineDuration({
    ...state,
    clips: nextClips,
  });
}

/**
 * Merges two adjacent clips on the same track into one continuous clip.
 */
export function mergeAdjacentClips(
  state: TimelineState,
  firstClipId: string,
  secondClipId: string
): TimelineState {
  const c1 = state.clips.find((c) => c.id === firstClipId);
  const c2 = state.clips.find((c) => c.id === secondClipId);
  if (!c1 || !c2 || c1.trackId !== c2.trackId) return state;

  const [left, right] = c1.startTime <= c2.startTime ? [c1, c2] : [c2, c1];
  const mergedDuration = Number(( right.startTime + right.duration - left.startTime ).toFixed(3));

  const mergedClip: TimelineClip = {
    ...left,
    duration: Math.max(left.duration + right.duration, mergedDuration),
    keyframes: [
      ...left.keyframes,
      ...right.keyframes.map((k) => ({
        ...k,
        timeOffset: Number((k.timeOffset + (right.startTime - left.startTime)).toFixed(3)),
      })),
    ],
  };

  const nextClips = state.clips
    .filter((c) => c.id !== left.id && c.id !== right.id)
    .concat(mergedClip);

  return recomputeTimelineDuration({
    ...state,
    clips: nextClips,
  });
}

/**
 * Snaps a candidate timeline timestamp to nearby clip edges, playhead, or whole-second grid.
 */
export function snapTimeToTargets(
  candidateTime: number,
  clips: TimelineClip[],
  playheadTime: number,
  excludeClipId?: string,
  thresholdSeconds: number = 0.18
): number {
  const clamped = Math.max(0, candidateTime);
  const targets: number[] = [0, playheadTime, Math.round(clamped)];

  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;
    targets.push(clip.startTime);
    targets.push(clip.startTime + clip.duration);
  }

  let best = clamped;
  let minDiff = thresholdSeconds;
  for (const t of targets) {
    const diff = Math.abs(clamped - t);
    if (diff < minDiff) {
      minDiff = diff;
      best = t;
    }
  }
  return Number(best.toFixed(3));
}

export function recomputeTimelineDuration(state: TimelineState): TimelineState {
  let maxEnd = 8;
  for (const clip of state.clips) {
    maxEnd = Math.max(maxEnd, clip.startTime + clip.duration);
  }
  return {
    ...state,
    duration: Number(Math.ceil(maxEnd * 10) / 10),
  };
}

/**
 * Immutable Undo/Redo History Stack for non-destructive editing.
 */
export class HistoryManager<T> {
  private past: T[] = [];
  private present: T;
  private future: T[] = [];
  private maxDepth: number;

  constructor(initialState: T, maxDepth: number = 50) {
    this.present = initialState;
    this.maxDepth = maxDepth;
  }

  get current(): T {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  push(nextState: T): T {
    this.past.push(this.present);
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.present = nextState;
    this.future = [];
    return this.present;
  }

  undo(): T {
    if (this.past.length === 0) return this.present;
    const prev = this.past.pop()!;
    this.future.unshift(this.present);
    this.present = prev;
    return this.present;
  }

  redo(): T {
    if (this.future.length === 0) return this.present;
    const next = this.future.shift()!;
    this.past.push(this.present);
    this.present = next;
    return this.present;
  }
}

/**
 * Local DSP energy analyzer for Smart Silence Trimming & Highlight Peak Detection.
 */
export function detectHighlightsAndActiveSegments(
  rmsEnvelope: number[],
  windowDurationSec: number,
  silenceThreshold: number = 0.06,
  highlightPercentile: number = 0.8
): {
  activeSegments: Array<{ start: number; end: number }>;
  highlights: Array<{ time: number; score: number }>;
} {
  if (rmsEnvelope.length === 0 || windowDurationSec <= 0) {
    return { activeSegments: [], highlights: [] };
  }

  const activeSegments: Array<{ start: number; end: number }> = [];
  let inActive = false;
  let segStart = 0;

  for (let i = 0; i < rmsEnvelope.length; i++) {
    const val = rmsEnvelope[i];
    const t = i * windowDurationSec;
    if (val >= silenceThreshold && !inActive) {
      inActive = true;
      segStart = t;
    } else if (val < silenceThreshold && inActive) {
      inActive = false;
      activeSegments.push({
        start: Number(segStart.toFixed(2)),
        end: Number(t.toFixed(2)),
      });
    }
  }
  if (inActive) {
    activeSegments.push({
      start: Number(segStart.toFixed(2)),
      end: Number((rmsEnvelope.length * windowDurationSec).toFixed(2)),
    });
  }

  const sorted = [...rmsEnvelope].sort((a, b) => a - b);
  const cutoffIdx = Math.min(sorted.length - 1, Math.floor(sorted.length * highlightPercentile));
  const peakCutoff = Math.max(silenceThreshold * 1.5, sorted[cutoffIdx] || 0.2);

  const highlights: Array<{ time: number; score: number }> = [];
  for (let i = 0; i < rmsEnvelope.length; i++) {
    const prev = i > 0 ? rmsEnvelope[i - 1] : 0;
    const next = i < rmsEnvelope.length - 1 ? rmsEnvelope[i + 1] : 0;
    if (rmsEnvelope[i] >= peakCutoff && rmsEnvelope[i] >= prev && rmsEnvelope[i] >= next) {
      highlights.push({
        time: Number((i * windowDurationSec).toFixed(2)),
        score: Number(rmsEnvelope[i].toFixed(3)),
      });
    }
  }

  return { activeSegments, highlights };
}
