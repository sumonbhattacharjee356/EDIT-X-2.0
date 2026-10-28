import React, { useState } from 'react';
import { Check, Code2, Download, HardDrive, ShieldCheck, Smartphone, X } from 'lucide-react';
import {
  ANDROID_NATIVE_FILES,
  generateNativeAndroidZip,
} from '../services/androidApkGenerator';
import {
  getLocalStorageUsageStats,
  StudioSettings,
} from '../services/projectStorage';

interface SettingsAndApkModalProps {
  initialTab: 'general' | 'android';
  settings: StudioSettings;
  onUpdateSettings: (next: StudioSettings) => void;
  onClose: () => void;
}

export const SettingsAndApkModal: React.FC<SettingsAndApkModalProps> = ({
  initialTab,
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'android'>(initialTab);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipDone, setZipDone] = useState(false);

  const storageStats = getLocalStorageUsageStats();
  const activeAndroidFile = ANDROID_NATIVE_FILES[selectedFileIndex] || ANDROID_NATIVE_FILES[0];

  const handleDownloadAndroidZip = async () => {
    setDownloadingZip(true);
    try {
      const blob = await generateNativeAndroidZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'EDIT-X-Android-Native-Studio-Project.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setZipDone(true);
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-apk-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl bg-[#12121A] border border-white/[0.12] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 id="settings-apk-title" className="font-display text-lg font-bold text-white">
              Studio Settings & Native Android Architecture
            </h2>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#09090D] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'general' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Workspace & Licensing
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'android' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android Kotlin / APK Source</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close settings modal"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-4 space-y-3">
                  <h3 className="font-display text-sm font-semibold text-white">
                    Engine & Autosave Preferences
                  </h3>

                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="autosave-select" className="text-slate-300">
                      Crash-Recovery Autosave Interval
                    </label>
                    <select
                      id="autosave-select"
                      value={settings.autosaveSeconds}
                      onChange={(e) =>
                        onUpdateSettings({ ...settings, autosaveSeconds: Number(e.target.value) })
                      }
                      className="px-2.5 py-1.5 rounded bg-[#14141F] border border-white/[0.1] text-white"
                    >
                      <option value={2}>Every 2 seconds</option>
                      <option value={4}>Every 4 seconds</option>
                      <option value={10}>Every 10 seconds</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="def-fps-select" className="text-slate-300">
                      Default Timeline Frame Rate
                    </label>
                    <select
                      id="def-fps-select"
                      value={settings.defaultFps}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          defaultFps: Number(e.target.value) as 24 | 30 | 60,
                        })
                      }
                      className="px-2.5 py-1.5 rounded bg-[#14141F] border border-white/[0.1] text-white"
                    >
                      <option value={24}>24 FPS Cinema</option>
                      <option value={30}>30 FPS Broadcast</option>
                      <option value={60}>60 FPS Smooth Action</option>
                    </select>
                  </div>

                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-1">
                    <span>Magnetic Timeline Snapping</span>
                    <input
                      type="checkbox"
                      checked={settings.magneticSnapping}
                      onChange={(e) =>
                        onUpdateSettings({ ...settings, magneticSnapping: e.target.checked })
                      }
                      className="w-4 h-4 accent-violet-600"
                    />
                  </label>
                </div>

                <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-violet-400" />
                    <h3 className="font-display text-sm font-semibold text-white">
                      Local Storage & Cache
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Current local project database usage:{' '}
                    <strong className="font-mono text-white tabular-nums">
                      {storageStats.formatted}
                    </strong>
                    . All projects are stored privately on your device and can be exported as
                    portable <code className="text-violet-300">.editx.zip</code> archives.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-display text-sm font-semibold text-white">
                    Premium Features Free & Transparent API Disclosure
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  EDIT X unlocks 100% of its local creative tools—4K 60fps export, multi-layer
                  video/motion timelines, Lightroom-grade tone curves, HSL color grading, chroma
                  key, patch object inpainting, 5-band audio EQ, and WAV/PDF export—completely free
                  with zero subscriptions and zero watermarks.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Optional cloud AI tools in the AI Creative Studio (Gemini 3.8 Flash Co-Pilot,
                  Gemini 3.5 Speech-to-Text Transcription, and Gemini 3.8 TTS Voiceover) run via
                  server-side Google Gemini API endpoints and consume standard Gemini API quota on
                  the configured project key.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#09090D] border border-violet-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-violet-400" />
                    <span>Complete Native Android Kotlin + Jetpack Compose + Media3 Project</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Includes Gradle KTS build files, AndroidManifest.xml, Material 3 UI, Media3
                    Transformer H.264/H.265 4K exporter, OpenGL ES 3.0 LUT/Chroma shader, Room
                    Database, WorkManager, and APK build instructions.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={downloadingZip}
                  onClick={handleDownloadAndroidZip}
                  className="px-4 py-2.5 min-h-[44px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-2 shrink-0 whitespace-nowrap"
                >
                  {zipDone ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  <span>
                    {downloadingZip
                      ? 'Packaging Archive...'
                      : zipDone
                        ? 'Downloaded Android ZIP'
                        : 'Download Android Project (.zip)'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded-xl bg-[#09090D] border border-white/[0.08] p-2 space-y-1">
                  {ANDROID_NATIVE_FILES.map((file, idx) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedFileIndex(idx)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        selectedFileIndex === idx
                          ? 'bg-violet-600/20 text-violet-200 font-semibold border border-violet-500/30'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="font-mono truncate">{file.path}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {file.description}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-2 rounded-xl bg-[#09090D] border border-white/[0.08] overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>{activeAndroidFile.path}</span>
                    <span>{activeAndroidFile.language}</span>
                  </div>
                  <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[380px] leading-relaxed">
                    {activeAndroidFile.content}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
