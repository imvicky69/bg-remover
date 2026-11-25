"use client";

import React from "react";
import { FlipHorizontal2, ArrowDownToLine, RotateCcw } from "lucide-react";

interface TransformToolbarProps {
  scale: number;
  onScaleChange: (newScale: number) => void;
  flipH: boolean;
  onToggleFlip: () => void;
  onSnapBottom: () => void;
  onReset: () => void;
  hasTransformChanges: boolean;
  dropShadow: boolean;
  onToggleShadow: () => void;
  edgeFeather: number;
  onEdgeFeatherChange: (val: number) => void;
}

export function TransformToolbar({
  scale,
  onScaleChange,
  flipH,
  onToggleFlip,
  onSnapBottom,
  onReset,
  hasTransformChanges,
  dropShadow,
  onToggleShadow,
  edgeFeather,
  onEdgeFeatherChange,
}: TransformToolbarProps) {
  return (
    <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Scale */}
        <div className="flex items-center gap-3 min-w-[220px] flex-1">
          <span className="text-xs font-bold uppercase tracking-wider text-carbon shrink-0">
            Scale
          </span>
          <button
            type="button"
            onClick={() => onScaleChange(Math.max(0.2, Number((scale - 0.1).toFixed(2))))}
            className="h-7 w-7 rounded-lg border border-[#E4E2D7] bg-paper text-xs font-bold hover:bg-[#E4E2D7] cursor-pointer"
          >
            −
          </button>
          <input
            type="range"
            min="0.3"
            max="2.5"
            step="0.05"
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="flex-1 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
          />
          <button
            type="button"
            onClick={() => onScaleChange(Math.min(3, Number((scale + 0.1).toFixed(2))))}
            className="h-7 w-7 rounded-lg border border-[#E4E2D7] bg-paper text-xs font-bold hover:bg-[#E4E2D7] cursor-pointer"
          >
            +
          </button>
          <span className="text-xs font-mono text-terrain w-11 text-right">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleFlip}
            className={`h-8 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
              flipH
                ? "border-carbon bg-carbon text-signal-lime"
                : "border-[#E4E2D7] bg-white text-carbon hover:bg-paper"
            }`}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" />
            Flip
          </button>

          <button
            type="button"
            onClick={onSnapBottom}
            className="h-8 px-3 rounded-xl border border-[#E4E2D7] bg-white text-xs font-semibold text-carbon hover:bg-paper inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Snap Bottom
          </button>

          {hasTransformChanges && (
            <button
              type="button"
              onClick={onReset}
              className="h-8 px-3 rounded-xl border border-[#E4E2D7] bg-paper text-xs font-semibold text-carbon hover:bg-[#E4E2D7] inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Studio Polish: Drop Shadow + Edge Feather */}
      <div className="pt-3 border-t border-[#F0EFE6] flex flex-wrap items-center justify-between gap-4">
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dropShadow}
            onChange={onToggleShadow}
            className="h-4 w-4 accent-carbon rounded cursor-pointer"
          />
          <span className="text-xs font-semibold text-carbon">Studio Drop Shadow</span>
        </label>

        <div className="flex items-center gap-3 min-w-[210px]">
          <span className="text-xs font-semibold text-carbon shrink-0">Edge Smooth</span>
          <input
            type="range"
            min="0"
            max="3"
            step="0.5"
            value={edgeFeather}
            onChange={(e) => onEdgeFeatherChange(parseFloat(e.target.value))}
            className="flex-1 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-terrain w-10 text-right">{edgeFeather}px</span>
        </div>
      </div>
    </div>
  );
}
