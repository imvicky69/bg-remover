"use client";

import React from "react";

export interface AspectRatioOption {
  id: string;
  name: string;
  ratio: number | "original";
  label: string;
  desc: string;
  cssAspect: string;
}

export const ASPECT_RATIO_PRESETS: AspectRatioOption[] = [
  { id: "original", name: "Original", ratio: "original", label: "Auto", desc: "Original dimensions", cssAspect: "auto" },
  { id: "1:1", name: "1:1", ratio: 1, label: "Square", desc: "Avatar / Product", cssAspect: "1 / 1" },
  { id: "9:16", name: "9:16", ratio: 9 / 16, label: "Story", desc: "Reels / Shorts / TikTok", cssAspect: "9 / 16" },
  { id: "4:5", name: "4:5", ratio: 4 / 5, label: "Portrait", desc: "Instagram Feed", cssAspect: "4 / 5" },
  { id: "16:9", name: "16:9", ratio: 16 / 9, label: "Wide", desc: "YouTube / Banner", cssAspect: "16 / 9" },
  { id: "4:3", name: "4:3", ratio: 4 / 3, label: "Classic", desc: "Photo / Slides", cssAspect: "4 / 3" },
];

export function AspectRatioSelector({
  selectedRatio,
  onSelectRatio,
}: {
  selectedRatio: AspectRatioOption;
  onSelectRatio: (ratio: AspectRatioOption) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-carbon">
          Aspect Ratio
        </span>
        <span className="text-[11px] text-terrain">{selectedRatio.desc}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {ASPECT_RATIO_PRESETS.map((opt) => {
          const isSelected = selectedRatio.id === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectRatio(opt)}
              className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? "border-carbon bg-carbon text-paper shadow-xs"
                  : "border-[#E4E2D7] bg-white text-carbon hover:border-terrain hover:bg-paper/40"
              }`}
            >
              <span
                className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${
                  isSelected ? "border-paper/35 bg-paper/10" : "border-carbon/25 bg-paper"
                }`}
              >
                <span
                  className={`rounded-[1px] ${isSelected ? "bg-signal-lime" : "bg-carbon"}`}
                  style={{
                    width:
                      opt.id === "1:1"
                        ? "10px"
                        : opt.id === "9:16"
                        ? "6px"
                        : opt.id === "4:5"
                        ? "8px"
                        : opt.id === "16:9"
                        ? "14px"
                        : opt.id === "4:3"
                        ? "12px"
                        : "10px",
                    height:
                      opt.id === "1:1"
                        ? "10px"
                        : opt.id === "9:16"
                        ? "12px"
                        : opt.id === "4:5"
                        ? "11px"
                        : opt.id === "16:9"
                        ? "7px"
                        : opt.id === "4:3"
                        ? "9px"
                        : "10px",
                  }}
                />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">{opt.name}</p>
                <p className={`text-[10px] truncate ${isSelected ? "text-paper/70" : "text-terrain"}`}>
                  {opt.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
