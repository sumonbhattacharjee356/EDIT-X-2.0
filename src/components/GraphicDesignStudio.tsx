import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Circle,
  Copy,
  Download,
  Image as ImageIcon,
  Square,
  Tag,
  Trash2,
  Type as TypeIcon,
  Upload,
} from 'lucide-react';
import {
  GraphicDesignState,
  GraphicElement,
  STUDIO_MEDIA_ASSETS,
} from '../services/mediaAssets';
import { buildPdfFromJpegDataUrl } from '../services/pdfGenerator';

interface GraphicDesignStudioProps {
  projectName: string;
  initialState: GraphicDesignState;
  onSaveGraphicState: (next: GraphicDesignState) => void;
  onBackToDashboard: () => void;
}

const ARTBOARD_PRESETS = [
  { name: 'YouTube Thumbnail', width: 1280, height: 720 },
  { name: 'Instagram Post', width: 1080, height: 1080 },
  { name: 'Story & TikTok Cover', width: 1080, height: 1920 },
  { name: 'Facebook Cover', width: 1640, height: 624 },
  { name: 'Logo & Watermark', width: 1000, height: 1000 },
];

export const GraphicDesignStudio: React.FC<GraphicDesignStudioProps> = ({
  projectName,
  initialState,
  onSaveGraphicState,
  onBackToDashboard,
}) => {
  const [design, setDesign] = useState<GraphicDesignState>(initialState);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialState.elements[initialState.elements.length - 1]?.id || null
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const fileUploadRef = useRef<HTMLInputElement | null>(null);

  const selectedEl = design.elements.find((e) => e.id === selectedId) || null;

  const commitDesign = (next: GraphicDesignState) => {
    setDesign(next);
    onSaveGraphicState(next);
  };

  const renderArtboard = useCallback(
    (canvas: HTMLCanvasElement, includeSelectionOutline: boolean) => {
      canvas.width = design.width;
      canvas.height = design.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = design.width;
      const H = design.height;

      // 1. Render Background
      if (design.backgroundType === 'solid') {
        ctx.fillStyle = design.backgroundPrimary;
        ctx.fillRect(0, 0, W, H);
      } else if (design.backgroundType === 'gradient') {
        const rad = (design.backgroundAngle * Math.PI) / 180;
        const gx = Math.cos(rad) * W;
        const gy = Math.sin(rad) * H;
        const grad = ctx.createLinearGradient(0, 0, gx, gy);
        grad.addColorStop(0, design.backgroundPrimary);
        grad.addColorStop(1, design.backgroundSecondary);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      } else if (design.backgroundType === 'image' && design.backgroundImage) {
        ctx.fillStyle = '#09090D';
        ctx.fillRect(0, 0, W, H);
        let bgImg = imgCacheRef.current.get(design.backgroundImage);
        if (!bgImg) {
          bgImg = new Image();
          bgImg.crossOrigin = 'anonymous';
          bgImg.src = design.backgroundImage;
          bgImg.onload = () => {
            if (canvasRef.current) renderArtboard(canvasRef.current, true);
          };
          imgCacheRef.current.set(design.backgroundImage, bgImg);
        }
        if (bgImg.complete && bgImg.naturalWidth > 0) {
          const ia = bgImg.naturalWidth / bgImg.naturalHeight;
          const ca = W / H;
          let dw = W,
            dh = H;
          if (ia > ca) {
            dh = H;
            dw = H * ia;
          } else {
            dw = W;
            dh = W / ia;
          }
          ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
        }
      }

      // 2. Render Elements in Layer Order
      for (const el of design.elements) {
        ctx.save();
        ctx.globalAlpha = el.opacity;
        const px = (el.x / 100) * W;
        const py = (el.y / 100) * H;
        const pw = (el.width / 100) * W;
        const ph = (el.height / 100) * H;

        ctx.translate(px + pw / 2, py + ph / 2);
        ctx.rotate((el.rotation * Math.PI) / 180);

        if (el.kind === 'rect') {
          ctx.fillStyle = el.fill;
          ctx.beginPath();
          ctx.roundRect(-pw / 2, -ph / 2, pw, ph, el.borderRadius || 0);
          ctx.fill();
          if (el.strokeWidth && el.strokeColor) {
            ctx.lineWidth = el.strokeWidth;
            ctx.strokeStyle = el.strokeColor;
            ctx.stroke();
          }
        } else if (el.kind === 'circle') {
          ctx.fillStyle = el.fill;
          ctx.beginPath();
          ctx.ellipse(0, 0, pw / 2, ph / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (el.kind === 'badge') {
          ctx.fillStyle = el.fill;
          ctx.beginPath();
          ctx.roundRect(-pw / 2, -ph / 2, pw, ph, el.borderRadius || 10);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `700 ${el.fontSize || 22}px "${el.fontFamily || 'Outfit'}", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(el.text || 'BADGE', 0, 1);
        } else if (el.kind === 'text') {
          ctx.fillStyle = el.fill;
          ctx.font = `${el.fontWeight || 700} ${el.fontSize || 52}px "${el.fontFamily || 'Oswald'}", sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 12;
          ctx.fillText(el.text || 'HEADLINE', -pw / 2, 0);
        } else if (el.kind === 'image' && el.imageUrl) {
          let fgImg = imgCacheRef.current.get(el.imageUrl);
          if (!fgImg) {
            fgImg = new Image();
            fgImg.crossOrigin = 'anonymous';
            fgImg.src = el.imageUrl;
            fgImg.onload = () => {
              if (canvasRef.current) renderArtboard(canvasRef.current, true);
            };
            imgCacheRef.current.set(el.imageUrl, fgImg);
          }
          if (fgImg.complete && fgImg.naturalWidth > 0) {
            ctx.drawImage(fgImg, -pw / 2, -ph / 2, pw, ph);
          }
        }

        if (includeSelectionOutline && el.id === selectedId) {
          ctx.strokeStyle = '#A78BFA';
          ctx.lineWidth = Math.max(2, W * 0.0025);
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(-pw / 2 - 6, -ph / 2 - 6, pw + 12, ph + 12);
          ctx.setLineDash([]);
        }

        ctx.restore();
      }
    },
    [design, selectedId]
  );

  useEffect(() => {
    if (canvasRef.current) {
      renderArtboard(canvasRef.current, true);
    }
  }, [renderArtboard]);

  const handleCanvasHitSelect = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    for (let i = design.elements.length - 1; i >= 0; i--) {
      const el = design.elements[i];
      if (
        clickX >= el.x &&
        clickX <= el.x + el.width &&
        clickY >= el.y &&
        clickY <= el.y + el.height
      ) {
        setSelectedId(el.id);
        return;
      }
    }
  };

  const addElement = (kind: GraphicElement['kind']) => {
    const id = `gel_${Date.now()}`;
    const base: GraphicElement =
      kind === 'text'
        ? {
            id,
            kind: 'text',
            name: 'Display Title',
            x: 15,
            y: 40,
            width: 60,
            height: 15,
            rotation: 0,
            opacity: 1,
            fill: '#FFFFFF',
            text: 'CREATE WITHOUT LIMITS',
            fontFamily: 'Oswald',
            fontSize: 56,
            fontWeight: 700,
          }
        : kind === 'badge'
          ? {
              id,
              kind: 'badge',
              name: 'Accent Label',
              x: 15,
              y: 25,
              width: 26,
              height: 8,
              rotation: 0,
              opacity: 1,
              fill: '#7C3AED',
              borderRadius: 10,
              text: 'EDIT X EXCLUSIVE',
              fontFamily: 'Outfit',
              fontSize: 22,
              fontWeight: 700,
            }
          : kind === 'circle'
            ? {
                id,
                kind: 'circle',
                name: 'Accent Circle',
                x: 68,
                y: 20,
                width: 20,
                height: 32,
                rotation: 0,
                opacity: 0.85,
                fill: '#8B5CF6',
              }
            : {
                id,
                kind: 'rect',
                name: 'Card Frame',
                x: 12,
                y: 20,
                width: 45,
                height: 35,
                rotation: 0,
                opacity: 0.9,
                fill: '#12121A',
                strokeColor: '#8B5CF6',
                strokeWidth: 3,
                borderRadius: 18,
              };

    commitDesign({ ...design, elements: [...design.elements, base] });
    setSelectedId(id);
  };

  const updateSelected = (patch: Partial<GraphicElement>) => {
    if (!selectedId) return;
    commitDesign({
      ...design,
      elements: design.elements.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)),
    });
  };

  const reorderSelected = (dir: -1 | 1) => {
    if (!selectedId) return;
    const idx = design.elements.findIndex((e) => e.id === selectedId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= design.elements.length) return;
    const copy = [...design.elements];
    const [item] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, item);
    commitDesign({ ...design, elements: copy });
  };

  const exportArtboard = (format: 'png' | 'jpg' | 'pdf') => {
    const out = document.createElement('canvas');
    renderArtboard(out, false);

    if (format === 'pdf') {
      const jpegUrl = out.toDataURL('image/jpeg', 0.95);
      const pdfBlob = buildPdfFromJpegDataUrl(jpegUrl, design.width, design.height);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = out.toDataURL(mime, 0.96);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${projectName.replace(/\s+/g, '_')}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#09090D] text-[#F8FAFC] flex flex-col">
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
          <h1 className="font-display text-sm font-semibold text-white truncate max-w-[200px]">
            {projectName}
          </h1>
          <span className="hidden md:inline font-mono text-xs text-slate-400 tabular-nums">
            {design.presetName} · {design.width}×{design.height}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportArtboard('png')}
            className="px-3 py-1.5 min-h-[38px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white whitespace-nowrap"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={() => exportArtboard('jpg')}
            className="px-3 py-1.5 min-h-[38px] rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white whitespace-nowrap"
          >
            JPG
          </button>
          <button
            type="button"
            onClick={() => exportArtboard('pdf')}
            className="px-3.5 py-2 min-h-[38px] rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* Left Presets & Shape Elements */}
        <aside className="lg:col-span-3 bg-[#0E0E15] border-b lg:border-b-0 lg:border-r border-white/[0.08] p-4 space-y-5 overflow-y-auto">
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-200">Social & Print Sizes</span>
            <div className="space-y-1.5">
              {ARTBOARD_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() =>
                    commitDesign({
                      ...design,
                      presetName: p.name,
                      width: p.width,
                      height: p.height,
                    })
                  }
                  className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between text-xs ${
                    design.presetName === p.name
                      ? 'bg-violet-600/20 border-violet-500 text-white'
                      : 'bg-[#14141F] border-white/[0.06] text-slate-300 hover:text-white'
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                    {p.width}×{p.height}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-200">Insert Design Layer</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => addElement('text')}
                className="p-2.5 min-h-[40px] rounded-lg bg-[#14141F] hover:bg-[#1C1C2B] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-2"
              >
                <TypeIcon className="w-4 h-4 text-violet-400" />
                <span>Typography</span>
              </button>
              <button
                type="button"
                onClick={() => addElement('badge')}
                className="p-2.5 min-h-[40px] rounded-lg bg-[#14141F] hover:bg-[#1C1C2B] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-2"
              >
                <Tag className="w-4 h-4 text-violet-400" />
                <span>Label Tag</span>
              </button>
              <button
                type="button"
                onClick={() => addElement('rect')}
                className="p-2.5 min-h-[40px] rounded-lg bg-[#14141F] hover:bg-[#1C1C2B] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-2"
              >
                <Square className="w-4 h-4 text-violet-400" />
                <span>Rectangle</span>
              </button>
              <button
                type="button"
                onClick={() => addElement('circle')}
                className="p-2.5 min-h-[40px] rounded-lg bg-[#14141F] hover:bg-[#1C1C2B] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-2"
              >
                <Circle className="w-4 h-4 text-violet-400" />
                <span>Circle</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileUploadRef.current?.click()}
              className="w-full py-2 min-h-[40px] rounded-lg bg-violet-600/20 hover:bg-violet-600 text-violet-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Place Custom Image / Logo</span>
            </button>
            <input
              ref={fileUploadRef}
              type="file"
              accept="image/*"
              aria-label="Place custom image onto artboard"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = URL.createObjectURL(f);
                const id = `gel_img_${Date.now()}`;
                commitDesign({
                  ...design,
                  elements: [
                    ...design.elements,
                    {
                      id,
                      kind: 'image',
                      name: f.name,
                      x: 25,
                      y: 25,
                      width: 40,
                      height: 40,
                      rotation: 0,
                      opacity: 1,
                      fill: '#FFFFFF',
                      imageUrl: url,
                    },
                  ],
                });
                setSelectedId(id);
                e.target.value = '';
              }}
            />
          </div>

          {/* Artboard Backdrop Designer */}
          <div className="space-y-2 pt-2 border-t border-white/[0.08]">
            <span className="block text-xs font-semibold text-slate-200">Canvas Backdrop</span>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {(['solid', 'gradient', 'image'] as const).map((bgt) => (
                <button
                  key={bgt}
                  type="button"
                  onClick={() => commitDesign({ ...design, backgroundType: bgt })}
                  className={`py-1.5 rounded capitalize ${
                    design.backgroundType === bgt
                      ? 'bg-violet-600 text-white'
                      : 'bg-[#14141F] text-slate-300'
                  }`}
                >
                  {bgt}
                </button>
              ))}
            </div>
            {design.backgroundType !== 'image' ? (
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="color"
                  aria-label="Primary backdrop color"
                  value={design.backgroundPrimary}
                  onChange={(e) =>
                    commitDesign({ ...design, backgroundPrimary: e.target.value })
                  }
                  className="w-9 h-9 rounded cursor-pointer bg-transparent"
                />
                {design.backgroundType === 'gradient' && (
                  <input
                    type="color"
                    aria-label="Secondary gradient color"
                    value={design.backgroundSecondary}
                    onChange={(e) =>
                      commitDesign({ ...design, backgroundSecondary: e.target.value })
                    }
                    className="w-9 h-9 rounded cursor-pointer bg-transparent"
                  />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[
                  STUDIO_MEDIA_ASSETS.techStudio,
                  STUDIO_MEDIA_ASSETS.football,
                  STUDIO_MEDIA_ASSETS.cinematic,
                ].map((bgUrl, idx) => (
                  <button
                    key={bgUrl}
                    type="button"
                    aria-label={`Select backdrop photo ${idx + 1}`}
                    onClick={() => commitDesign({ ...design, backgroundImage: bgUrl })}
                    className="h-12 rounded overflow-hidden border border-white/[0.15]"
                  >
                    <img
                      src={bgUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Center Artboard Canvas */}
        <section className="lg:col-span-5 bg-[#09090D] p-5 flex items-center justify-center min-h-[320px]">
          <canvas
            ref={canvasRef}
            data-testid="graphic-design-canvas"
            onClick={handleCanvasHitSelect}
            className="max-w-full max-h-[68vh] rounded-lg border border-white/[0.12] shadow-2xl cursor-pointer object-contain"
          />
        </section>

        {/* Right Layer & Alignment Inspector */}
        <aside className="lg:col-span-4 bg-[#0E0E15] border-t lg:border-t-0 lg:border-l border-white/[0.08] p-4 space-y-4 overflow-y-auto text-xs">
          <h2 className="font-display text-sm font-semibold text-white">
            Alignment & Layer Properties
          </h2>

          {selectedEl ? (
            <div className="space-y-3.5">
              {/* Quick Alignment Bar */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Align element left"
                  onClick={() => updateSelected({ x: 5 })}
                  className="p-2 min-h-[36px] rounded bg-[#14141F] hover:bg-white/[0.1] text-slate-200"
                >
                  <AlignLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Center element horizontally"
                  onClick={() => updateSelected({ x: 50 - selectedEl.width / 2 })}
                  className="p-2 min-h-[36px] rounded bg-[#14141F] hover:bg-white/[0.1] text-slate-200"
                >
                  <AlignCenter className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Align element right"
                  onClick={() => updateSelected({ x: 95 - selectedEl.width })}
                  className="p-2 min-h-[36px] rounded bg-[#14141F] hover:bg-white/[0.1] text-slate-200"
                >
                  <AlignRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Bring layer forward"
                  onClick={() => reorderSelected(1)}
                  className="p-2 min-h-[36px] rounded bg-[#14141F] hover:bg-white/[0.1] text-slate-200"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Send layer backward"
                  onClick={() => reorderSelected(-1)}
                  className="p-2 min-h-[36px] rounded bg-[#14141F] hover:bg-white/[0.1] text-slate-200"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Duplicate selected element"
                  onClick={() => {
                    const copy = {
                      ...selectedEl,
                      id: `gel_dup_${Date.now()}`,
                      x: Math.min(85, selectedEl.x + 4),
                      y: Math.min(85, selectedEl.y + 4),
                    };
                    commitDesign({ ...design, elements: [...design.elements, copy] });
                    setSelectedId(copy.id);
                  }}
                  className="p-2 min-h-[36px] rounded bg-[#14141F] hover:bg-white/[0.1] text-slate-200"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Delete selected element"
                  onClick={() => {
                    const rem = design.elements.filter((e) => e.id !== selectedEl.id);
                    commitDesign({ ...design, elements: rem });
                    setSelectedId(rem[rem.length - 1]?.id || null);
                  }}
                  className="p-2 min-h-[36px] rounded bg-[#14141F] hover:bg-red-500/20 text-slate-300 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {(selectedEl.kind === 'text' || selectedEl.kind === 'badge') && (
                <div className="space-y-2">
                  <label htmlFor="gel-text-input" className="text-slate-300">
                    Copy Text
                  </label>
                  <input
                    id="gel-text-input"
                    type="text"
                    value={selectedEl.text || ''}
                    onChange={(e) => updateSelected({ text: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#14141F] border border-white/[0.1] text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Typography font family"
                      value={selectedEl.fontFamily || 'Oswald'}
                      onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                      className="px-2.5 py-2 rounded-lg bg-[#14141F] border border-white/[0.1] text-white"
                    >
                      <option value="Oswald">Oswald Bold</option>
                      <option value="Outfit">Outfit Geometric</option>
                      <option value="Playfair Display">Playfair Editorial</option>
                      <option value="Cinzel">Cinzel Luxury</option>
                      <option value="JetBrains Mono">JetBrains Mono</option>
                    </select>
                    <input
                      type="number"
                      aria-label="Font size in pixels"
                      min={14}
                      max={160}
                      value={selectedEl.fontSize || 48}
                      onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                      className="px-2.5 py-2 rounded-lg bg-[#14141F] border border-white/[0.1] text-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-slate-300">Fill Color</span>
                <input
                  type="color"
                  aria-label="Element fill color"
                  value={selectedEl.fill}
                  onChange={(e) => updateSelected({ fill: e.target.value })}
                  className="w-8 h-8 rounded bg-transparent cursor-pointer"
                />
              </div>

              {(
                [
                  { label: 'Horizontal X (%)', key: 'x', min: 0, max: 95 },
                  { label: 'Vertical Y (%)', key: 'y', min: 0, max: 95 },
                  { label: 'Width (%)', key: 'width', min: 5, max: 100 },
                  { label: 'Height (%)', key: 'height', min: 5, max: 100 },
                  { label: 'Rotation (°)', key: 'rotation', min: -180, max: 180 },
                ] as const
              ).map((prop) => (
                <div key={prop.key} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{prop.label}</span>
                    <span className="font-mono text-slate-200 tabular-nums">
                      {Math.round(selectedEl[prop.key])}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={prop.label}
                    min={prop.min}
                    max={prop.max}
                    value={selectedEl[prop.key]}
                    onChange={(e) => updateSelected({ [prop.key]: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">Select a layer below to edit geometry and style.</p>
          )}

          {/* Layer Stack List */}
          <div className="pt-3 border-t border-white/[0.08] space-y-1.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Artboard Layers ({design.elements.length})
            </span>
            {[...design.elements].reverse().map((el) => (
              <button
                key={el.id}
                type="button"
                onClick={() => setSelectedId(el.id)}
                className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between ${
                  el.id === selectedId
                    ? 'bg-violet-600/20 border-violet-500 text-white'
                    : 'bg-[#14141F] border-white/[0.06] text-slate-300'
                }`}
              >
                <span className="truncate">{el.text || el.name}</span>
                <span className="text-[10px] text-slate-400 uppercase font-mono">{el.kind}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
