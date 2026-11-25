"use client";

import React, { useRef } from "react";
import { ImagePlus, Sparkles } from "lucide-react";

export type BackgroundMode = "transparent" | "color" | "gradient" | "blur" | "image";

export interface ColorPreset {
  name: string;
  value: string;
}

export interface GradientPreset {
  id: string;
  name: string;
  css: string;
  kind: "linear" | "radial";
  stops: { offset: number; color: string }[];
  cx?: number;
  cy?: number;
}

export const SOLID_COLOR_PRESETS: ColorPreset[] = [
  { name: "White", value: "#FFFFFF" },
  { name: "Xweet Paper", value: "#F0EFE6" },
  { name: "Signal Lime", value: "#D7F36A" },
  { name: "Carbon", value: "#171815" },
  { name: "Charcoal", value: "#2A2B26" },
  { name: "Mist Lavender", value: "#B7A7D9" },
  { name: "Terrain", value: "#858779" },
  { name: "Cobalt", value: "#2563EB" },
  { name: "Sky", value: "#38BDF8" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Coral", value: "#EF4444" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Emerald", value: "#10B981" },
  { name: "Pastel Rose", value: "#FFE4E6" },
  { name: "Pastel Mint", value: "#DCFCE7" },
  { name: "Pastel Sky", value: "#E0F2FE" },
];

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: "xweet-lime",
    name: "Xweet Lime",
    css: "linear-gradient(135deg, #F0EFE6 0%, #D7F36A 100%)",
    kind: "linear",
    stops: [
      { offset: 0, color: "#F0EFE6" },
      { offset: 1, color: "#D7F36A" },
    ],
  },
  {
    id: "studio-carbon",
    name: "Studio Carbon",
    css: "linear-gradient(135deg, #171815 0%, #3A3C35 100%)",
    kind: "linear",
    stops: [
      { offset: 0, color: "#171815" },
      { offset: 1, color: "#3A3C35" },
    ],
  },
  {
    id: "mist-glow",
    name: "Mist Glow",
    css: "linear-gradient(135deg, #B7A7D9 0%, #F0EFE6 100%)",
    kind: "linear",
    stops: [
      { offset: 0, color: "#B7A7D9" },
      { offset: 1, color: "#F0EFE6" },
    ],
  },
  {
    id: "sunset-glow",
    name: "Sunset",
    css: "linear-gradient(135deg, #FF6B6B 0%, #FFA07A 50%, #FFE66D 100%)",
    kind: "linear",
    stops: [
      { offset: 0, color: "#FF6B6B" },
      { offset: 0.5, color: "#FFA07A" },
      { offset: 1, color: "#FFE66D" },
    ],
  },
  {
    id: "cosmic-purple",
    name: "Cosmic",
    css: "linear-gradient(135deg, #667EEA 0%, #764BA2 100%)",
    kind: "linear",
    stops: [
      { offset: 0, color: "#667EEA" },
      { offset: 1, color: "#764BA2" },
    ],
  },
  {
    id: "ocean-breeze",
    name: "Ocean",
    css: "linear-gradient(135deg, #2AF598 0%, #009EFD 100%)",
    kind: "linear",
    stops: [
      { offset: 0, color: "#2AF598" },
      { offset: 1, color: "#009EFD" },
    ],
  },
  {
    id: "warm-clean",
    name: "Clean Gray",
    css: "linear-gradient(135deg, #FDFBFB 0%, #E5E7EB 100%)",
    kind: "linear",
    stops: [
      { offset: 0, color: "#FDFBFB" },
      { offset: 1, color: "#E5E7EB" },
    ],
  },
  {
    id: "radial-spot",
    name: "Spotlight",
    css: "radial-gradient(circle at 50% 45%, #3F3F46 0%, #171815 100%)",
    kind: "radial",
    cx: 0.5,
    cy: 0.45,
    stops: [
      { offset: 0, color: "#3F3F46" },
      { offset: 1, color: "#171815" },
    ],
  },
];

interface BackgroundCustomizerProps {
  bgMode: BackgroundMode;
  onBgModeChange: (mode: BackgroundMode) => void;
  selectedColor: string;
  onColorChange: (color: string) => void;
  customColor: string;
  onCustomColorChange: (color: string) => void;
  selectedGradient: GradientPreset;
  onGradientChange: (grad: GradientPreset) => void;
  blurAmount: number;
  onBlurAmountChange: (val: number) => void;
  customBgUrl: string | null;
  onCustomBgUpload: (file: File) => void;
}

export function BackgroundCustomizer({
  bgMode,
  onBgModeChange,
  selectedColor,
  onColorChange,
  customColor,
  onCustomColorChange,
  selectedGradient,
  onGradientChange,
  blurAmount,
  onBlurAmountChange,
  customBgUrl,
  onCustomBgUpload,
}: BackgroundCustomizerProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const tabs: { id: BackgroundMode; label: string }[] = [
    { id: "transparent", label: "Transparent" },
    { id: "color", label: "Solid Color" },
    { id: "gradient", label: "Gradient" },
    { id: "blur", label: "Blur Original" },
    { id: "image", label: "Custom Photo" },
  ];

  return (
    <div className="rounded-2xl border border-[#E4E2D7] bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-carbon">
          Background
        </span>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => {
            const active = bgMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onBgModeChange(tab.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? "bg-carbon text-signal-lime"
                    : "bg-paper text-carbon hover:bg-[#E4E2D7]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {bgMode === "transparent" && (
        <p className="text-xs text-terrain">
          Export with full alpha transparency (best with PNG or WEBP).
        </p>
      )}

      {bgMode === "color" && (
        <div className="flex flex-wrap items-center gap-2">
          {SOLID_COLOR_PRESETS.map((preset) => {
            const active = selectedColor.toLowerCase() === preset.value.toLowerCase();
            return (
              <button
                key={preset.value}
                type="button"
                title={preset.name}
                onClick={() => onColorChange(preset.value)}
                className={`h-8 w-8 rounded-full border transition-transform cursor-pointer ${
                  active
                    ? "ring-2 ring-carbon ring-offset-2 scale-105 border-carbon"
                    : "border-[#D6D4C9] hover:scale-105"
                }`}
                style={{ backgroundColor: preset.value }}
              />
            );
          })}

          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            className="h-8 px-3 rounded-full border border-[#D6D4C9] bg-paper text-xs font-semibold text-carbon hover:border-carbon flex items-center gap-1.5 cursor-pointer"
          >
            <span
              className="h-3.5 w-3.5 rounded-full border border-carbon/20"
              style={{ backgroundColor: customColor }}
            />
            Custom
            <input
              ref={colorInputRef}
              type="color"
              value={customColor}
              onChange={(e) => onCustomColorChange(e.target.value)}
              className="sr-only"
            />
          </button>
        </div>
      )}

      {bgMode === "gradient" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {GRADIENT_PRESETS.map((grad) => {
            const active = selectedGradient.id === grad.id;
            return (
              <button
                key={grad.id}
                type="button"
                onClick={() => onGradientChange(grad)}
                className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? "border-carbon bg-paper ring-1 ring-carbon"
                    : "border-[#E4E2D7] hover:border-terrain"
                }`}
              >
                <span
                  className="h-7 w-7 rounded-lg shrink-0 border border-black/10"
                  style={{ background: grad.css }}
                />
                <span className="text-xs font-semibold text-carbon truncate">{grad.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {bgMode === "blur" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-carbon shrink-0">
            <Sparkles className="h-4 w-4 text-terrain" />
            <span>Portrait Bokeh Blur</span>
          </div>
          <input
            type="range"
            min="4"
            max="40"
            step="2"
            value={blurAmount}
            onChange={(e) => onBlurAmountChange(Number(e.target.value))}
            className="flex-1 accent-carbon h-1.5 bg-[#E4E2D7] rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-terrain w-12 text-right">{blurAmount}px</span>
        </div>
      )}

      {bgMode === "image" && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={bgFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCustomBgUpload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => bgFileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-carbon bg-paper px-4 py-2 text-xs font-semibold text-carbon hover:bg-signal-lime transition-colors cursor-pointer"
          >
            <ImagePlus className="h-4 w-4" />
            {customBgUrl ? "Change Background Photo" : "Upload Background Photo"}
          </button>
          {customBgUrl && (
            <span className="text-xs text-emerald-700 font-medium">
              Custom backdrop active ✓
            </span>
          )}
        </div>
      )}
    </div>
  );
}
