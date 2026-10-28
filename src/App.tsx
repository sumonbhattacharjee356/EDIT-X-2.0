/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AICreativeStudio } from './components/AICreativeStudio';
import { AudioStudio } from './components/AudioStudio';
import { GraphicDesignStudio } from './components/GraphicDesignStudio';
import { HomeDashboard } from './components/HomeDashboard';
import { PhotoEditorStudio } from './components/PhotoEditorStudio';
import { SettingsAndApkModal } from './components/SettingsAndApkModal';
import { VideoMotionStudio } from './components/VideoMotionStudio';
import { createDefaultPhotoAdjustments } from './engine/imageEngine';
import {
  createDefaultChromaKey,
  createDefaultEffects,
  createDefaultTransform,
  TimelineClip,
  TimelineState,
} from './engine/timelineEngine';
import {
  buildDefaultAudioState,
  buildDefaultGraphicState,
  buildDefaultMotionTimeline,
  buildDefaultVideoTimeline,
  CreativeTemplate,
  STUDIO_MEDIA_ASSETS,
  StudioMode,
} from './services/mediaAssets';
import {
  clearCrashRecoverySnapshot,
  createNewProject,
  deleteProjectById,
  duplicateProjectById,
  EditXProject,
  exportProjectArchive,
  importProjectFile,
  loadAllProjects,
  loadStudioSettings,
  readCrashRecoverySnapshot,
  renameProjectById,
  saveStudioSettings,
  StudioSettings,
  toggleProjectCloudSync,
  upsertProject,
  writeCrashRecoverySnapshot,
} from './services/projectStorage';
import { useOnlineStatus } from './services/usePWAInstall';

export default function App() {
  const [projects, setProjects] = useState<EditXProject[]>(() => loadAllProjects());
  const [activeStudio, setActiveStudio] = useState<StudioMode>(() => {
    const params = new URLSearchParams(window.location.search);
    const st = params.get('studio') as StudioMode | null;
    if (st && ['video', 'photo', 'motion', 'graphic', 'audio', 'ai'].includes(st)) {
      return st;
    }
    if (params.get('autostart') === '1') return 'video';
    return 'dashboard';
  });

  const [currentProject, setCurrentProject] = useState<EditXProject>(() => {
    const existing = loadAllProjects();
    const params = new URLSearchParams(window.location.search);
    const st = params.get('studio');
    if (st && ['video', 'photo', 'motion', 'graphic', 'audio'].includes(st)) {
      const matched = existing.find((p) => p.studio === st);
      if (matched) return matched;
      return createNewProject(`Studio ${st.toUpperCase()} Project`, st as EditXProject['studio']);
    }
    return existing[0] || createNewProject('Champions Cut 01', 'video');
  });

  const [hasDirtyEdits, setHasDirtyEdits] = useState<boolean>(false);
  const [aiInitialTool, setAiInitialTool] = useState<
    'copilot' | 'subtitles' | 'tts' | 'scene' | 'highlights'
  >('copilot');
  const [crashSnapshot, setCrashSnapshot] = useState(() => readCrashRecoverySnapshot());
  const [settings, setSettings] = useState<StudioSettings>(() => loadStudioSettings());
  const [settingsModalTab, setSettingsModalTab] = useState<'general' | 'android' | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');

  const isOnline = useOnlineStatus();

  const notify = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? '' : curr));
    }, 3200);
  };

  // Periodic Autosave & Crash-Recovery Snapshot when dirty edits exist inside an active studio
  useEffect(() => {
    if (!hasDirtyEdits || activeStudio === 'dashboard' || activeStudio === 'ai') return;
    const intervalMs = Math.max(2000, settings.autosaveSeconds * 1000);
    const id = window.setInterval(() => {
      writeCrashRecoverySnapshot(currentProject);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [hasDirtyEdits, activeStudio, currentProject, settings.autosaveSeconds]);

  const handleLeaveStudioToDashboard = () => {
    clearCrashRecoverySnapshot();
    setCrashSnapshot(null);
    setHasDirtyEdits(false);
    setProjects(upsertProject(currentProject));
    setActiveStudio('dashboard');
  };

  const handleOpenStudioFromCard = (studio: StudioMode) => {
    if (studio === 'ai') {
      setAiInitialTool('copilot');
      setActiveStudio('ai');
      return;
    }
    if (studio === 'dashboard') {
      setActiveStudio('dashboard');
      return;
    }
    // Find most recent project of this studio type or create a fresh one
    const match = projects.find((p) => p.studio === studio);
    if (match) {
      setCurrentProject(match);
    } else {
      const created = createNewProject(`Untitled ${studio} Project`, studio);
      setProjects(loadAllProjects());
      setCurrentProject(created);
    }
    setActiveStudio(studio);
  };

  const handleApplyTemplate = (tpl: CreativeTemplate) => {
    const proj = createNewProject(tpl.title, tpl.targetStudio);
    if (tpl.buildTimeline) {
      proj.timelineState = tpl.buildTimeline();
      proj.resolutionSummary = `${tpl.aspectRatio} · ${tpl.fpsLabel}`;
    }
    if (tpl.buildPhoto) {
      proj.photoState = tpl.buildPhoto();
      proj.resolutionSummary = `${tpl.aspectRatio} · ${tpl.fpsLabel}`;
    }
    if (tpl.buildGraphic) {
      proj.graphicState = tpl.buildGraphic();
      proj.resolutionSummary = `${tpl.aspectRatio} · ${tpl.fpsLabel}`;
    }
    const nextList = upsertProject(proj);
    setProjects(nextList);
    setCurrentProject(proj);
    setActiveStudio(tpl.targetStudio);
  };

  return (
    <div className="min-h-screen bg-[#09090D] text-[#F8FAFC]">
      {activeStudio === 'dashboard' && (
        <HomeDashboard
          projects={projects}
          crashSnapshot={crashSnapshot}
          onRecoverCrash={() => {
            if (!crashSnapshot) return;
            const restored = crashSnapshot.project;
            setProjects(upsertProject(restored));
            setCurrentProject(restored);
            clearCrashRecoverySnapshot();
            setCrashSnapshot(null);
            setActiveStudio(restored.studio);
            notify(`Restored ${restored.name}`);
          }}
          onDismissCrash={() => {
            clearCrashRecoverySnapshot();
            setCrashSnapshot(null);
          }}
          onOpenStudio={handleOpenStudioFromCard}
          onCreateProject={(name, studio) => {
            const proj = createNewProject(name, studio);
            setProjects(loadAllProjects());
            setCurrentProject(proj);
            setActiveStudio(studio);
          }}
          onOpenProject={(proj) => {
            setCurrentProject(proj);
            setActiveStudio(proj.studio);
          }}
          onApplyTemplate={handleApplyTemplate}
          onDuplicateProject={(id) => {
            setProjects(duplicateProjectById(id));
            notify('Duplicated project');
          }}
          onRenameProject={(id, name) => {
            setProjects(renameProjectById(id, name));
          }}
          onToggleCloud={(id) => {
            setProjects(toggleProjectCloudSync(id));
          }}
          onDeleteProject={(id) => {
            setProjects(deleteProjectById(id));
            notify('Removed project');
          }}
          onExportProjectFile={async (proj) => {
            const blob = await exportProjectArchive(proj);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${proj.name.replace(/\s+/g, '_')}.editx.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}
          onImportProjectFile={async (file) => {
            try {
              const imported = await importProjectFile(file);
              setProjects(loadAllProjects());
              setCurrentProject(imported);
              notify(`Imported ${imported.name}`);
            } catch (err: unknown) {
              notify(err instanceof Error ? err.message : 'Could not import project file.');
            }
          }}
          onOpenSettings={(tab = 'general') => setSettingsModalTab(tab)}
        />
      )}

      {(activeStudio === 'video' || activeStudio === 'motion') && (
        <VideoMotionStudio
          key={currentProject.id}
          mode={activeStudio}
          projectName={currentProject.name}
          initialTimeline={
            currentProject.timelineState ||
            (activeStudio === 'motion' ? buildDefaultMotionTimeline() : buildDefaultVideoTimeline())
          }
          magneticSnappingDefault={settings.magneticSnapping}
          onTimelineChange={(nextTimeline: TimelineState) => {
            const updated: EditXProject = {
              ...currentProject,
              studio: activeStudio,
              resolutionSummary: `${nextTimeline.aspectRatio} · ${nextTimeline.fps} FPS · 00:${String(
                Math.round(nextTimeline.duration)
              ).padStart(2, '0')}`,
              timelineState: nextTimeline,
            };
            setHasDirtyEdits(true);
            setCurrentProject(updated);
            setProjects(upsertProject(updated));
          }}
          onRenameProject={(nextName) => {
            const updated = { ...currentProject, name: nextName };
            setHasDirtyEdits(true);
            setCurrentProject(updated);
            setProjects(upsertProject(updated));
          }}
          onBackToDashboard={handleLeaveStudioToDashboard}
          onOpenAiSubtitles={() => {
            setAiInitialTool('subtitles');
            setActiveStudio('ai');
          }}
        />
      )}

      {activeStudio === 'photo' && (
        <PhotoEditorStudio
          key={currentProject.id}
          projectName={currentProject.name}
          initialImageUrl={currentProject.photoState?.imageUrl || STUDIO_MEDIA_ASSETS.portrait}
          initialAdjustments={
            currentProject.photoState?.adjustments || createDefaultPhotoAdjustments()
          }
          onSavePhotoState={(imageUrl, adjustments) => {
            const updated: EditXProject = {
              ...currentProject,
              studio: 'photo',
              photoState: { imageUrl, adjustments },
            };
            setHasDirtyEdits(true);
            setCurrentProject(updated);
            setProjects(upsertProject(updated));
          }}
          onBackToDashboard={handleLeaveStudioToDashboard}
        />
      )}

      {activeStudio === 'graphic' && (
        <GraphicDesignStudio
          key={currentProject.id}
          projectName={currentProject.name}
          initialState={currentProject.graphicState || buildDefaultGraphicState()}
          onSaveGraphicState={(graphicState) => {
            const updated: EditXProject = {
              ...currentProject,
              studio: 'graphic',
              resolutionSummary: `${graphicState.width}×${graphicState.height} · ${graphicState.presetName}`,
              graphicState,
            };
            setHasDirtyEdits(true);
            setCurrentProject(updated);
            setProjects(upsertProject(updated));
          }}
          onBackToDashboard={handleLeaveStudioToDashboard}
        />
      )}

      {activeStudio === 'audio' && (
        <AudioStudio
          key={currentProject.id}
          projectName={currentProject.name}
          initialState={currentProject.audioState || buildDefaultAudioState()}
          onSaveAudioState={(audioState) => {
            const updated: EditXProject = {
              ...currentProject,
              studio: 'audio',
              audioState,
            };
            setHasDirtyEdits(true);
            setCurrentProject(updated);
            setProjects(upsertProject(updated));
          }}
          onBackToDashboard={handleLeaveStudioToDashboard}
        />
      )}

      {activeStudio === 'ai' && (
        <AICreativeStudio
          initialTool={aiInitialTool}
          onBackToDashboard={() => setActiveStudio('dashboard')}
          onApplyAiEditPlanToVideo={(plan) => {
            const tl = buildDefaultVideoTimeline();
            tl.clips = tl.clips.map((c) =>
              c.mediaType === 'image' || c.mediaType === 'video'
                ? {
                    ...c,
                    speed: plan.speed,
                    transitionIn: plan.transition,
                    effects: { ...c.effects, lut: plan.lut },
                  }
                : c
            );
            const textTrackId = tl.tracks.find((t) => t.kind === 'text')?.id || 't_text';
            const aiCaptions: TimelineClip[] = plan.captions.map((cap, idx) => ({
              id: `ai_cap_${Date.now()}_${idx}`,
              trackId: textTrackId,
              name: cap.text,
              mediaType: 'text',
              textContent: cap.text,
              fontFamily: 'Outfit',
              fontSize: 48,
              textColor: '#FFFFFF',
              textAnimation: 'pop',
              startTime: cap.startTime,
              duration: cap.duration,
              inPoint: 0,
              speed: 1,
              reversed: false,
              transform: { ...createDefaultTransform(), y: 32 },
              blendMode: 'source-over',
              mask: 'none',
              chromaKey: createDefaultChromaKey(),
              effects: createDefaultEffects(),
              transitionIn: 'crossfade',
              transitionDuration: 0.2,
              keyframes: [],
              volume: 0,
              fadeIn: 0,
              fadeOut: 0,
            }));
            tl.clips = tl.clips.filter((c) => c.mediaType !== 'text').concat(aiCaptions);

            const proj = createNewProject(plan.title || 'AI Co-Pilot Cut', 'video');
            proj.timelineState = tl;
            setProjects(upsertProject(proj));
            setCurrentProject(proj);
            setActiveStudio('video');
            notify('Applied AI Edit Plan to Video Timeline');
          }}
          onInjectSubtitlesToVideo={(cues) => {
            const baseTl = currentProject.timelineState || buildDefaultVideoTimeline();
            let textTrack = baseTl.tracks.find((t) => t.kind === 'text');
            const nextTracks = [...baseTl.tracks];
            if (!textTrack) {
              textTrack = {
                id: 't_ai_subs',
                name: 'AI Subtitles',
                kind: 'text',
                muted: false,
                solo: false,
                locked: false,
                hidden: false,
              };
              nextTracks.unshift(textTrack);
            }
            const subClips: TimelineClip[] = cues.map((cue, idx) => ({
              id: `sub_${Date.now()}_${idx}`,
              trackId: textTrack!.id,
              name: cue.text,
              mediaType: 'text',
              textContent: cue.text,
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 38,
              textColor: '#F8FAFC',
              textAnimation: 'karaoke',
              startTime: Number(cue.startTime.toFixed(2)),
              duration: Number(Math.max(0.4, cue.endTime - cue.startTime).toFixed(2)),
              inPoint: 0,
              speed: 1,
              reversed: false,
              transform: { ...createDefaultTransform(), y: 36 },
              blendMode: 'source-over',
              mask: 'none',
              chromaKey: createDefaultChromaKey(),
              effects: createDefaultEffects(),
              transitionIn: 'none',
              transitionDuration: 0,
              keyframes: [],
              volume: 0,
              fadeIn: 0,
              fadeOut: 0,
            }));

            const updatedProj: EditXProject = {
              ...currentProject,
              studio: 'video',
              timelineState: {
                ...baseTl,
                tracks: nextTracks,
                clips: [...baseTl.clips, ...subClips],
              },
            };
            setCurrentProject(updatedProj);
            setProjects(upsertProject(updatedProj));
            setActiveStudio('video');
            notify(`Injected ${subClips.length} timed captions onto timeline`);
          }}
          onSendVoiceoverToAudioStudio={(name, wavDataUrl) => {
            const audState = currentProject.audioState || buildDefaultAudioState();
            const voTrack = {
              id: `ai_vo_${Date.now()}`,
              name,
              customAudioUrl: wavDataUrl,
              startTime: 0,
              duration: 5,
              trimStart: 0,
              trimEnd: 5,
              volume: 1.0,
              pan: 0,
              fadeIn: 0.1,
              fadeOut: 0.2,
              muted: false,
              solo: false,
              noiseReduction: false,
            };
            const proj = createNewProject(`${name} Mix`, 'audio');
            proj.audioState = {
              ...audState,
              tracks: [voTrack, ...audState.tracks],
            };
            setProjects(upsertProject(proj));
            setCurrentProject(proj);
            setActiveStudio('audio');
          }}
        />
      )}

      {settingsModalTab && (
        <SettingsAndApkModal
          initialTab={settingsModalTab}
          settings={settings}
          onUpdateSettings={(next) => {
            setSettings(next);
            saveStudioSettings(next);
          }}
          onClose={() => setSettingsModalTab(null)}
        />
      )}

      {/* Offline Mode Connectivity Banner */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
        >
          Offline Mode — Local editing engines & autosave remain 100% active.
        </div>
      )}

      {/* Subtle Action Feedback Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 rounded-lg bg-[#181826] border border-violet-500/40 px-4 py-2.5 text-xs font-medium text-white shadow-xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
