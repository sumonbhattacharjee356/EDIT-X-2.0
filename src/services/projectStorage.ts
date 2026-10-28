import JSZip from 'jszip';
import { TimelineState } from '../engine/timelineEngine';
import { PhotoAdjustments } from '../engine/imageEngine';
import {
  AudioStudioState,
  buildDefaultAudioState,
  buildDefaultGraphicState,
  buildDefaultMotionTimeline,
  buildDefaultVideoTimeline,
  GraphicDesignState,
  STUDIO_MEDIA_ASSETS,
  StudioMode,
} from './mediaAssets';
import { createDefaultPhotoAdjustments } from '../engine/imageEngine';

export interface EditXProject {
  id: string;
  name: string;
  studio: Exclude<StudioMode, 'dashboard' | 'ai'>;
  updatedAt: number;
  createdAt: number;
  isDraft: boolean;
  cloudSynced: boolean;
  resolutionSummary: string;
  timelineState?: TimelineState;
  photoState?: {
    imageUrl: string;
    adjustments: PhotoAdjustments;
  };
  graphicState?: GraphicDesignState;
  audioState?: AudioStudioState;
}

const PROJECTS_STORAGE_KEY = 'editx_studio_projects_v1';
const CRASH_RECOVERY_KEY = 'editx_crash_recovery_v1';
const SETTINGS_STORAGE_KEY = 'editx_studio_settings_v1';

export interface StudioSettings {
  autosaveSeconds: number;
  defaultFps: 24 | 30 | 60;
  defaultResolution: '720p' | '1080p' | '2K' | '4K';
  magneticSnapping: boolean;
  gpuCanvasAcceleration: boolean;
}

export function loadStudioSettings(): StudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return { ...defaultStudioSettings(), ...JSON.parse(raw) };
  } catch {
    // ignore storage access issues
  }
  return defaultStudioSettings();
}

export function saveStudioSettings(settings: StudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function defaultStudioSettings(): StudioSettings {
  return {
    autosaveSeconds: 4,
    defaultFps: 60,
    defaultResolution: '1080p',
    magneticSnapping: true,
    gpuCanvasAcceleration: true,
  };
}

function seedInitialProjects(): EditXProject[] {
  const now = Date.now();
  return [
    {
      id: 'proj_football_demo',
      name: 'UCL Quarterfinal Highlight Cut',
      studio: 'video',
      createdAt: now - 3600_000 * 5,
      updatedAt: now - 120_000,
      isDraft: false,
      cloudSynced: true,
      resolutionSummary: '1080p · 60 FPS · 00:10',
      timelineState: buildDefaultVideoTimeline(),
    },
    {
      id: 'proj_portrait_demo',
      name: 'Editorial Cover Retouch',
      studio: 'photo',
      createdAt: now - 3600_000 * 18,
      updatedAt: now - 1800_000,
      isDraft: false,
      cloudSynced: true,
      resolutionSummary: '3:4 · Non-Destructive LUT',
      photoState: {
        imageUrl: STUDIO_MEDIA_ASSETS.portrait,
        adjustments: {
          ...createDefaultPhotoAdjustments(),
          exposure: 0.12,
          contrast: 14,
          skinSmoothing: 32,
          lut: 'clean-portrait',
        },
      },
    },
    {
      id: 'proj_motion_demo',
      name: 'EDIT X Showreel Opener',
      studio: 'motion',
      createdAt: now - 3600_000 * 26,
      updatedAt: now - 5400_000,
      isDraft: true,
      cloudSynced: false,
      resolutionSummary: '1080p · 60 FPS · Keyframe Rig',
      timelineState: buildDefaultMotionTimeline(),
    },
    {
      id: 'proj_thumb_demo',
      name: 'Cinema Rig YouTube Thumbnail',
      studio: 'graphic',
      createdAt: now - 3600_000 * 40,
      updatedAt: now - 7200_000,
      isDraft: false,
      cloudSynced: false,
      resolutionSummary: '1280×720 · Multi-Layer',
      graphicState: buildDefaultGraphicState(),
    },
  ];
}

export function loadAllProjects(): EditXProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      const seeded = seedInitialProjects();
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as EditXProject[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return seedInitialProjects();
  }
}

export function saveProjectList(projects: EditXProject[]): void {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // ignore quota exceeded
  }
}

export function upsertProject(project: EditXProject): EditXProject[] {
  const all = loadAllProjects();
  const updated = { ...project, updatedAt: Date.now() };
  const exists = all.some((p) => p.id === updated.id);
  const next = exists
    ? all.map((p) => (p.id === updated.id ? updated : p))
    : [updated, ...all];
  saveProjectList(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createNewProject(
  name: string,
  studio: Exclude<StudioMode, 'dashboard' | 'ai'>
): EditXProject {
  const now = Date.now();
  const id = `proj_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const base: EditXProject = {
    id,
    name: name.trim() || 'Untitled Creative Project',
    studio,
    createdAt: now,
    updatedAt: now,
    isDraft: false,
    cloudSynced: false,
    resolutionSummary:
      studio === 'video' || studio === 'motion'
        ? '1080p · 60 FPS'
        : studio === 'photo'
          ? 'High-Res RAW Pipeline'
          : studio === 'graphic'
            ? '1280×720 Artboard'
            : '44.1kHz Stereo Mix',
  };

  if (studio === 'video') base.timelineState = buildDefaultVideoTimeline();
  if (studio === 'motion') base.timelineState = buildDefaultMotionTimeline();
  if (studio === 'photo') {
    base.photoState = {
      imageUrl: STUDIO_MEDIA_ASSETS.portrait,
      adjustments: createDefaultPhotoAdjustments(),
    };
  }
  if (studio === 'graphic') base.graphicState = buildDefaultGraphicState();
  if (studio === 'audio') base.audioState = buildDefaultAudioState();

  upsertProject(base);
  return base;
}

export function duplicateProjectById(id: string): EditXProject[] {
  const all = loadAllProjects();
  const src = all.find((p) => p.id === id);
  if (!src) return all;
  const copy: EditXProject = JSON.parse(JSON.stringify(src));
  copy.id = `proj_${Date.now()}_copy`;
  copy.name = `${src.name} (Copy)`;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  return upsertProject(copy);
}

export function renameProjectById(id: string, nextName: string): EditXProject[] {
  const trimmed = nextName.trim();
  if (!trimmed) return loadAllProjects();
  const all = loadAllProjects();
  const next = all.map((p) =>
    p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p
  );
  saveProjectList(next);
  return next;
}

export function toggleProjectCloudSync(id: string): EditXProject[] {
  const all = loadAllProjects();
  const next = all.map((p) =>
    p.id === id ? { ...p, cloudSynced: !p.cloudSynced, updatedAt: Date.now() } : p
  );
  saveProjectList(next);
  return next;
}

export function deleteProjectById(id: string): EditXProject[] {
  const all = loadAllProjects().filter((p) => p.id !== id);
  saveProjectList(all);
  return all;
}

// Crash Recovery Snapshot Management
export function writeCrashRecoverySnapshot(project: EditXProject): void {
  try {
    localStorage.setItem(
      CRASH_RECOVERY_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        project,
      })
    );
  } catch {
    // ignore
  }
}

export function readCrashRecoverySnapshot(): { savedAt: number; project: EditXProject } | null {
  try {
    const raw = localStorage.getItem(CRASH_RECOVERY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearCrashRecoverySnapshot(): void {
  try {
    localStorage.removeItem(CRASH_RECOVERY_KEY);
  } catch {
    // ignore
  }
}

export function getLocalStorageUsageStats(): { usedBytes: number; formatted: string } {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      const v = localStorage.getItem(k) || '';
      bytes += (k.length + v.length) * 2;
    }
  } catch {
    bytes = 0;
  }
  const kb = (bytes / 1024).toFixed(1);
  return { usedBytes: bytes, formatted: `${kb} KB` };
}

export async function exportProjectArchive(project: EditXProject): Promise<Blob> {
  const zip = new JSZip();
  zip.file('project.editx.json', JSON.stringify(project, null, 2));
  zip.file(
    'README.txt',
    `EDIT X Creative Studio Archive\nProject: ${project.name}\nStudio: ${project.studio}\nExported: ${new Date().toISOString()}\nImport this .editx.zip or project.editx.json file on any EDIT X workspace.`
  );
  return zip.generateAsync({ type: 'blob' });
}

export async function importProjectFile(file: File): Promise<EditXProject> {
  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const jsonEntry = zip.file('project.editx.json');
    if (!jsonEntry) throw new Error('Invalid .editx archive: missing project.editx.json');
    const content = await jsonEntry.async('string');
    const parsed = JSON.parse(content) as EditXProject;
    parsed.id = `proj_${Date.now()}_imp`;
    upsertProject(parsed);
    return parsed;
  }
  const text = await file.text();
  const parsed = JSON.parse(text) as EditXProject;
  if (!parsed || !parsed.name || !parsed.studio) {
    throw new Error('Invalid project file structure.');
  }
  parsed.id = `proj_${Date.now()}_imp`;
  upsertProject(parsed);
  return parsed;
}
