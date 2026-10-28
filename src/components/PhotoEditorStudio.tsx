import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Eraser,
  Eye,
  FlipHorizontal,
  Layers,
  Plus,
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Upload,
} from 'lucide-react';
import {
  computeRgbHistogram,
  createDefaultPhotoAdjustments,
  inpaintCirclePatch,
  PhotoAdjustments,
  processImageBuffer,
} from '../engine/imageEngine';
import { LutPresetId } from '../engine/timelineEngine';
import { STUDIO_MEDIA_ASSETS } from '../services/mediaAssets';

interface PhotoOverlayLayer {
  id: string;
  kind: 'text' | 'sticker';
  text: string;
  x: number; // 0..100%
  y: number; // 0..100%
  fontSize: number;
  color: string;
  blendMode: GlobalCompositeOperation;
  visible: boolean;
}

interface PhotoEditorStudioProps {
  projectName: string;
  initialImageUrl: string;
  initialAdjustments: PhotoAdjustments;
  onSavePhotoState: (imageUrl: string, adjustments: PhotoAdjustments) => void;
  onBackToDashboard: () => void;
}

export const PhotoEditorStudio: React.FC<PhotoEditorStudioProps> = ({
  projectName,
  initialImageUrl,
  initialAdjustments,
  onSavePhotoState,
  onBackToDashboard,
}) => {
  const [imageUrl, setImageUrl] = useState<string>(initialImageUrl || STUDIO_MEDIA_ASSETS.portrait);
  const [adj, setAdj] = useState<PhotoAdjustments>(initialAdjustments);
  const [activePanel, setActivePanel] = useState<'light' | 'hsl' | 'retouch' | 'layers'>('light');
  const [activeHslChannel, setActiveHslChannel] = useState<keyof PhotoAdjustments['hsl']>('red');
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [flipX, setFlipX] = useState<boolean>(false);
  const [aspectCrop, setAspectCrop] = useState<'free' | '1:1' | '4:5' | '16:9'>('free');
  const [compareOriginal, setCompareOriginal] = useState<boolean>(false);
  const [healingBrushActive, setHealingBrushActive] = useState<boolean>(false);
  const [brushRadius, setBrushRadius] = useState<number>(22);
  const [healCount, setHealCount] = useState<number>(0);
  const [layers, setLayers] = useState<PhotoOverlayLayer[]>([]);
  const [histogram, setHistogram] = useState<{ r: number[]; g: number[]; b: number[] }>({
    r: [],
    g: [],
    b: [],
  });
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiCritique, setAiCritique] = useState<string>('');
  const [aiError, setAiError] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseBitmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const updateAdj = (next: PhotoAdjustments) => {
    setAdj(next);
    onSavePhotoState(imageUrl, next);
  };

  // Load selected image into offscreen working buffer (allowing non-destructive grading + persistent brush healing)
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      const maxDim = 1080;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d');
      if (octx) {
        octx.drawImage(img, 0, 0, w, h);
      }
      baseBitmapCanvasRef.current = off;
      setHealCount((c) => c + 1);
    };
  }, [imageUrl]);

  const renderPhotoPipeline = useCallback(
    (targetCanvas: HTMLCanvasElement, forExportOpaqueJpg: boolean = false) => {
      const srcCanvas = baseBitmapCanvasRef.current;
      if (!srcCanvas) return;

      let cropW = srcCanvas.width;
      let cropH = srcCanvas.height;
      if (aspectCrop === '1:1') {
        const s = Math.min(cropW, cropH);
        cropW = s;
        cropH = s;
      } else if (aspectCrop === '4:5') {
        cropW = Math.min(srcCanvas.width, Math.round(srcCanvas.height * 0.8));
        cropH = Math.min(srcCanvas.height, Math.round(cropW / 0.8));
      } else if (aspectCrop === '16:9') {
        cropH = Math.min(srcCanvas.height, Math.round((srcCanvas.width * 9) / 16));
      }

      targetCanvas.width = cropW;
      targetCanvas.height = cropH;
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      // Prepare pixel buffer in temporary canvas
      const work = document.createElement('canvas');
      work.width = cropW;
      work.height = cropH;
      const wctx = work.getContext('2d');
      if (!wctx) return;

      wctx.save();
      wctx.translate(cropW / 2, cropH / 2);
      wctx.rotate((rotationDeg * Math.PI) / 180);
      wctx.scale(flipX ? -1 : 1, 1);
      wctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
      wctx.restore();

      const imgData = wctx.getImageData(0, 0, cropW, cropH);
      if (!compareOriginal) {
        processImageBuffer(imgData.data, cropW, cropH, adj);
      }
      wctx.putImageData(imgData, 0, 0);

      // Update live RGB histogram when drawing on preview canvas
      if (!forExportOpaqueJpg) {
        setHistogram(computeRgbHistogram(imgData.data));
      }

      // Draw Replacement Background or Checkerboard for transparent PNG cutout
      ctx.clearRect(0, 0, cropW, cropH);
      if (adj.bgRemove.enabled) {
        if (adj.bgRemove.replacementBg === 'transparent' && !forExportOpaqueJpg) {
          // Draw visual checkerboard ONLY on screen preview (real PNG export stays genuinely alpha-transparent!)
          if (targetCanvas === canvasRef.current) {
            const tile = 18;
            for (let y = 0; y < cropH; y += tile) {
              for (let x = 0; x < cropW; x += tile) {
                ctx.fillStyle = ((x / tile + y / tile) & 1) === 0 ? '#1E1E2A' : '#12121A';
                ctx.fillRect(x, y, tile, tile);
              }
            }
          }
        } else if (adj.bgRemove.replacementBg !== 'transparent') {
          if (adj.bgRemove.replacementBg === 'violet-studio') {
            const g = ctx.createLinearGradient(0, 0, cropW, cropH);
            g.addColorStop(0, '#2E1065');
            g.addColorStop(1, '#09090D');
            ctx.fillStyle = g;
          } else {
            ctx.fillStyle = adj.bgRemove.replacementBg;
          }
          ctx.fillRect(0, 0, cropW, cropH);
        }
      } else if (forExportOpaqueJpg) {
        ctx.fillStyle = '#09090D';
        ctx.fillRect(0, 0, cropW, cropH);
      }

      ctx.drawImage(work, 0, 0);

      // Composite non-destructive Text & Sticker Layers
      for (const layer of layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalCompositeOperation = layer.blendMode;
        const pxSize = Math.round((layer.fontSize / 600) * cropH);
        ctx.font = `700 ${pxSize}px "Outfit", sans-serif`;
        ctx.fillStyle = layer.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.text, (layer.x / 100) * cropW, (layer.y / 100) * cropH);
        ctx.restore();
      }
    },
    [adj, aspectCrop, compareOriginal, flipX, layers, rotationDeg]
  );

  useEffect(() => {
    if (canvasRef.current) {
      renderPhotoPipeline(canvasRef.current, false);
    }
  }, [renderPhotoPipeline, healCount]);

  // Interactive Object Removal / Spot Healing click handler on Canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!healingBrushActive || !canvasRef.current || !baseBitmapCanvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = baseBitmapCanvasRef.current.width / rect.width;
    const scaleY = baseBitmapCanvasRef.current.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const bctx = baseBitmapCanvasRef.current.getContext('2d');
    if (!bctx) return;
    const w = baseBitmapCanvasRef.current.width;
    const h = baseBitmapCanvasRef.current.height;
    const imgData = bctx.getImageData(0, 0, w, h);
    inpaintCirclePatch(imgData.data, w, h, cx, cy, brushRadius);
    bctx.putImageData(imgData, 0, 0);
    setHealCount((c) => c + 1);
  };

  // Real Gemini Multimodal Auto-Grade Analysis
  const handleRunGeminiAutoGrade = async () => {
    if (!baseBitmapCanvasRef.current) return;
    setAiAnalyzing(true);
    setAiError('');
    try {
      const jpegDataUrl = baseBitmapCanvasRef.current.toDataURL('image/jpeg', 0.82);
      const base64 = jpegDataUrl.split(',')[1];
      const res = await fetch('/api/ai/enhance-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
          intent: 'Editorial clarity, rich shadow detail, and balanced skin luminance',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI grading failed.');

      const next: PhotoAdjustments = {
        ...adj,
        exposure: Number(data.exposure) || 0,
        contrast: Number(data.contrast) || 0,
        highlights: Number(data.highlights) || 0,
        shadows: Number(data.shadows) || 0,
        saturation: Number(data.saturation) || 0,
        vibrance: Number(data.vibrance) || 0,
        temperature: Number(data.temperature) || 0,
        tint: Number(data.tint) || 0,
        skinSmoothing: Number(data.skinSmoothing) || 0,
      };
      updateAdj(next);
      setAiCritique(data.critique || 'Applied calculated studio tonal balance.');
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'AI photo analysis unavailable.');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleExportImage = (format: 'png' | 'jpg') => {
    const expCanvas = document.createElement('canvas');
    renderPhotoPipeline(expCanvas, format === 'jpg');
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const url = expCanvas.toDataURL(mime, 0.96);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_EDITX.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#09090D] text-[#F8FAFC] flex flex-col">
      {/* Header */}
      <header className="h-13 px-4 bg-[#0E0E15] border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-slate-200 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </button>
          <h1 className="font-display text-sm font-semibold text-white truncate max-w-[220px]">
            {projectName}
          </h1>
          <span className="hidden md:inline text-xs text-slate-400">
            Advanced Photo & RAW-Style LUT Studio
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={() => setCompareOriginal(true)}
            onMouseUp={() => setCompareOriginal(false)}
            onMouseLeave={() => setCompareOriginal(false)}
            onTouchStart={() => setCompareOriginal(true)}
            onTouchEnd={() => setCompareOriginal(false)}
            className="px-3 py-1.5 min-h-[38px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hold Original</span>
          </button>

          <button
            type="button"
            onClick={() => updateAdj(createDefaultPhotoAdjustments())}
            className="px-3 py-1.5 min-h-[38px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-300 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportImage('png')}
            className="px-3.5 py-2 min-h-[38px] rounded-lg bg-white/[0.1] hover:bg-white/[0.18] text-xs font-semibold text-white whitespace-nowrap"
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={() => handleExportImage('jpg')}
            className="px-3.5 py-2 min-h-[38px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export High-Res JPG</span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* Left Studio Sample & Import Column */}
        <aside className="lg:col-span-2 bg-[#0E0E15] border-b lg:border-b-0 lg:border-r border-white/[0.08] p-3 space-y-3 overflow-y-auto">
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className="w-full py-2.5 min-h-[40px] rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Open Photo</span>
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            aria-label="Upload photo to edit"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setImageUrl(URL.createObjectURL(f));
              e.target.value = '';
            }}
          />

          <div className="space-y-2">
            <span className="block text-[11px] font-medium text-slate-400">Studio Plates</span>
            {[
              { label: 'Editorial Portrait', url: STUDIO_MEDIA_ASSETS.portrait },
              { label: 'Stadium Strike', url: STUDIO_MEDIA_ASSETS.football },
              { label: 'Tokyo Rain 35mm', url: STUDIO_MEDIA_ASSETS.cinematic },
              { label: 'Skate Golden Hour', url: STUDIO_MEDIA_ASSETS.verticalReel },
              { label: 'Cinema Desk', url: STUDIO_MEDIA_ASSETS.techStudio },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setImageUrl(item.url)}
                className={`w-full rounded-lg overflow-hidden border text-left transition-all ${
                  imageUrl === item.url ? 'border-violet-500 ring-1 ring-violet-500' : 'border-white/[0.08]'
                }`}
              >
                <img
                  src={item.url}
                  alt={item.label}
                  referrerPolicy="no-referrer"
                  className="w-full h-16 object-cover"
                />
                <div className="px-2 py-1 bg-[#14141F] text-[11px] text-slate-200 truncate">
                  {item.label}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Center High-Precision Image Viewport */}
        <section className="lg:col-span-6 bg-[#09090D] p-4 flex flex-col items-center justify-center relative min-h-[340px]">
          {healingBrushActive && (
            <div className="mb-2 px-3 py-1 rounded-lg bg-violet-600/20 border border-violet-500/40 text-xs text-violet-200">
              Object Removal Brush Active — Click any spot on the photo to heal & inpaint
            </div>
          )}
          <canvas
            ref={canvasRef}
            data-testid="photo-editor-canvas"
            onClick={handleCanvasClick}
            className={`max-w-full max-h-[64vh] rounded-xl border border-white/[0.1] shadow-2xl object-contain ${
              healingBrushActive ? 'cursor-crosshair' : ''
            }`}
          />

          {/* Quick Geometry Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(['free', '1:1', '4:5', '16:9'] as const).map((cr) => (
              <button
                key={cr}
                type="button"
                onClick={() => setAspectCrop(cr)}
                className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-mono ${
                  aspectCrop === cr
                    ? 'bg-white text-[#09090D] font-semibold'
                    : 'bg-[#14141F] text-slate-300 border border-white/[0.08]'
                }`}
              >
                Crop {cr}
              </button>
            ))}
            <button
              type="button"
              aria-label="Rotate 90 degrees clockwise"
              onClick={() => setRotationDeg((r) => (r + 90) % 360)}
              className="min-h-[36px] px-3 rounded-lg bg-[#14141F] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>90°</span>
            </button>
            <button
              type="button"
              aria-label="Flip image horizontally"
              onClick={() => setFlipX((f) => !f)}
              className="min-h-[36px] px-3 rounded-lg bg-[#14141F] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>Flip</span>
            </button>
          </div>
        </section>

        {/* Right Lightroom + Photoshop Inspector */}
        <aside className="lg:col-span-4 bg-[#0E0E15] border-t lg:border-t-0 lg:border-l border-white/[0.08] flex flex-col min-h-0">
          {/* Live RGB Histogram */}
          <div className="p-3 border-b border-white/[0.08]">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-mono">
              <span>RGB HISTOGRAM</span>
              <span>NON-DESTRUCTIVE 32F</span>
            </div>
            <svg viewBox="0 0 64 24" className="w-full h-12 bg-[#09090D] rounded-lg border border-white/[0.06]" preserveAspectRatio="none">
              {histogram.r.map((val, idx) => (
                <g key={idx}>
                  <rect x={idx} y={24 - val * 22} width="1" height={val * 22} fill="rgba(239,68,68,0.45)" />
                  <rect
                    x={idx}
                    y={24 - (histogram.g[idx] || 0) * 22}
                    width="1"
                    height={(histogram.g[idx] || 0) * 22}
                    fill="rgba(34,197,94,0.45)"
                  />
                  <rect
                    x={idx}
                    y={24 - (histogram.b[idx] || 0) * 22}
                    width="1"
                    height={(histogram.b[idx] || 0) * 22}
                    fill="rgba(59,130,246,0.5)"
                  />
                </g>
              ))}
            </svg>
          </div>

          {/* Panel Tabs */}
          <div className="p-2 border-b border-white/[0.08] grid grid-cols-4 gap-1">
            {(
              [
                { id: 'light', label: 'Light & Color', icon: Sliders },
                { id: 'hsl', label: 'HSL & Curves', icon: Sparkles },
                { id: 'retouch', label: 'Cutout & AI', icon: Eraser },
                { id: 'layers', label: 'Layers & Text', icon: Layers },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActivePanel(t.id)}
                className={`py-1.5 px-1.5 min-h-[34px] rounded-md text-[11px] font-semibold truncate ${
                  activePanel === t.id
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white bg-white/[0.03]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {activePanel === 'light' && (
              <>
                {(
                  [
                    { label: 'Exposure (EV)', key: 'exposure', min: -2, max: 2, step: 0.05 },
                    { label: 'Contrast', key: 'contrast', min: -80, max: 80, step: 1 },
                    { label: 'Highlights', key: 'highlights', min: -100, max: 100, step: 1 },
                    { label: 'Shadows', key: 'shadows', min: -100, max: 100, step: 1 },
                    { label: 'Vibrance', key: 'vibrance', min: -100, max: 100, step: 1 },
                    { label: 'Saturation', key: 'saturation', min: -100, max: 100, step: 1 },
                    { label: 'Temperature', key: 'temperature', min: -80, max: 80, step: 1 },
                    { label: 'Tint', key: 'tint', min: -80, max: 80, step: 1 },
                    { label: 'Lens Vignette', key: 'vignette', min: 0, max: 100, step: 1 },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-mono text-slate-200 tabular-nums">{adj[item.key]}</span>
                    </div>
                    <input
                      type="range"
                      aria-label={item.label}
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      value={adj[item.key]}
                      onChange={(e) =>
                        updateAdj({ ...adj, [item.key]: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                ))}
              </>
            )}

            {activePanel === 'hsl' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="photo-lut-select" className="text-slate-300 font-medium">
                    Cinema Color LUT Preset
                  </label>
                  <select
                    id="photo-lut-select"
                    value={adj.lut}
                    onChange={(e) => updateAdj({ ...adj, lut: e.target.value as LutPresetId })}
                    className="w-full px-3 py-2 rounded-lg bg-[#14141F] border border-white/[0.1] text-white"
                  >
                    <option value="none">None (Linear)</option>
                    <option value="clean-portrait">Clean Editorial Portrait</option>
                    <option value="kodak-2383">Kodak 2383 Film Print</option>
                    <option value="teal-amber">Anamorphic Teal & Amber</option>
                    <option value="bleach-stadium">Bleach Bypass Sports</option>
                    <option value="noir-silver">Silver Gelatin Monochrome</option>
                    <option value="golden-velvia">Golden Hour Velvia</option>
                  </select>
                </div>

                {/* Tone Curve Presets */}
                <div className="space-y-2">
                  <span className="block text-slate-300 font-medium">Tone Curve Profile</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateAdj({
                          ...adj,
                          curvePoints: [
                            { x: 0, y: 0 },
                            { x: 128, y: 128 },
                            { x: 255, y: 255 },
                          ],
                        })
                      }
                      className="py-1.5 rounded bg-[#14141F] border border-white/[0.08] text-slate-200 hover:border-violet-500"
                    >
                      Linear
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateAdj({
                          ...adj,
                          curvePoints: [
                            { x: 0, y: 0 },
                            { x: 64, y: 46 },
                            { x: 192, y: 212 },
                            { x: 255, y: 255 },
                          ],
                        })
                      }
                      className="py-1.5 rounded bg-[#14141F] border border-white/[0.08] text-slate-200 hover:border-violet-500"
                    >
                      Cinema S-Curve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateAdj({
                          ...adj,
                          curvePoints: [
                            { x: 0, y: 24 },
                            { x: 96, y: 92 },
                            { x: 255, y: 242 },
                          ],
                        })
                      }
                      className="py-1.5 rounded bg-[#14141F] border border-white/[0.08] text-slate-200 hover:border-violet-500"
                    >
                      Faded Matte
                    </button>
                  </div>
                </div>

                {/* 6-Channel HSL Mixer */}
                <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                  <span className="block text-slate-300 font-medium">6-Channel HSL Color Mixer</span>
                  <div className="grid grid-cols-6 gap-1">
                    {(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setActiveHslChannel(ch)}
                        className={`py-1.5 rounded text-[10px] font-semibold capitalize ${
                          activeHslChannel === ch
                            ? 'bg-violet-600 text-white'
                            : 'bg-[#14141F] text-slate-400'
                        }`}
                      >
                        {ch.slice(0, 3)}
                      </button>
                    ))}
                  </div>

                  {(['hue', 'saturation', 'luminance'] as const).map((param) => (
                    <div key={param} className="space-y-1">
                      <div className="flex justify-between capitalize">
                        <span className="text-slate-400">
                          {activeHslChannel} {param}
                        </span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {adj.hsl[activeHslChannel][param]}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label={`${activeHslChannel} ${param}`}
                        min={param === 'hue' ? -30 : -100}
                        max={param === 'hue' ? 30 : 100}
                        value={adj.hsl[activeHslChannel][param]}
                        onChange={(e) =>
                          updateAdj({
                            ...adj,
                            hsl: {
                              ...adj.hsl,
                              [activeHslChannel]: {
                                ...adj.hsl[activeHslChannel],
                                [param]: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePanel === 'retouch' && (
              <div className="space-y-4">
                {/* Gemini Multimodal Auto-Grade */}
                <div className="rounded-xl bg-[#14141F] border border-violet-500/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Gemini AI Smart Auto-Grade</span>
                    <span className="text-[10px] text-violet-300">Cloud AI</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Analyzes real image luminance & skin tones with Gemini 3.8 Flash to compute optimal sliders.
                  </p>
                  <button
                    type="button"
                    disabled={aiAnalyzing}
                    onClick={handleRunGeminiAutoGrade}
                    className="w-full py-2 min-h-[38px] rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{aiAnalyzing ? 'Analyzing Pixels...' : 'Run AI Auto-Enhance'}</span>
                  </button>
                  {aiCritique && <p className="text-[11px] text-emerald-300">{aiCritique}</p>}
                  {aiError && <p className="text-[11px] text-amber-300">{aiError}</p>}
                </div>

                {/* Background Removal & Replacement */}
                <div className="rounded-xl bg-[#14141F] border border-white/[0.08] p-3 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-white">Background Cutout & Replace</span>
                    <input
                      type="checkbox"
                      checked={adj.bgRemove.enabled}
                      onChange={(e) =>
                        updateAdj({
                          ...adj,
                          bgRemove: { ...adj.bgRemove, enabled: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-violet-600"
                    />
                  </label>
                  {adj.bgRemove.enabled && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Edge Tolerance</span>
                          <span className="font-mono tabular-nums">{adj.bgRemove.tolerance}</span>
                        </div>
                        <input
                          type="range"
                          aria-label="Background cutout tolerance"
                          min={8}
                          max={75}
                          value={adj.bgRemove.tolerance}
                          onChange={(e) =>
                            updateAdj({
                              ...adj,
                              bgRemove: { ...adj.bgRemove, tolerance: Number(e.target.value) },
                            })
                          }
                          className="w-full"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'transparent', label: 'Transparent' },
                          { id: 'violet-studio', label: 'Violet Backdrop' },
                          { id: '#0F172A', label: 'Dark Slate' },
                        ].map((bg) => (
                          <button
                            key={bg.id}
                            type="button"
                            onClick={() =>
                              updateAdj({
                                ...adj,
                                bgRemove: { ...adj.bgRemove, replacementBg: bg.id },
                              })
                            }
                            className={`py-1.5 rounded text-[11px] font-medium ${
                              adj.bgRemove.replacementBg === bg.id
                                ? 'bg-violet-600 text-white'
                                : 'bg-[#09090D] text-slate-300'
                            }`}
                          >
                            {bg.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Portrait Skin Smoothing & Radial Mask */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Portrait Skin Smoothing</span>
                    <span className="font-mono tabular-nums">{adj.skinSmoothing}</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Portrait skin smoothing"
                    min={0}
                    max={100}
                    value={adj.skinSmoothing}
                    onChange={(e) =>
                      updateAdj({ ...adj, skinSmoothing: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>

                {/* Patch Object Removal Brush */}
                <div className="rounded-xl bg-[#14141F] border border-white/[0.08] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Spot Object Removal Brush</span>
                    <button
                      type="button"
                      onClick={() => setHealingBrushActive((b) => !b)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                        healingBrushActive ? 'bg-violet-600 text-white' : 'bg-white/[0.08] text-slate-300'
                      }`}
                    >
                      {healingBrushActive ? 'Brush Active' : 'Enable Brush'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Brush Size: {brushRadius}px</span>
                    <input
                      type="range"
                      aria-label="Healing brush size"
                      min={8}
                      max={60}
                      value={brushRadius}
                      onChange={(e) => setBrushRadius(Number(e.target.value))}
                      className="w-32"
                    />
                  </div>
                </div>
              </div>
            )}

            {activePanel === 'layers' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() =>
                    setLayers((prev) => [
                      ...prev,
                      {
                        id: `lyr_${Date.now()}`,
                        kind: 'text',
                        text: 'EDIT X STUDIO',
                        x: 50,
                        y: 85,
                        fontSize: 42,
                        color: '#FFFFFF',
                        blendMode: 'source-over',
                        visible: true,
                      },
                    ])
                  }
                  className="w-full py-2 min-h-[38px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                >
                  <TypeIcon className="w-3.5 h-3.5" />
                  <span>Add Typography Layer</span>
                </button>

                {layers.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">
                    Add typography or graphic layers with blend modes above the base RAW plate.
                  </p>
                ) : (
                  layers.map((lyr) => (
                    <div
                      key={lyr.id}
                      className="rounded-lg bg-[#14141F] border border-white/[0.08] p-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          aria-label="Layer text"
                          value={lyr.text}
                          onChange={(e) =>
                            setLayers((all) =>
                              all.map((item) =>
                                item.id === lyr.id ? { ...item, text: e.target.value } : item
                              )
                            )
                          }
                          className="flex-1 px-2 py-1 rounded bg-[#09090D] border border-white/[0.1] text-white"
                        />
                        <button
                          type="button"
                          aria-label="Delete layer"
                          onClick={() => setLayers((all) => all.filter((i) => i.id !== lyr.id))}
                          className="p-1.5 text-slate-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="range"
                          aria-label="Layer vertical position"
                          min={5}
                          max={95}
                          value={lyr.y}
                          onChange={(e) =>
                            setLayers((all) =>
                              all.map((item) =>
                                item.id === lyr.id ? { ...item, y: Number(e.target.value) } : item
                              )
                            )
                          }
                        />
                        <select
                          aria-label="Layer blend mode"
                          value={lyr.blendMode}
                          onChange={(e) =>
                            setLayers((all) =>
                              all.map((item) =>
                                item.id === lyr.id
                                  ? { ...item, blendMode: e.target.value as GlobalCompositeOperation }
                                  : item
                              )
                            )
                          }
                          className="px-2 py-1 rounded bg-[#09090D] border border-white/[0.1] text-white"
                        >
                          <option value="source-over">Normal</option>
                          <option value="overlay">Overlay</option>
                          <option value="screen">Screen</option>
                          <option value="multiply">Multiply</option>
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
