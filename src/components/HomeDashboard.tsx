import React, { useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Cloud,
  Copy,
  Download,
  FileUp,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Music,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  CREATIVE_TEMPLATES,
  CreativeTemplate,
  StudioMode,
} from '../services/mediaAssets';
import { EditXProject } from '../services/projectStorage';
import { usePWAInstall } from '../services/usePWAInstall';

interface HomeDashboardProps {
  projects: EditXProject[];
  crashSnapshot: { savedAt: number; project: EditXProject } | null;
  onRecoverCrash: () => void;
  onDismissCrash: () => void;
  onOpenStudio: (studio: StudioMode) => void;
  onCreateProject: (name: string, studio: Exclude<StudioMode, 'dashboard' | 'ai'>) => void;
  onOpenProject: (project: EditXProject) => void;
  onApplyTemplate: (template: CreativeTemplate) => void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onToggleCloud: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onExportProjectFile: (project: EditXProject) => void;
  onImportProjectFile: (file: File) => void;
  onOpenSettings: (tab?: 'general' | 'android') => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  projects,
  crashSnapshot,
  onRecoverCrash,
  onDismissCrash,
  onOpenStudio,
  onCreateProject,
  onOpenProject,
  onApplyTemplate,
  onDuplicateProject,
  onRenameProject,
  onToggleCloud,
  onDeleteProject,
  onExportProjectFile,
  onImportProjectFile,
  onOpenSettings,
}) => {
  const [projectTab, setProjectTab] = useState<'all' | 'recent' | 'cloud' | 'drafts'>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjStudio, setNewProjStudio] =
    useState<Exclude<StudioMode, 'dashboard' | 'ai'>>('video');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const studiosList: Array<{
    id: StudioMode;
    title: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'video',
      title: 'Video Editor',
      subtitle: 'Multi-track timeline · LUTs · Chroma · 4K 60fps',
      icon: Clapperboard,
    },
    {
      id: 'photo',
      title: 'Photo Editor',
      subtitle: 'Lightroom curves · HSL · Retouch · Cutout',
      icon: ImageIcon,
    },
    {
      id: 'motion',
      title: 'Motion Graphics',
      subtitle: 'Bezier graph editor · Keyframes · Vector rigs',
      icon: Layers,
    },
    {
      id: 'graphic',
      title: 'Graphic Designer',
      subtitle: 'Thumbnails · Social posts · Logos · PDF export',
      icon: Palette,
    },
    {
      id: 'audio',
      title: 'Audio Studio',
      subtitle: 'Multi-track DAW · 5-Band EQ · Voiceover · WAV',
      icon: Music,
    },
    {
      id: 'ai',
      title: 'AI Studio',
      subtitle: 'Gemini captions · Voice TTS · Auto-grade · Co-pilot',
      icon: Wand2,
    },
  ];

  const categories = [
    'All',
    'Football Edits',
    'Cinematic',
    'Reels & Shorts',
    'YouTube',
    'Photo & Grading',
    'Motion Graphics',
    'Social Graphics',
  ];

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.studio.toLowerCase().includes(q)) {
        return false;
      }
      if (projectTab === 'recent') {
        return Date.now() - p.updatedAt < 1000 * 60 * 60 * 48;
      }
      if (projectTab === 'cloud') return p.cloudSynced;
      if (projectTab === 'drafts') return p.isDraft;
      return true;
    });
  }, [projects, projectTab, searchQuery]);

  const filteredTemplates = useMemo(() => {
    if (templateFilter === 'All') return CREATIVE_TEMPLATES;
    return CREATIVE_TEMPLATES.filter((t) => t.category === templateFilter);
  }, [templateFilter]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    onCreateProject(newProjName.trim(), newProjStudio);
    setNewProjName('');
    setShowNewModal(false);
  };

  const formatRelativeTime = (epochMs: number) => {
    const mins = Math.max(1, Math.round((Date.now() - epochMs) / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  };

  return (
    <div className="min-h-screen bg-[#09090D] text-[#F8FAFC] pb-20 md:pb-12">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-8 h-14 bg-[#09090D]/90 backdrop-blur-md border-b border-white/[0.08]">
        <a
          href="#top"
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          EDIT X
        </a>

        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
        >
          <a
            href="#studios"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Studios
          </a>
          <a
            href="#projects"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            My Projects
          </a>
          <a
            href="#templates"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Templates
          </a>
          <button
            type="button"
            onClick={() => onOpenStudio('ai')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            AI Studio
          </button>
          <button
            type="button"
            onClick={() => onOpenSettings('general')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Settings
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              setNewProjName('Champions Cut 01');
              setShowNewModal(true);
            }}
            className="px-4 py-2 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </header>

      <main id="top" className="max-w-7xl mx-auto px-4 sm:px-8 pt-8 space-y-12">
        {/* Crash Recovery Banner (Only renders if unsaved session exists) */}
        {crashSnapshot && (
          <section
            aria-label="Unfinished project recovery"
            className="rounded-xl bg-[#14141F] border border-violet-500/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <RotateCcw className="w-5 h-5 text-violet-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">
                  Unfinished session detected: {crashSnapshot.project.name}
                </p>
                <p className="text-xs text-slate-400">
                  Autosaved {formatRelativeTime(crashSnapshot.savedAt)} · Restore exact timeline and layers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onRecoverCrash}
                className="px-3.5 py-2 min-h-[40px] rounded-lg bg-white hover:bg-slate-200 text-xs font-semibold text-[#09090D] transition-colors whitespace-nowrap"
              >
                Recover Session
              </button>
              <button
                type="button"
                onClick={onDismissCrash}
                className="px-3 py-2 min-h-[40px] rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-300 transition-colors whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

        {/* Hero & Studio Launchpad */}
        <section id="studios" className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-medium text-violet-400 tracking-wide">
                All-in-One Creative Studio · Zero Watermarks · Free Local Engine
              </p>
              <h1
                className="font-display text-3xl sm:text-5xl font-bold text-white tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Create Without Limits.
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Edit multi-track 4K video, grade RAW-inspired photography, animate bezier motion
                graphics, mix multi-band audio, and run real Gemini AI workflows in one studio.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {!isInstalled && isInstallable && (
                <button
                  type="button"
                  onClick={install}
                  className="px-4 py-2.5 min-h-[44px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-violet-400" />
                  <span>Install Android App</span>
                </button>
              )}
              {!isInstalled && isIOS && (
                <button
                  type="button"
                  onClick={() => setShowIOSInstallModal(true)}
                  className="px-4 py-2.5 min-h-[44px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Smartphone className="w-4 h-4 text-violet-400" />
                  <span>Install on Home Screen</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenSettings('android')}
                className="px-4 py-2.5 min-h-[44px] rounded-lg bg-[#14141F] hover:bg-[#1B1B29] border border-white/[0.1] text-xs font-semibold text-slate-200 flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Smartphone className="w-4 h-4 text-violet-400" />
                <span>Android Native APK Source</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 min-h-[44px] rounded-lg bg-[#14141F] hover:bg-[#1B1B29] border border-white/[0.1] text-xs font-semibold text-slate-200 flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <FileUp className="w-4 h-4 text-slate-300" />
                <span>Import .editx Project</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.zip"
                aria-label="Import EDIT X project file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportProjectFile(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {/* 6 Studio Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {studiosList.map((st) => {
              const Icon = st.icon;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onOpenStudio(st.id)}
                  className="group text-left rounded-2xl bg-[#12121A] hover:bg-[#181824] border border-white/[0.08] hover:border-violet-500/40 p-5 transition-all flex items-start gap-4 min-h-[96px]"
                >
                  <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0 group-hover:bg-violet-600 group-hover:border-violet-500 transition-colors">
                    <Icon className="w-5 h-5 text-violet-300 group-hover:text-white transition-colors" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-display text-base font-semibold text-white">
                      {st.title}
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed">{st.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* My Projects / Recent / Cloud / Drafts */}
        <section id="projects" className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">Project Workspace</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Autosaved locally with instant draft duplication and portable .editx archive export
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Interactive Filter Tabs */}
              <div
                role="tablist"
                aria-label="Project filter tabs"
                className="flex items-center gap-1 p-1 rounded-lg bg-[#12121A] border border-white/[0.08]"
              >
                {(
                  [
                    { id: 'all', label: 'My Projects' },
                    { id: 'recent', label: 'Recent' },
                    { id: 'cloud', label: 'Cloud Projects' },
                    { id: 'drafts', label: 'Drafts' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={projectTab === tab.id}
                    onClick={() => setProjectTab(tab.id)}
                    className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      projectTab === tab.id
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search projects"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="pl-9 pr-3 py-2 min-h-[38px] w-48 sm:w-56 rounded-lg bg-[#12121A] border border-white/[0.08] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl bg-[#12121A] border border-white/[0.08] p-10 text-center space-y-3">
              <FolderOpen className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-medium text-slate-200">
                No matching projects in this view
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Start a blank multi-track project or pick a curated workflow template below.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewProjName('Untitled Cut');
                  setShowNewModal(true);
                }}
                className="px-4 py-2 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition-colors"
              >
                Create First Project
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#12121A] border border-white/[0.08] divide-y divide-white/[0.06]">
              {filteredProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    {renamingId === proj.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          onRenameProject(proj.id, renameDraft);
                          setRenamingId(null);
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          aria-label="New project name"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          autoFocus
                          className="px-2.5 py-1 rounded bg-[#09090D] border border-violet-500 text-sm text-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1 rounded bg-violet-600 text-xs font-medium text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="px-2.5 py-1 rounded bg-white/10 text-xs text-slate-300"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenProject(proj)}
                        className="text-left group"
                      >
                        <span className="font-display text-sm sm:text-base font-semibold text-white group-hover:text-violet-300 transition-colors">
                          {proj.name}
                        </span>
                      </button>
                    )}

                    {/* Clean Unboxed Metadata with Middot Separators */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                      <span className="capitalize text-slate-300">{proj.studio} Studio</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.resolutionSummary}</span>
                      <span aria-hidden="true">·</span>
                      <span>Updated {formatRelativeTime(proj.updatedAt)}</span>
                      {proj.cloudSynced && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-violet-300">Cloud Synced</span>
                        </>
                      )}
                      {proj.isDraft && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-300">Draft</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj)}
                      className="px-3.5 py-2 min-h-[40px] rounded-lg bg-violet-600/20 hover:bg-violet-600 text-violet-200 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename ${proj.name}`}
                      onClick={() => {
                        setRenamingId(proj.id);
                        setRenameDraft(proj.name);
                      }}
                      className="px-2.5 py-2 min-h-[40px] rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-xs text-slate-300 transition-colors whitespace-nowrap"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      aria-label={`Toggle cloud sync for ${proj.name}`}
                      onClick={() => onToggleCloud(proj.id)}
                      className={`min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center transition-colors ${
                        proj.cloudSynced
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'bg-white/[0.04] hover:bg-white/[0.1] text-slate-400'
                      }`}
                    >
                      <Cloud className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Duplicate ${proj.name}`}
                      onClick={() => onDuplicateProject(proj.id)}
                      className="min-h-[40px] min-w-[40px] rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 flex items-center justify-center transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Export ${proj.name} archive`}
                      onClick={() => onExportProjectFile(proj)}
                      className="min-h-[40px] min-w-[40px] rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 flex items-center justify-center transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${proj.name}`}
                      onClick={() => onDeleteProject(proj.id)}
                      className="min-h-[40px] min-w-[40px] rounded-lg bg-white/[0.04] hover:bg-red-500/20 text-slate-400 hover:text-red-300 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Templates Library */}
        <section id="templates" className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">Templates Library</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ready-to-edit original starter workflows for sports edits, cinema grading, Reels, and social graphics
              </p>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setTemplateFilter(cat)}
                  className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    templateFilter === cat
                      ? 'bg-white text-[#09090D]'
                      : 'bg-[#12121A] text-slate-300 hover:bg-[#1B1B28] border border-white/[0.08]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="group rounded-2xl bg-[#12121A] border border-white/[0.08] hover:border-violet-500/40 overflow-hidden flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="relative aspect-video bg-[#1A1A26] overflow-hidden">
                    {!brokenThumbs[tpl.id] ? (
                      <img
                        src={tpl.thumbnail}
                        alt={tpl.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenThumbs((prev) => ({ ...prev, [tpl.id]: true }))
                        }
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-950/60 to-slate-900">
                        <Sparkles className="w-7 h-7 text-violet-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] text-slate-200 tabular-nums">
                      <span>{tpl.category}</span>
                      <span>
                        {tpl.aspectRatio} · {tpl.fpsLabel}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-1.5">
                    <h3 className="font-display text-sm font-semibold text-white">{tpl.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                      {tpl.description}
                    </p>
                  </div>
                </div>

                <div className="px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => onApplyTemplate(tpl)}
                    className="w-full py-2 min-h-[40px] rounded-lg bg-white/[0.06] hover:bg-violet-600 text-xs font-semibold text-white transition-colors"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Mobile Ergonomic Bottom Navigation Bar (< 768px, height 56px <= 15% cap) */}
      <nav
        aria-label="Mobile quick navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[#09090D]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => onOpenStudio('video')}
          className="min-h-[44px] flex flex-col items-center justify-center text-slate-300 hover:text-white"
        >
          <Clapperboard className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Video</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenStudio('photo')}
          className="min-h-[44px] flex flex-col items-center justify-center text-slate-300 hover:text-white"
        >
          <ImageIcon className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Photo</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setNewProjName('Mobile Cut');
            setShowNewModal(true);
          }}
          aria-label="Create new project"
          className="min-h-[44px] flex flex-col items-center justify-center text-violet-400 font-semibold"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Create</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenStudio('ai')}
          className="min-h-[44px] flex flex-col items-center justify-center text-slate-300 hover:text-white"
        >
          <Wand2 className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">AI Studio</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenSettings('general')}
          className="min-h-[44px] flex flex-col items-center justify-center text-slate-300 hover:text-white"
        >
          <Settings className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Settings</span>
        </button>
      </nav>

      {/* New Project Modal */}
      {showNewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-project-modal-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#12121A] border border-white/[0.12] p-6 space-y-5">
            <h2 id="new-project-modal-title" className="font-display text-lg font-bold text-white">
              Create New Studio Project
            </h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="proj-name-input" className="block text-xs font-medium text-slate-300">
                  Project Title
                </label>
                <input
                  id="proj-name-input"
                  type="text"
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="Enter project name..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#09090D] border border-white/[0.12] text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="proj-studio-select" className="block text-xs font-medium text-slate-300">
                  Target Creative Engine
                </label>
                <select
                  id="proj-studio-select"
                  value={newProjStudio}
                  onChange={(e) =>
                    setNewProjStudio(e.target.value as Exclude<StudioMode, 'dashboard' | 'ai'>)
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#09090D] border border-white/[0.12] text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="video">Professional Video Editor (Multi-Track)</option>
                  <option value="photo">Advanced Photo Editor (Lightroom + Layers)</option>
                  <option value="motion">Motion Graphics & Keyframe Rig</option>
                  <option value="graphic">Graphic Design Studio (Thumbnails & Social)</option>
                  <option value="audio">Audio Studio (Multi-Track DAW & EQ)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 min-h-[40px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white"
                >
                  Launch Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* iOS Home Screen Install Instructions */}
      {showIOSInstallModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#12121A] border border-white/[0.12] p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-white">Install EDIT X</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              1. Tap the <strong>Share</strong> icon in your browser toolbar.
              <br />
              2. Choose <strong>Add to Home Screen</strong> to launch EDIT X full-screen.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSInstallModal(false)}
              className="w-full py-2 min-h-[40px] rounded-lg bg-violet-600 text-xs font-semibold text-white"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
