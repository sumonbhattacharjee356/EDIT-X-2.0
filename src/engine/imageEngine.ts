import { LutPresetId } from './timelineEngine';

export interface HslChannelShift {
  hue: number; // -30..30 deg
  saturation: number; // -100..100
  luminance: number; // -100..100
}

export interface CurvePoint {
  x: number; // 0..255
  y: number; // 0..255
}

export interface PhotoAdjustments {
  exposure: number; // -2.0..2.0 EV
  contrast: number; // -100..100
  brightness: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  saturation: number; // -100..100
  vibrance: number; // -100..100
  temperature: number; // -100..100 (cool <-> warm)
  tint: number; // -100..100 (green <-> magenta)
  vignette: number; // 0..100
  skinSmoothing: number; // 0..100
  lut: LutPresetId;
  hsl: {
    red: HslChannelShift;
    yellow: HslChannelShift;
    green: HslChannelShift;
    cyan: HslChannelShift;
    blue: HslChannelShift;
    magenta: HslChannelShift;
  };
  curvePoints: CurvePoint[];
  selectiveRadial: {
    enabled: boolean;
    cx: number; // 0..1
    cy: number; // 0..1
    radius: number; // 0.1..0.9
    exposureBoost: number; // -1..1
  };
  bgRemove: {
    enabled: boolean;
    mode: 'auto-edge' | 'chroma';
    keyColor: string;
    tolerance: number; // 5..85
    feather: number; // 0..30
    replacementBg: string; // 'transparent' | hex | gradient
  };
}

export function createDefaultPhotoAdjustments(): PhotoAdjustments {
  const zeroHsl = (): HslChannelShift => ({ hue: 0, saturation: 0, luminance: 0 });
  return {
    exposure: 0,
    contrast: 0,
    brightness: 0,
    highlights: 0,
    shadows: 0,
    saturation: 0,
    vibrance: 0,
    temperature: 0,
    tint: 0,
    vignette: 0,
    skinSmoothing: 0,
    lut: 'none',
    hsl: {
      red: zeroHsl(),
      yellow: zeroHsl(),
      green: zeroHsl(),
      cyan: zeroHsl(),
      blue: zeroHsl(),
      magenta: zeroHsl(),
    },
    curvePoints: [
      { x: 0, y: 0 },
      { x: 128, y: 128 },
      { x: 255, y: 255 },
    ],
    selectiveRadial: {
      enabled: false,
      cx: 0.5,
      cy: 0.45,
      radius: 0.38,
      exposureBoost: 0.35,
    },
    bgRemove: {
      enabled: false,
      mode: 'auto-edge',
      keyColor: '#7A7A7A',
      tolerance: 28,
      feather: 10,
      replacementBg: 'transparent',
    },
  };
}

export function clampByte(val: number): number {
  return val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
}

/**
 * Generates a 256-entry tone curve lookup table from sorted control points using smooth piecewise interpolation.
 */
export function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points]
    .map((p) => ({
      x: Math.max(0, Math.min(255, p.x)),
      y: Math.max(0, Math.min(255, p.y)),
    }))
    .sort((a, b) => a.x - b.x);

  if (sorted.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  for (let i = 0; i < 256; i++) {
    if (i <= sorted[0].x) {
      lut[i] = clampByte(sorted[0].y);
    } else if (i >= sorted[sorted.length - 1].x) {
      lut[i] = clampByte(sorted[sorted.length - 1].y);
    } else {
      for (let j = 0; j < sorted.length - 1; j++) {
        const p0 = sorted[j];
        const p1 = sorted[j + 1];
        if (i >= p0.x && i <= p1.x) {
          const span = Math.max(1, p1.x - p0.x);
          const t = (i - p0.x) / span;
          // Smoothstep blend for natural film shoulder/toe
          const smoothT = t * t * (3 - 2 * t);
          lut[i] = clampByte(p0.y + (p1.y - p0.y) * (0.65 * t + 0.35 * smoothT));
          break;
        }
      }
    }
  }
  return lut;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [120, 120, 120];
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

export function applyLutColorMatrix(
  r: number,
  g: number,
  b: number,
  lut: LutPresetId
): [number, number, number] {
  switch (lut) {
    case 'teal-amber': {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const shadowWeight = 1 - luma / 255;
      const highlightWeight = luma / 255;
      return [
        clampByte(r + highlightWeight * 22 - shadowWeight * 14),
        clampByte(g + highlightWeight * 6 + shadowWeight * 6),
        clampByte(b - highlightWeight * 18 + shadowWeight * 24),
      ];
    }
    case 'kodak-2383': {
      return [
        clampByte(r * 1.06 + 4),
        clampByte(g * 1.01 + 2),
        clampByte(b * 0.92 + 8),
      ];
    }
    case 'bleach-stadium': {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const mixR = r * 0.55 + luma * 0.45;
      const mixG = g * 0.55 + luma * 0.45;
      const mixB = b * 0.62 + luma * 0.38;
      return [
        clampByte((mixR - 128) * 1.28 + 128),
        clampByte((mixG - 128) * 1.28 + 128),
        clampByte((mixB - 128) * 1.32 + 132),
      ];
    }
    case 'noir-silver': {
      const luma = 0.25 * r + 0.62 * g + 0.13 * b;
      const contrasted = (luma - 128) * 1.22 + 128;
      return [clampByte(contrasted), clampByte(contrasted), clampByte(contrasted + 4)];
    }
    case 'golden-velvia': {
      return [
        clampByte(r * 1.12 + 6),
        clampByte(g * 1.04 + 2),
        clampByte(b * 0.88),
      ];
    }
    case 'clean-portrait': {
      return [
        clampByte(r * 1.03 + 5),
        clampByte(g * 1.02 + 4),
        clampByte(b * 1.01 + 4),
      ];
    }
    default:
      return [r, g, b];
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(1, s));
  const ln = Math.max(0, Math.min(1, l));
  if (sn === 0) {
    const v = clampByte(ln * 255);
    return [v, v, v];
  }
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hn < 60) [r1, g1, b1] = [c, x, 0];
  else if (hn < 120) [r1, g1, b1] = [x, c, 0];
  else if (hn < 180) [r1, g1, b1] = [0, c, x];
  else if (hn < 240) [r1, g1, b1] = [0, x, c];
  else if (hn < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return [
    clampByte((r1 + m) * 255),
    clampByte((g1 + m) * 255),
    clampByte((b1 + m) * 255),
  ];
}

/**
 * Processes an RGBA pixel buffer in-place with Lightroom-grade color science, HSL, Curves, LUT, and Chroma/Auto Background Cutout.
 */
export function processImageBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adj: PhotoAdjustments
): void {
  const curveLut = buildCurveLUT(adj.curvePoints);
  const expGain = Math.pow(2, adj.exposure);
  const contrastFactor = (259 * (adj.contrast + 255)) / (255 * (259 - adj.contrast));
  const satScale = 1 + adj.saturation / 100;
  const vibScale = adj.vibrance / 100;
  const hasHsl = Object.values(adj.hsl).some(
    (ch) => ch.hue !== 0 || ch.saturation !== 0 || ch.luminance !== 0
  );

  // Sample corner backdrop color if auto-edge cutout is active
  let keyR = 120,
    keyG = 120,
    keyB = 120;
  if (adj.bgRemove.enabled) {
    if (adj.bgRemove.mode === 'chroma') {
      [keyR, keyG, keyB] = hexToRgb(adj.bgRemove.keyColor);
    } else if (width > 4 && height > 4) {
      // Average top-left & top-right studio backdrop pixels
      const p1 = 0;
      const p2 = (width - 1) * 4;
      keyR = Math.round((data[p1] + data[p2]) / 2);
      keyG = Math.round((data[p1 + 1] + data[p2 + 1]) / 2);
      keyB = Math.round((data[p1 + 2] + data[p2 + 2]) / 2);
    }
  }

  const tolDist = adj.bgRemove.tolerance * 2.2;
  const featherDist = Math.max(1, adj.bgRemove.feather * 2.0);

  for (let y = 0; y < height; y++) {
    const ny = y / Math.max(1, height);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];
      let a = data[idx + 3];

      // 1. Background Removal (Chroma or Studio Corner Backdrop)
      if (adj.bgRemove.enabled) {
        const dist = Math.hypot(r - keyR, g - keyG, b - keyB);
        if (dist < tolDist) {
          a = 0;
        } else if (dist < tolDist + featherDist) {
          const factor = (dist - tolDist) / featherDist;
          a = Math.round(a * factor);
        }
      }

      if (a === 0) {
        data[idx + 3] = 0;
        continue;
      }

      // 2. Exposure + Selective Radial Mask
      let localExp = expGain;
      if (adj.selectiveRadial.enabled) {
        const nx = x / Math.max(1, width);
        const radDist = Math.hypot(nx - adj.selectiveRadial.cx, ny - adj.selectiveRadial.cy);
        const maskW = Math.max(0, 1 - radDist / Math.max(0.05, adj.selectiveRadial.radius));
        localExp *= Math.pow(2, adj.selectiveRadial.exposureBoost * maskW);
      }

      r = r * localExp + adj.brightness * 1.4;
      g = g * localExp + adj.brightness * 1.4;
      b = b * localExp + adj.brightness * 1.4;

      // 3. White Balance Temperature & Tint
      if (adj.temperature !== 0 || adj.tint !== 0) {
        r += adj.temperature * 0.75 + adj.tint * 0.25;
        g -= adj.tint * 0.55;
        b -= adj.temperature * 0.75 - adj.tint * 0.25;
      }

      // 4. Highlights & Shadows Recovery
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (adj.shadows !== 0 && luma < 140) {
        const w = (140 - luma) / 140;
        const lift = adj.shadows * 0.75 * w * w;
        r += lift;
        g += lift;
        b += lift;
      }
      if (adj.highlights !== 0 && luma > 115) {
        const w = (luma - 115) / 140;
        const pull = adj.highlights * 0.75 * w * w;
        r += pull;
        g += pull;
        b += pull;
      }

      // 5. Contrast + Tone Curve LUT
      r = curveLut[clampByte(contrastFactor * (r - 128) + 128)];
      g = curveLut[clampByte(contrastFactor * (g - 128) + 128)];
      b = curveLut[clampByte(contrastFactor * (b - 128) + 128)];

      // 6. Saturation & Vibrance
      if (adj.saturation !== 0 || adj.vibrance !== 0) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const curSat = (maxC - minC) / 255;
        const vibBoost = 1 + vibScale * (1 - curSat);
        const totalSat = satScale * vibBoost;
        r = gray + (r - gray) * totalSat;
        g = gray + (g - gray) * totalSat;
        b = gray + (b - gray) * totalSat;
      }

      // 7. 6-Channel HSL Mixer
      if (hasHsl) {
        let [h, s, l] = rgbToHsl(clampByte(r), clampByte(g), clampByte(b));
        const ch =
          h < 30 || h >= 330
            ? adj.hsl.red
            : h < 75
              ? adj.hsl.yellow
              : h < 155
                ? adj.hsl.green
                : h < 205
                  ? adj.hsl.cyan
                  : h < 275
                    ? adj.hsl.blue
                    : adj.hsl.magenta;
        if (ch.hue !== 0 || ch.saturation !== 0 || ch.luminance !== 0) {
          h += ch.hue;
          s *= 1 + ch.saturation / 100;
          l += (ch.luminance / 100) * 0.35;
          [r, g, b] = hslToRgb(h, s, l);
        }
      }

      // 8. Cinema LUT Color Matrix
      if (adj.lut !== 'none') {
        [r, g, b] = applyLutColorMatrix(clampByte(r), clampByte(g), clampByte(b), adj.lut);
      }

      // 9. Portrait Skin Smoothing (subtle warm midtone micro-contrast softening)
      if (adj.skinSmoothing > 0 && r > g && g > b && r - b > 18) {
        const smoothAmt = (adj.skinSmoothing / 100) * 0.32;
        const mid = (r + g + b) / 3 + 8;
        r = r * (1 - smoothAmt) + (mid + 12) * smoothAmt;
        g = g * (1 - smoothAmt) + mid * smoothAmt;
        b = b * (1 - smoothAmt) + (mid - 10) * smoothAmt;
      }

      // 10. Lens Vignette
      if (adj.vignette > 0) {
        const nx = x / Math.max(1, width);
        const d = Math.hypot(nx - 0.5, ny - 0.5) * 1.42;
        const vig = 1 - (adj.vignette / 100) * d * d * 0.85;
        r *= vig;
        g *= vig;
        b *= vig;
      }

      data[idx] = clampByte(r);
      data[idx + 1] = clampByte(g);
      data[idx + 2] = clampByte(b);
      data[idx + 3] = a;
    }
  }
}

/**
 * Patch-based local Object Removal / Healing Inpaint inside a circular brush stroke.
 */
export function inpaintCirclePatch(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): void {
  const rInt = Math.max(2, Math.round(radius));
  const minX = Math.max(0, Math.floor(cx - rInt));
  const maxX = Math.min(width - 1, Math.ceil(cx + rInt));
  const minY = Math.max(0, Math.floor(cy - rInt));
  const maxY = Math.min(height - 1, Math.ceil(cy + rInt));

  // Sample clean boundary ring just outside the brush radius
  const ringSamples: Array<[number, number, number]> = [];
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
    const sx = Math.min(width - 1, Math.max(0, Math.round(cx + Math.cos(angle) * (rInt + 4))));
    const sy = Math.min(height - 1, Math.max(0, Math.round(cy + Math.sin(angle) * (rInt + 4))));
    const sIdx = (sy * width + sx) * 4;
    ringSamples.push([data[sIdx], data[sIdx + 1], data[sIdx + 2]]);
  }

  if (ringSamples.length === 0) return;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist <= rInt) {
        // Directional boundary interpolation + subtle texture offset
        const angle = Math.atan2(dy, dx);
        const normAngle = ((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
        const sampleIdx = Math.floor(normAngle * ringSamples.length) % ringSamples.length;
        const oppIdx = (sampleIdx + Math.floor(ringSamples.length / 2)) % ringSamples.length;
        const s1 = ringSamples[sampleIdx];
        const s2 = ringSamples[oppIdx];
        const blend = 1 - Math.pow(dist / rInt, 2);
        const pIdx = (y * width + x) * 4;
        const targetR = s1[0] * 0.72 + s2[0] * 0.28;
        const targetG = s1[1] * 0.72 + s2[1] * 0.28;
        const targetB = s1[2] * 0.72 + s2[2] * 0.28;

        data[pIdx] = clampByte(data[pIdx] * (1 - blend) + targetR * blend);
        data[pIdx + 1] = clampByte(data[pIdx + 1] * (1 - blend) + targetG * blend);
        data[pIdx + 2] = clampByte(data[pIdx + 2] * (1 - blend) + targetB * blend);
      }
    }
  }
}

export function computeRgbHistogram(data: Uint8ClampedArray): {
  r: number[];
  g: number[];
  b: number[];
} {
  const r = new Array<number>(64).fill(0);
  const g = new Array<number>(64).fill(0);
  const b = new Array<number>(64).fill(0);
  const step = 16; // sample every 4th pixel for instant response
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] > 16) {
      r[data[i] >> 2]++;
      g[data[i + 1] >> 2]++;
      b[data[i + 2] >> 2]++;
    }
  }
  const maxVal = Math.max(1, ...r, ...g, ...b);
  return {
    r: r.map((v) => v / maxVal),
    g: g.map((v) => v / maxVal),
    b: b.map((v) => v / maxVal),
  };
}
