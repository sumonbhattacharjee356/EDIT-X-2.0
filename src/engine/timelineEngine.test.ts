import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultChromaKey,
  createDefaultEffects,
  createDefaultTransform,
  detectHighlightsAndActiveSegments,
  formatTimecode,
  HistoryManager,
  interpolateClipProperty,
  mergeAdjacentClips,
  snapTimeToTargets,
  splitClipAtTime,
  TimelineClip,
  TimelineState,
} from './timelineEngine';
import { buildCurveLUT, createDefaultPhotoAdjustments, processImageBuffer } from './imageEngine';
import { computeWaveformPeaks, encodeStereoWav, synthesizePresetSamples } from './audioEngine';

function makeSampleTimeline(): TimelineState {
  const clip: TimelineClip = {
    id: 'clip_1',
    trackId: 'track_v1',
    name: 'Stadium Shot',
    mediaType: 'image',
    startTime: 0,
    duration: 6,
    inPoint: 1,
    speed: 1.5,
    reversed: false,
    transform: createDefaultTransform(),
    blendMode: 'source-over',
    mask: 'none',
    chromaKey: createDefaultChromaKey(),
    effects: createDefaultEffects(),
    transitionIn: 'crossfade',
    transitionDuration: 0.5,
    keyframes: [
      { id: 'kf1', timeOffset: 0, property: 'scale', value: 1.0, easing: 'linear' },
      { id: 'kf2', timeOffset: 6, property: 'scale', value: 1.6, easing: 'linear' },
    ],
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };

  return {
    aspectRatio: '16:9',
    fps: 30,
    duration: 8,
    tracks: [{ id: 'track_v1', name: 'Video 1', kind: 'video', muted: false, solo: false, locked: false, hidden: false }],
    clips: [clip],
  };
}

test('formatTimecode formats hours, minutes, seconds, and frames accurately', () => {
  assert.equal(formatTimecode(0, 30), '00:00:00:00');
  assert.equal(formatTimecode(12.5, 30), '00:00:12:15');
  assert.equal(formatTimecode(65.25, 60), '00:01:05:15');
});

test('splitClipAtTime splits clip duration, advances media inPoint by speed, and preserves timeline integrity', () => {
  const initial = makeSampleTimeline();
  const split = splitClipAtTime(initial, 'clip_1', 2.0);
  assert.equal(split.clips.length, 2);

  const [left, right] = split.clips;
  assert.equal(left.startTime, 0);
  assert.equal(left.duration, 2);
  assert.equal(left.inPoint, 1);

  assert.equal(right.startTime, 2);
  assert.equal(right.duration, 4);
  // inPoint advances by leftDuration (2s) * speed (1.5x) = +3s -> 4.0s
  assert.equal(right.inPoint, 4);

  const merged = mergeAdjacentClips(split, left.id, right.id);
  assert.equal(merged.clips.length, 1);
  assert.equal(merged.clips[0].duration, 6);
});

test('interpolateClipProperty interpolates keyframe tracks cleanly', () => {
  const state = makeSampleTimeline();
  const clip = state.clips[0];
  assert.equal(interpolateClipProperty(clip, 'scale', 0), 1.0);
  assert.ok(Math.abs(interpolateClipProperty(clip, 'scale', 3) - 1.3) < 1e-4);
  assert.equal(interpolateClipProperty(clip, 'scale', 6), 1.6);
});

test('snapTimeToTargets snaps within threshold to playhead and clip boundaries', () => {
  const state = makeSampleTimeline();
  assert.equal(snapTimeToTargets(5.91, state.clips, 2.5), 6);
  assert.equal(snapTimeToTargets(2.43, state.clips, 2.5), 2.5);
});

test('HistoryManager tracks undo and redo transitions accurately', () => {
  const history = new HistoryManager<number>(1);
  history.push(2);
  history.push(3);
  assert.equal(history.current, 3);
  assert.equal(history.undo(), 2);
  assert.equal(history.undo(), 1);
  assert.equal(history.canUndo, false);
  assert.equal(history.redo(), 2);
});

test('imageEngine tone curve LUT and chroma cutout process pixels deterministically', () => {
  const lut = buildCurveLUT([
    { x: 0, y: 10 },
    { x: 255, y: 240 },
  ]);
  assert.equal(lut[0], 10);
  assert.equal(lut[255], 240);

  // 2x1 RGBA buffer: pixel 0 is green screen, pixel 1 is bright white
  const pixels = new Uint8ClampedArray([22, 163, 74, 255, 240, 240, 240, 255]);
  const adj = createDefaultPhotoAdjustments();
  adj.bgRemove.enabled = true;
  adj.bgRemove.mode = 'chroma';
  adj.bgRemove.keyColor = '#16A34A';
  adj.bgRemove.tolerance = 20;

  processImageBuffer(pixels, 2, 1, adj);
  assert.equal(pixels[3], 0); // green pixel made transparent
  assert.equal(pixels[7], 255); // subject pixel remains opaque
});

test('audioEngine synthesizes stereo audio and encodes valid RIFF WAVE header', () => {
  const synth = synthesizePresetSamples('sfx-shutter', 8000);
  assert.ok(synth.left.length > 1000);
  const peaks = computeWaveformPeaks(synth.left, 16);
  assert.equal(peaks.length, 16);

  const wav = encodeStereoWav(synth.left, synth.right, 8000);
  const riff = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
  const wave = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
  assert.equal(riff, 'RIFF');
  assert.equal(wave, 'WAVE');
  assert.equal(wav.byteLength, 44 + synth.left.length * 4);
});

test('detectHighlightsAndActiveSegments identifies non-silent regions and peaks', () => {
  const env = [0.01, 0.02, 0.25, 0.65, 0.3, 0.02, 0.55, 0.12];
  const res = detectHighlightsAndActiveSegments(env, 0.5, 0.06, 0.75);
  assert.equal(res.activeSegments.length, 2);
  assert.ok(res.highlights.length >= 1);
});
