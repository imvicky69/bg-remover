"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Eraser, Paintbrush, Hand, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

type ToolMode = "erase" | "restore" | "pan";

export interface MaskEditorHandle {
  exportPng: () => Promise<Blob | null>;
  undo: () => void;
}

interface MaskEditorProps {
  resultUrl: string;
  sourceUrl: string;
}

export const MaskEditorCanvas = forwardRef<MaskEditorHandle, MaskEditorProps>(
  function MaskEditorCanvas({ resultUrl, sourceUrl }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const workingCanvasRef = useRef<HTMLCanvasElement>(null);
    const sourceCanvasRef = useRef<HTMLCanvasElement>(null);

    const [toolMode, setToolMode] = useState<ToolMode>("erase");
    const [brushSize, setBrushSize] = useState(32);
    const [brushOpacity, setBrushOpacity] = useState(100);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isReady, setIsReady] = useState(false);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [spaceHeld, setSpaceHeld] = useState(false);

    const historyRef = useRef<ImageData[]>([]);
    const isPaintingRef = useRef(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);

    const syncDisplay = useCallback(() => {
      const wc = workingCanvasRef.current;
      const dc = displayCanvasRef.current;
      const container = containerRef.current;
      if (!wc || !dc || !container || wc.width === 0) return;

      const scale = Math.min(container.clientWidth / wc.width, container.clientHeight / wc.height);
      dc.width = Math.max(1, Math.round(wc.width * scale));
      dc.height = Math.max(1, Math.round(wc.height * scale));

      const dctx = dc.getContext("2d")!;
      dctx.clearRect(0, 0, dc.width, dc.height);
      dctx.drawImage(wc, 0, 0, dc.width, dc.height);
    }, []);

    useEffect(() => {
      setIsReady(false);
      historyRef.current = [];
      setZoom(1);
      setPan({ x: 0, y: 0 });

      const resultImg = new window.Image();
      const sourceImg = new window.Image();

      resultImg.onload = () => {
        const w = resultImg.naturalWidth;
        const h = resultImg.naturalHeight;

        const wc = workingCanvasRef.current!;
        wc.width = w;
        wc.height = h;
        const wctx = wc.getContext("2d")!;
        wctx.clearRect(0, 0, w, h);
        wctx.drawImage(resultImg, 0, 0);

        sourceImg.onload = () => {
          const sc = sourceCanvasRef.current!;
          sc.width = w;
          sc.height = h;
          const sctx = sc.getContext("2d")!;
          sctx.drawImage(sourceImg, 0, 0, w, h);
          syncDisplay();
          setIsReady(true);
        };
        sourceImg.onerror = () => {
          syncDisplay();
          setIsReady(true);
        };
        sourceImg.src = sourceUrl;
      };
      resultImg.src = resultUrl;
    }, [resultUrl, sourceUrl, syncDisplay]);

    useEffect(() => {
      const onResize = () => syncDisplay();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [syncDisplay]);

    // Spacebar temporary pan
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat) setSpaceHeld(true);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") setSpaceHeld(false);
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    }, []);

    // Non-passive wheel zoom inside editor container
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        setZoom((z) => Math.min(4, Math.max(1, Number((z * factor).toFixed(2)))));
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, []);

    useImperativeHandle(ref, () => ({
      exportPng: async () => {
        const wc = workingCanvasRef.current;
        if (!wc || wc.width === 0) return null;
        return new Promise<Blob | null>((res) => wc.toBlob((b) => res(b), "image/png"));
      },
      undo: () => {
        const wc = workingCanvasRef.current;
        if (!wc || historyRef.current.length === 0) return;
        const prev = historyRef.current.pop()!;
        wc.getContext("2d")!.putImageData(prev, 0, 0);
        syncDisplay();
      },
    }));

    const toWorkingCoords = (clientX: number, clientY: number) => {
      const dc = displayCanvasRef.current!;
      const wc = workingCanvasRef.current!;
      const rect = dc.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * wc.width,
        y: ((clientY - rect.top) / rect.height) * wc.height,
        scaleFactor: wc.width / rect.width,
      };
    };

    const paintSegment = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      radius: number
    ) => {
      const wc = workingCanvasRef.current!;
      const sc = sourceCanvasRef.current!;
      const wctx = wc.getContext("2d")!;
      const alpha = brushOpacity / 100;

      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const step = Math.max(1, radius * 0.25);
      const steps = Math.max(1, Math.ceil(dist / step));

      wctx.save();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;

        if (toolMode === "erase") {
          wctx.globalCompositeOperation = "destination-out";
          wctx.globalAlpha = alpha;
          wctx.beginPath();
          wctx.arc(x, y, radius, 0, Math.PI * 2);
          wctx.fill();
        } else if (toolMode === "restore") {
          wctx.save();
          wctx.globalCompositeOperation = "source-over";
          wctx.globalAlpha = alpha;
          wctx.beginPath();
          wctx.arc(x, y, radius, 0, Math.PI * 2);
          wctx.clip();
          wctx.drawImage(sc, 0, 0);
          wctx.restore();
        }
      }
      wctx.restore();
    };

    const effectivePan = toolMode === "pan" || spaceHeld;

    const handlePointerDown = (e: React.PointerEvent) => {
      if (!isReady) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      if (effectivePan || e.button === 1) {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        return;
      }

      const wc = workingCanvasRef.current!;
      const wctx = wc.getContext("2d")!;
      if (historyRef.current.length >= 15) historyRef.current.shift();
      historyRef.current.push(wctx.getImageData(0, 0, wc.width, wc.height));

      isPaintingRef.current = true;
      const pt = toWorkingCoords(e.clientX, e.clientY);
      lastPointRef.current = { x: pt.x, y: pt.y };
      paintSegment(pt, pt, (brushSize / 2) * pt.scaleFactor);
      syncDisplay();
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        setCursorPos({ x: e.clientX - containerRect.left, y: e.clientY - containerRect.top });
      }

      if (isPanningRef.current) {
        setPan({
          x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
          y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
        });
        return;
      }

      if (!isPaintingRef.current || !lastPointRef.current) return;
      const pt = toWorkingCoords(e.clientX, e.clientY);
      paintSegment(lastPointRef.current, pt, (brushSize / 2) * pt.scaleFactor);
      lastPointRef.current = { x: pt.x, y: pt.y };
      syncDisplay();
    };

    const handlePointerUp = () => {
      isPaintingRef.current = false;
      isPanningRef.current = false;
      lastPointRef.current = null;
    };

    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper p-3 border border-[#E4E2D7]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setToolMode("erase")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                toolMode === "erase"
                  ? "bg-carbon text-signal-lime"
                  : "bg-white text-carbon border border-[#E4E2D7]"
              }`}
            >
              <Eraser className="h-3.5 w-3.5" />
              Erase
            </button>
            <button
              type="button"
              onClick={() => setToolMode("restore")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                toolMode === "restore"
                  ? "bg-carbon text-signal-lime"
                  : "bg-white text-carbon border border-[#E4E2D7]"
              }`}
            >
              <Paintbrush className="h-3.5 w-3.5" />
              Restore
            </button>
            <button
              type="button"
              onClick={() => setToolMode("pan")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                toolMode === "pan"
                  ? "bg-carbon text-signal-lime"
                  : "bg-white text-carbon border border-[#E4E2D7]"
              }`}
              title="Pan canvas (or hold Space)"
            >
              <Hand className="h-3.5 w-3.5" />
              Pan
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2">
              <span className="font-semibold text-carbon">Size</span>
              <input
                type="range"
                min={4}
                max={120}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-20 accent-carbon cursor-pointer"
              />
              <span className="font-mono text-terrain w-8">{brushSize}px</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="font-semibold text-carbon">Strength</span>
              <input
                type="range"
                min={10}
                max={100}
                value={brushOpacity}
                onChange={(e) => setBrushOpacity(Number(e.target.value))}
                className="w-16 accent-carbon cursor-pointer"
              />
              <span className="font-mono text-terrain w-8">{brushOpacity}%</span>
            </label>

            {/* Zoom controls */}
            <div className="flex items-center gap-1 border-l border-[#D6D4C9] pl-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))}
                className="h-7 w-7 rounded-lg border border-[#E4E2D7] bg-white flex items-center justify-center hover:bg-[#E4E2D7] cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-terrain w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))))}
                className="h-7 w-7 rounded-lg border border-[#E4E2D7] bg-white flex items-center justify-center hover:bg-[#E4E2D7] cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {(zoom > 1 || pan.x !== 0 || pan.y !== 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="h-7 px-2 rounded-lg border border-[#E4E2D7] bg-white text-[11px] font-semibold flex items-center gap-1 hover:bg-[#E4E2D7] cursor-pointer"
                  title="Reset view"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setCursorPos(null);
            handlePointerUp();
          }}
          className={`relative h-[330px] sm:h-[360px] w-full rounded-xl border border-[#E4E2D7] flex items-center justify-center overflow-hidden touch-none ${
            effectivePan ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
          }`}
          style={{
            backgroundImage: "repeating-conic-gradient(#E5E5DF 0% 25%, #F6F6F2 0% 50%)",
            backgroundSize: "16px 16px",
          }}
        >
          <canvas ref={workingCanvasRef} className="hidden" />
          <canvas ref={sourceCanvasRef} className="hidden" />

          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            <canvas ref={displayCanvasRef} className="block pointer-events-none" />
          </div>

          {cursorPos && !effectivePan && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-carbon shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
              style={{
                width: brushSize * zoom,
                height: brushSize * zoom,
                left: cursorPos.x - (brushSize * zoom) / 2,
                top: cursorPos.y - (brushSize * zoom) / 2,
              }}
            />
          )}

          <span className="pointer-events-none absolute bottom-2 right-2.5 rounded-full bg-carbon/70 px-2.5 py-0.5 text-[10px] font-mono text-paper">
            Scroll to zoom · Space+drag to pan
          </span>
        </div>
      </div>
    );
  }
);
