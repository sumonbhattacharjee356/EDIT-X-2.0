export interface StudioSynthPreset {
  id: string;
  name: string;
  category: 'music' | 'sfx';
  bpm: number;
  duration: number;
  description: string;
}

export const STUDIO_AUDIO_LIBRARY: StudioSynthPreset[] = [
  {
    id: 'stadium-trap',
    name: 'Stadium Anthem 140 BPM',
    category: 'music',
    bpm: 140,
    duration: 12,
    description: 'Punchy 808 sub bass, crisp hi-hat rolls, and brass stabs for sports & action edits',
  },
  {
    id: 'cinematic-pulse',
    name: 'Anamorphic Horizon Pulse',
    category: 'music',
    bpm: 96,
    duration: 14,
    description: 'Deep analog synth pulse and warm ambient strings for film trailers',
  },
  {
    id: 'velvet-lofi',
    name: 'Midnight Tokyo Lo-Fi',
    category: 'music',
    bpm: 84,
    duration: 12,
    description: 'Warm Rhodes electric piano seventh chords with soft vinyl percussion',
  },
  {
    id: 'kinetic-drive',
    name: 'Kinetic Motion Drive',
    category: 'music',
    bpm: 124,
    duration: 10,
    description: 'Driving arpeggiated bassline for Reels, Shorts, and product launches',
  },
  {
    id: 'sfx-sub-boom',
    name: 'Cinema Sub Impact',
    category: 'sfx',
    bpm: 120,
    duration: 2.4,
    description: 'Deep theatrical low-end impact boom for title reveals and speed ramps',
  },
  {
    id: 'sfx-whoosh',
    name: 'Whip Pan Whoosh',
    category: 'sfx',
    bpm: 120,
    duration: 1.2,
    description: 'Filtered stereo air sweep for fast camera transitions',
  },
  {
    id: 'sfx-riser',
    name: 'Tension Synth Riser',
    category: 'sfx',
    bpm: 120,
    duration: 3.0,
    description: 'Upward pitch-swept harmonic riser leading into beat drops',
  },
  {
    id: 'sfx-shutter',
    name: 'Mechanical Camera Shutter',
    category: 'sfx',
    bpm: 120,
    duration: 0.6,
    description: 'Crisp SLR mirror click for freeze-frames and photo reveals',
  },
];

/**
 * Generates deterministic, studio-clean stereo PCM samples for built-in royalty-free tracks & SFX.
 */
export function synthesizePresetSamples(
  presetId: string,
  sampleRate: number = 44100
): { left: Float32Array; right: Float32Array; sampleRate: number; duration: number } {
  const meta = STUDIO_AUDIO_LIBRARY.find((p) => p.id === presetId) || STUDIO_AUDIO_LIBRARY[0];
  const duration = meta.duration;
  const length = Math.floor(duration * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  // Deterministic pseudo-noise generator
  let seed = 1337;
  const nextNoise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 1073741823.5) - 1;
  };

  const beatDur = 60 / meta.bpm;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let lSample = 0;
    let rSample = 0;

    if (presetId === 'stadium-trap') {
      const beatPos = (t % beatDur) / beatDur;
      const barBeat = Math.floor(t / beatDur) % 4;
      // 808 Kick + Sub
      const kickEnv = Math.exp(-beatPos * 9);
      const kickFreq = 52 + 95 * Math.exp(-beatPos * 28);
      const sub = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.65;
      // Snare on beat 2
      const snareEnv = barBeat === 2 ? Math.exp(-beatPos * 14) : 0;
      const snare = nextNoise() * snareEnv * 0.35;
      // 16th Hi-hat
      const hatPos = (t % (beatDur / 4)) / (beatDur / 4);
      const hat = nextNoise() * Math.exp(-hatPos * 24) * 0.14;
      // Minor brass stab
      const chordFreq = barBeat < 2 ? 220 : 196;
      const stab =
        (Math.sin(2 * Math.PI * chordFreq * t) +
          0.5 * Math.sin(2 * Math.PI * chordFreq * 1.5 * t)) *
        Math.exp(-beatPos * 4.5) *
        0.22;

      lSample = sub + snare + hat * 0.8 + stab;
      rSample = sub + snare + hat * 1.1 + stab * 0.9;
    } else if (presetId === 'cinematic-pulse') {
      const pulseEnv = 0.5 + 0.5 * Math.sin(2 * Math.PI * (meta.bpm / 60) * 2 * t);
      const drone =
        0.32 * Math.sin(2 * Math.PI * 65.41 * t) +
        0.22 * Math.sin(2 * Math.PI * 98.0 * t + 0.4) +
        0.16 * Math.sin(2 * Math.PI * 130.81 * t) * pulseEnv;
      const shimmer = 0.08 * Math.sin(2 * Math.PI * 392.0 * t + Math.sin(t * 2));
      lSample = drone + shimmer;
      rSample = drone * 0.96 - shimmer;
    } else if (presetId === 'velvet-lofi') {
      const bar = Math.floor(t / (beatDur * 2)) % 2;
      const roots = bar === 0 ? [261.63, 329.63, 392.0, 493.88] : [220.0, 261.63, 329.63, 392.0];
      let keys = 0;
      for (const f of roots) {
        keys += Math.sin(2 * Math.PI * f * t) * 0.12;
      }
      const env = Math.exp(-((t % (beatDur * 2)) * 0.9));
      const crackle = nextNoise() * 0.012;
      lSample = keys * env + crackle;
      rSample = keys * env * 0.95 - crackle;
    } else if (presetId === 'kinetic-drive') {
      const arpNotes = [110, 130.81, 164.81, 220];
      const step = Math.floor(t / (beatDur / 2)) % arpNotes.length;
      const stepPos = (t % (beatDur / 2)) / (beatDur / 2);
      const freq = arpNotes[step];
      const sawApprox =
        Math.sin(2 * Math.PI * freq * t) +
        0.5 * Math.sin(4 * Math.PI * freq * t) +
        0.25 * Math.sin(6 * Math.PI * freq * t);
      const env = Math.exp(-stepPos * 5.5);
      lSample = sawApprox * env * 0.35;
      rSample = sawApprox * env * 0.33;
    } else if (presetId === 'sfx-sub-boom') {
      const env = Math.exp(-t * 2.1);
      const freq = 38 + 80 * Math.exp(-t * 8);
      const boom = Math.sin(2 * Math.PI * freq * t) * env * 0.85;
      const transient = nextNoise() * Math.exp(-t * 32) * 0.3;
      lSample = boom + transient;
      rSample = boom + transient;
    } else if (presetId === 'sfx-whoosh') {
      const bell = Math.sin(Math.PI * Math.min(1, t / duration));
      const mod = Math.sin(2 * Math.PI * (180 + t * 520) * t);
      const air = nextNoise() * bell * 0.55 + mod * bell * 0.2;
      const pan = t / duration;
      lSample = air * (1 - pan * 0.6);
      rSample = air * (0.4 + pan * 0.6);
    } else if (presetId === 'sfx-riser') {
      const progress = t / duration;
      const freq = 140 + progress * progress * 880;
      const tone = Math.sin(2 * Math.PI * freq * t) * progress * 0.55;
      const hiss = nextNoise() * progress * progress * 0.22;
      lSample = tone + hiss;
      rSample = tone * 0.95 - hiss;
    } else {
      // Mechanical camera shutter
      const click1 = Math.exp(-t * 65) * nextNoise() * 0.8;
      const click2 = t > 0.14 ? Math.exp(-(t - 0.14) * 75) * nextNoise() * 0.65 : 0;
      lSample = click1 + click2;
      rSample = click1 + click2;
    }

    // Master soft clip & fade tail
    const tailFade = t > duration - 0.08 ? Math.max(0, (duration - t) / 0.08) : 1;
    left[i] = Math.max(-0.98, Math.min(0.98, lSample * tailFade));
    right[i] = Math.max(-0.98, Math.min(0.98, rSample * tailFade));
  }

  return { left, right, sampleRate, duration };
}

/**
 * Encodes stereo Float32 PCM channels into a standard 44-byte RIFF 16-bit WAV Uint8Array.
 */
export function encodeStereoWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number = 44100
): Uint8Array {
  const numSamples = Math.min(left.length, right.length);
  const numChannels = 2;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}

/**
 * Downsamples a PCM channel into normalized peak bars [0..1] for crisp Canvas waveform rendering.
 */
export function computeWaveformPeaks(samples: Float32Array, barCount: number = 96): number[] {
  if (samples.length === 0 || barCount <= 0) return [];
  const blockSize = Math.max(1, Math.floor(samples.length / barCount));
  const peaks: number[] = [];

  for (let b = 0; b < barCount; b++) {
    const start = b * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    let maxAbs = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > maxAbs) maxAbs = v;
    }
    peaks.push(Math.min(1, Number(maxAbs.toFixed(3))));
  }
  return peaks;
}
