import {
  createDefaultChromaKey,
  createDefaultEffects,
  createDefaultTransform,
  TimelineState,
} from '../engine/timelineEngine';
import { createDefaultPhotoAdjustments, PhotoAdjustments } from '../engine/imageEngine';

export type StudioMode =
  | 'dashboard'
  | 'video'
  | 'photo'
  | 'motion'
  | 'graphic'
  | 'audio'
  | 'ai';

export const STUDIO_MEDIA_ASSETS = {
  football: '/src/assets/images/studio_football_action_1793198141838.jpg',
  cinematic: '/src/assets/images/studio_cinematic_runner_1793198143177.jpg',
  portrait: '/src/assets/images/studio_portrait_editorial_1793198143113.jpg',
  verticalReel: '/src/assets/images/studio_vertical_reel_1793198145320.jpg',
  techStudio: '/src/assets/images/studio_thumbnail_tech_1793198146884.jpg',
} as const;

export interface GraphicElement {
  id: string;
  kind: 'text' | 'rect' | 'circle' | 'badge' | 'image';
  name: string;
  x: number; // 0..100% of artboard
  y: number; // 0..100% of artboard
  width: number; // % of artboard width
  height: number; // % of artboard height
  rotation: number;
  opacity: number;
  fill: string;
  strokeColor?: string;
  strokeWidth?: number;
  borderRadius?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  imageUrl?: string;
}

export interface GraphicDesignState {
  presetName: string;
  width: number;
  height: number;
  backgroundType: 'solid' | 'gradient' | 'image';
  backgroundPrimary: string;
  backgroundSecondary: string;
  backgroundAngle: number;
  backgroundImage?: string;
  elements: GraphicElement[];
}

export interface AudioTrackItem {
  id: string;
  name: string;
  presetId?: string;
  customAudioUrl?: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  volume: number; // 0..1.5
  pan: number; // -1..1
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  solo: boolean;
  noiseReduction: boolean;
}

export interface AudioStudioState {
  bpm: number;
  masterVolume: number;
  eqBands: {
    sub60: number; // -12..12 dB
    low250: number;
    mid1k: number;
    presence4k: number;
    air12k: number;
  };
  tracks: AudioTrackItem[];
}

export interface CreativeTemplate {
  id: string;
  title: string;
  category:
    | 'Football Edits'
    | 'Cinematic'
    | 'Reels & Shorts'
    | 'YouTube'
    | 'Photo & Grading'
    | 'Motion Graphics'
    | 'Social Graphics';
  targetStudio: Exclude<StudioMode, 'dashboard' | 'ai'>;
  aspectRatio: string;
  fpsLabel: string;
  durationLabel: string;
  thumbnail: string;
  description: string;
  buildTimeline?: () => TimelineState;
  buildPhoto?: () => { imageUrl: string; adjustments: PhotoAdjustments };
  buildGraphic?: () => GraphicDesignState;
}

export function buildDefaultVideoTimeline(): TimelineState {
  return {
    aspectRatio: '16:9',
    fps: 60,
    duration: 10,
    tracks: [
      { id: 't_text', name: 'Titles & Captions', kind: 'text', muted: false, solo: false, locked: false, hidden: false },
      { id: 't_ovl', name: 'Overlay / PiP', kind: 'overlay', muted: false, solo: false, locked: false, hidden: false },
      { id: 't_v1', name: 'Main Video V1', kind: 'video', muted: false, solo: false, locked: false, hidden: false },
      { id: 't_a1', name: 'Master Score A1', kind: 'audio', muted: false, solo: false, locked: false, hidden: false },
    ],
    clips: [
      {
        id: 'c_fb_1',
        trackId: 't_v1',
        name: 'Stadium Floodlight Strike',
        mediaType: 'image',
        sourceUrl: STUDIO_MEDIA_ASSETS.football,
        startTime: 0,
        duration: 5.2,
        inPoint: 0,
        speed: 1.25,
        reversed: false,
        transform: { ...createDefaultTransform(), scale: 1.05 },
        blendMode: 'source-over',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: { ...createDefaultEffects(), contrast: 14, saturation: 10, lut: 'bleach-stadium', vignette: 24 },
        transitionIn: 'none',
        transitionDuration: 0,
        keyframes: [
          { id: 'kf_fb_s1', timeOffset: 0, property: 'scale', value: 1.02, easing: 'easeOut' },
          { id: 'kf_fb_s2', timeOffset: 5.2, property: 'scale', value: 1.22, easing: 'easeInOut' },
        ],
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        id: 'c_run_2',
        trackId: 't_v1',
        name: 'Tokyo Rain Anamorphic',
        mediaType: 'image',
        sourceUrl: STUDIO_MEDIA_ASSETS.cinematic,
        startTime: 5.2,
        duration: 4.8,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: createDefaultTransform(),
        blendMode: 'source-over',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: { ...createDefaultEffects(), lut: 'teal-amber', contrast: 18, glow: 16, vignette: 30 },
        transitionIn: 'whip-pan',
        transitionDuration: 0.55,
        keyframes: [
          { id: 'kf_rn_x1', timeOffset: 0, property: 'x', value: -4, easing: 'easeInOut' },
          { id: 'kf_rn_x2', timeOffset: 4.8, property: 'x', value: 4, easing: 'easeInOut' },
          { id: 'kf_rn_s1', timeOffset: 0, property: 'scale', value: 1.12, easing: 'linear' },
          { id: 'kf_rn_s2', timeOffset: 4.8, property: 'scale', value: 1.02, easing: 'linear' },
        ],
        volume: 1,
        fadeIn: 0,
        fadeOut: 0.4,
      },
      {
        id: 'c_title_1',
        trackId: 't_text',
        name: 'CREATE WITHOUT LIMITS',
        mediaType: 'text',
        startTime: 0,
        duration: 4.6,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: { ...createDefaultTransform(), y: 30 },
        blendMode: 'source-over',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: { ...createDefaultEffects(), glow: 28 },
        transitionIn: 'none',
        transitionDuration: 0,
        keyframes: [
          { id: 'kf_t1', timeOffset: 0, property: 'opacity', value: 1, easing: 'easeOut' },
          { id: 'kf_t2', timeOffset: 4.2, property: 'opacity', value: 1, easing: 'easeOut' },
        ],
        textContent: 'CREATE WITHOUT LIMITS',
        fontFamily: 'Oswald',
        fontSize: 54,
        textColor: '#F8FAFC',
        textAnimation: 'pop',
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        id: 'c_aud_1',
        trackId: 't_a1',
        name: 'Stadium Anthem 140 BPM',
        mediaType: 'audio',
        synthPreset: 'stadium-trap',
        startTime: 0,
        duration: 10,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: createDefaultTransform(),
        blendMode: 'source-over',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: createDefaultEffects(),
        transitionIn: 'none',
        transitionDuration: 0,
        keyframes: [],
        volume: 0.85,
        fadeIn: 0.3,
        fadeOut: 0.8,
      },
    ],
  };
}

export function buildDefaultMotionTimeline(): TimelineState {
  return {
    aspectRatio: '16:9',
    fps: 60,
    duration: 8,
    tracks: [
      { id: 'm_txt', name: 'Kinetic Typography', kind: 'text', muted: false, solo: false, locked: false, hidden: false },
      { id: 'm_shp', name: 'Vector Shape Rig', kind: 'motion', muted: false, solo: false, locked: false, hidden: false },
      { id: 'm_bg', name: 'Backdrop Plate', kind: 'video', muted: false, solo: false, locked: false, hidden: false },
      { id: 'm_sfx', name: 'Impact Audio', kind: 'audio', muted: false, solo: false, locked: false, hidden: false },
    ],
    clips: [
      {
        id: 'mc_bg',
        trackId: 'm_bg',
        name: 'Tokyo Rain Plate',
        mediaType: 'image',
        sourceUrl: STUDIO_MEDIA_ASSETS.cinematic,
        startTime: 0,
        duration: 8,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: { ...createDefaultTransform(), scale: 1.08, opacity: 0.55 },
        blendMode: 'source-over',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: { ...createDefaultEffects(), blur: 4, lut: 'teal-amber', vignette: 40 },
        transitionIn: 'crossfade',
        transitionDuration: 0.5,
        keyframes: [
          { id: 'mk_bg1', timeOffset: 0, property: 'scale', value: 1.04, easing: 'easeInOut' },
          { id: 'mk_bg2', timeOffset: 8, property: 'scale', value: 1.18, easing: 'easeInOut' },
        ],
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        id: 'mc_ring',
        trackId: 'm_shp',
        name: 'Orbiting Geometric Ring',
        mediaType: 'shape',
        shapeKind: 'ring',
        accentColor: '#8B5CF6',
        startTime: 0.2,
        duration: 7.4,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: { ...createDefaultTransform(), scale: 0.9 },
        blendMode: 'screen',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: { ...createDefaultEffects(), glow: 42, motionBlur: 35 },
        transitionIn: 'zoom-burst',
        transitionDuration: 0.45,
        keyframes: [
          { id: 'mk_r1', timeOffset: 0, property: 'rotation', value: 0, easing: 'easeInOut' },
          { id: 'mk_r2', timeOffset: 3.7, property: 'rotation', value: 180, easing: 'overshoot' },
          { id: 'mk_r3', timeOffset: 7.4, property: 'rotation', value: 360, easing: 'easeOut' },
          { id: 'mk_s1', timeOffset: 0, property: 'scale', value: 0.5, easing: 'overshoot' },
          { id: 'mk_s2', timeOffset: 1.2, property: 'scale', value: 1.12, easing: 'easeInOut' },
        ],
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        id: 'mc_headline',
        trackId: 'm_txt',
        name: 'EDIT X STUDIO OPENER',
        mediaType: 'text',
        textContent: 'EDIT X MOTION',
        fontFamily: 'Outfit',
        fontSize: 64,
        textColor: '#FFFFFF',
        textAnimation: 'slide-up',
        startTime: 0.5,
        duration: 7.0,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: createDefaultTransform(),
        blendMode: 'source-over',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: { ...createDefaultEffects(), glow: 25 },
        transitionIn: 'crossfade',
        transitionDuration: 0.4,
        keyframes: [
          { id: 'mk_ty1', timeOffset: 0, property: 'y', value: 22, easing: 'overshoot' },
          { id: 'mk_ty2', timeOffset: 0.9, property: 'y', value: 0, easing: 'easeOut' },
        ],
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
      },
      {
        id: 'mc_boom',
        trackId: 'm_sfx',
        name: 'Cinema Sub Impact',
        mediaType: 'audio',
        synthPreset: 'sfx-sub-boom',
        startTime: 0.4,
        duration: 2.4,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: createDefaultTransform(),
        blendMode: 'source-over',
        mask: 'none',
        chromaKey: createDefaultChromaKey(),
        effects: createDefaultEffects(),
        transitionIn: 'none',
        transitionDuration: 0,
        keyframes: [],
        volume: 0.9,
        fadeIn: 0,
        fadeOut: 0.3,
      },
    ],
  };
}

export function buildDefaultGraphicState(): GraphicDesignState {
  return {
    presetName: 'YouTube Thumbnail',
    width: 1280,
    height: 720,
    backgroundType: 'image',
    backgroundPrimary: '#09090D',
    backgroundSecondary: '#2E1065',
    backgroundAngle: 135,
    backgroundImage: STUDIO_MEDIA_ASSETS.techStudio,
    elements: [
      {
        id: 'el_scrim',
        kind: 'rect',
        name: 'Contrast Gradient Bar',
        x: 6,
        y: 52,
        width: 58,
        height: 38,
        rotation: 0,
        opacity: 0.88,
        fill: '#09090D',
        strokeColor: '#8B5CF6',
        strokeWidth: 2,
        borderRadius: 16,
      },
      {
        id: 'el_kicker',
        kind: 'badge',
        name: 'Category Tag',
        x: 9,
        y: 56,
        width: 24,
        height: 7,
        rotation: 0,
        opacity: 1,
        fill: '#7C3AED',
        borderRadius: 8,
        text: 'STUDIO GEAR REVIEW',
        fontFamily: 'Outfit',
        fontSize: 20,
        fontWeight: 700,
      },
      {
        id: 'el_headline',
        kind: 'text',
        name: 'Main Headline',
        x: 9,
        y: 66,
        width: 52,
        height: 18,
        rotation: 0,
        opacity: 1,
        fill: '#F8FAFC',
        text: 'PRO CINEMA RIG 2026',
        fontFamily: 'Oswald',
        fontSize: 58,
        fontWeight: 700,
      },
    ],
  };
}

export function buildDefaultAudioState(): AudioStudioState {
  return {
    bpm: 140,
    masterVolume: 0.9,
    eqBands: {
      sub60: 2.5,
      low250: 1.0,
      mid1k: 0,
      presence4k: 2.0,
      air12k: 1.5,
    },
    tracks: [
      {
        id: 'at_1',
        name: 'Stadium Anthem 140 BPM',
        presetId: 'stadium-trap',
        startTime: 0,
        duration: 12,
        trimStart: 0,
        trimEnd: 12,
        volume: 0.88,
        pan: 0,
        fadeIn: 0.4,
        fadeOut: 1.0,
        muted: false,
        solo: false,
        noiseReduction: false,
      },
      {
        id: 'at_2',
        name: 'Tension Synth Riser',
        presetId: 'sfx-riser',
        startTime: 1.2,
        duration: 3.0,
        trimStart: 0,
        trimEnd: 3.0,
        volume: 0.72,
        pan: -0.2,
        fadeIn: 0.2,
        fadeOut: 0.2,
        muted: false,
        solo: false,
        noiseReduction: false,
      },
      {
        id: 'at_3',
        name: 'Cinema Sub Impact',
        presetId: 'sfx-sub-boom',
        startTime: 4.2,
        duration: 2.4,
        trimStart: 0,
        trimEnd: 2.4,
        volume: 0.95,
        pan: 0,
        fadeIn: 0,
        fadeOut: 0.4,
        muted: false,
        solo: false,
        noiseReduction: false,
      },
    ],
  };
}

export const CREATIVE_TEMPLATES: CreativeTemplate[] = [
  {
    id: 'tpl_football_velocity',
    title: 'Champions Night Velocity Edit',
    category: 'Football Edits',
    targetStudio: 'video',
    aspectRatio: '16:9',
    fpsLabel: '60 FPS',
    durationLabel: '00:10',
    thumbnail: STUDIO_MEDIA_ASSETS.football,
    description: 'Speed-ramped stadium strike sequence with Bleach Bypass grade, impact flash, and 140 BPM anthem.',
    buildTimeline: buildDefaultVideoTimeline,
  },
  {
    id: 'tpl_cinematic_tokyo',
    title: 'Anamorphic Rain Noir',
    category: 'Cinematic',
    targetStudio: 'video',
    aspectRatio: '16:9',
    fpsLabel: '24 FPS',
    durationLabel: '00:12',
    thumbnail: STUDIO_MEDIA_ASSETS.cinematic,
    description: '24p theatrical grade with Teal & Amber LUT, subtle camera push keyframes, and horizon pulse score.',
    buildTimeline: () => {
      const base = buildDefaultVideoTimeline();
      base.fps = 24;
      base.clips[0].sourceUrl = STUDIO_MEDIA_ASSETS.cinematic;
      base.clips[0].name = 'Tokyo Rain Master';
      base.clips[0].effects.lut = 'teal-amber';
      base.clips[2].textContent = 'MIDNIGHT PROTOCOL';
      base.clips[2].fontFamily = 'Cinzel';
      base.clips[3].synthPreset = 'cinematic-pulse';
      base.clips[3].name = 'Anamorphic Horizon Pulse';
      return base;
    },
  },
  {
    id: 'tpl_reels_vertical',
    title: 'Golden Hour Skate Reel',
    category: 'Reels & Shorts',
    targetStudio: 'video',
    aspectRatio: '9:16',
    fpsLabel: '60 FPS',
    durationLabel: '00:09',
    thumbnail: STUDIO_MEDIA_ASSETS.verticalReel,
    description: '9:16 vertical short-form edit with kinetic karaoke captions, whip-pan transition, and arpeggiated drive.',
    buildTimeline: () => {
      const base = buildDefaultVideoTimeline();
      base.aspectRatio = '9:16';
      base.clips[0].sourceUrl = STUDIO_MEDIA_ASSETS.verticalReel;
      base.clips[0].name = 'Golden Hour Ollie';
      base.clips[0].effects.lut = 'golden-velvia';
      base.clips[2].textContent = 'GOLDEN HOUR SESSION';
      base.clips[2].textAnimation = 'karaoke';
      base.clips[3].synthPreset = 'kinetic-drive';
      return base;
    },
  },
  {
    id: 'tpl_youtube_pip',
    title: 'Studio Gear Breakdown & PiP',
    category: 'YouTube',
    targetStudio: 'video',
    aspectRatio: '16:9',
    fpsLabel: '30 FPS',
    durationLabel: '00:12',
    thumbnail: STUDIO_MEDIA_ASSETS.techStudio,
    description: 'Multi-layer YouTube edit with Picture-in-Picture callout frame, lower-third title, and lo-fi bed.',
    buildTimeline: () => {
      const base = buildDefaultVideoTimeline();
      base.fps = 30;
      base.clips[0].sourceUrl = STUDIO_MEDIA_ASSETS.techStudio;
      base.clips[0].name = 'Cinema Lens B-Roll';
      base.clips.push({
        id: 'c_pip_portrait',
        trackId: 't_ovl',
        name: 'Host PiP Cam',
        mediaType: 'image',
        sourceUrl: STUDIO_MEDIA_ASSETS.portrait,
        startTime: 0.5,
        duration: 8.5,
        inPoint: 0,
        speed: 1,
        reversed: false,
        transform: { ...createDefaultTransform(), x: 32, y: -26, scale: 0.34 },
        blendMode: 'source-over',
        mask: 'circle',
        chromaKey: createDefaultChromaKey(),
        effects: createDefaultEffects(),
        transitionIn: 'crossfade',
        transitionDuration: 0.4,
        keyframes: [],
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
      });
      return base;
    },
  },
  {
    id: 'tpl_portrait_retouch',
    title: 'Editorial Portrait Retouch',
    category: 'Photo & Grading',
    targetStudio: 'photo',
    aspectRatio: '3:4',
    fpsLabel: 'RAW Pipeline',
    durationLabel: 'Photo',
    thumbnail: STUDIO_MEDIA_ASSETS.portrait,
    description: 'Soft studio portrait preset with skin micro-smoothing, radial face dodge, and studio backdrop cutout ready.',
    buildPhoto: () => {
      const adj = createDefaultPhotoAdjustments();
      adj.exposure = 0.15;
      adj.contrast = 12;
      adj.highlights = -18;
      adj.shadows = 16;
      adj.skinSmoothing = 38;
      adj.lut = 'clean-portrait';
      adj.selectiveRadial.enabled = true;
      return { imageUrl: STUDIO_MEDIA_ASSETS.portrait, adjustments: adj };
    },
  },
  {
    id: 'tpl_kodak_grade',
    title: '35mm Kodak 2383 Film Print',
    category: 'Photo & Grading',
    targetStudio: 'photo',
    aspectRatio: '16:9',
    fpsLabel: 'LUT + Curves',
    durationLabel: 'Photo',
    thumbnail: STUDIO_MEDIA_ASSETS.cinematic,
    description: 'Classic theatrical S-curve toe/shoulder roll-off with warm amber highlights and deep cinema blacks.',
    buildPhoto: () => {
      const adj = createDefaultPhotoAdjustments();
      adj.contrast = 20;
      adj.vibrance = 22;
      adj.temperature = 10;
      adj.lut = 'kodak-2383';
      adj.vignette = 28;
      adj.curvePoints = [
        { x: 0, y: 12 },
        { x: 64, y: 52 },
        { x: 190, y: 206 },
        { x: 255, y: 248 },
      ];
      return { imageUrl: STUDIO_MEDIA_ASSETS.cinematic, adjustments: adj };
    },
  },
  {
    id: 'tpl_motion_opener',
    title: 'Kinetic Brand Vector Opener',
    category: 'Motion Graphics',
    targetStudio: 'motion',
    aspectRatio: '16:9',
    fpsLabel: '60 FPS',
    durationLabel: '00:08',
    thumbnail: STUDIO_MEDIA_ASSETS.cinematic,
    description: 'After Effects-inspired keyframe animation rig with overshoot bezier curves, glowing vector ring, and motion blur.',
    buildTimeline: buildDefaultMotionTimeline,
  },
  {
    id: 'tpl_social_thumb',
    title: 'High-CTR Tech Review Thumbnail',
    category: 'Social Graphics',
    targetStudio: 'graphic',
    aspectRatio: '1280×720',
    fpsLabel: 'PNG / PDF',
    durationLabel: 'Artboard',
    thumbnail: STUDIO_MEDIA_ASSETS.techStudio,
    description: 'Layered 1280×720 YouTube thumbnail artboard with contrast scrim, bold condensed display type, and badge.',
    buildGraphic: buildDefaultGraphicState,
  },
];
