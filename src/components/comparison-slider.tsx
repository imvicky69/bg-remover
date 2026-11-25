"use client";

import React, { useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";

interface ComparisonSliderProps {
  beforeUrl: string;
  afterUrl: string;
  aspectStyle?: string;
}

export function ComparisonSlider({
  beforeUrl,
  afterUrl,
  aspectStyle,
}: ComparisonSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updatePosition = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        updatePosition(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging) updatePosition(e.clientX);
      }}
      onPointerUp={(e) => {
        setDragging(false);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // noop
        }
      }}
      className="relative w-full h-full max-w-full max-h-full rounded-xl overflow-hidden select-none touch-none cursor-ew-resize flex items-center justify-center"
      style={{
        aspectRatio: aspectStyle,
        backgroundImage: "repeating-conic-gradient(#E5E5DF 0% 25%, #F6F6F2 0% 50%)",
        backgroundSize: "16px 16px",
      }}
    >
      {/* After (cutout) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterUrl}
        alt="Cutout result"
        className="w-full h-full object-contain p-2 pointer-events-none select-none"
        draggable={false}
      />

      {/* Before (original) clipped to position% */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <div className="w-full h-full bg-[#F4F3EC] flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeUrl}
            alt="Original image"
            className="w-full h-full object-contain p-2 pointer-events-none select-none"
            draggable={false}
          />
        </div>
      </div>

      {/* Divider Line & Handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-carbon/80 pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-carbon text-paper shadow-md border-2 border-signal-lime flex items-center justify-center">
          <MoveHorizontal className="h-4 w-4" />
        </div>
      </div>

      {/* Labels */}
      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-carbon/75 text-paper text-[10px] font-semibold pointer-events-none">
        Original
      </span>
      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-carbon/75 text-signal-lime text-[10px] font-semibold pointer-events-none">
        Cutout
      </span>
    </div>
  );
}
