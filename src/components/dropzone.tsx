"use client";

import React, { useRef, useState } from "react";
import { Upload, ClipboardPaste } from "lucide-react";

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  title?: string;
  subtitle?: string;
  hintBadge?: string;
}

export function DropZone({
  onFileSelected,
  title = "Drop your image here",
  subtitle,
  hintBadge,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (files && files[0]) {
      onFileSelected(files[0]);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`group relative rounded-3xl border-2 border-dashed p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
        isDragging
          ? "border-carbon bg-signal-lime/25 scale-[1.01] shadow-md"
          : "border-[#CFCBC0] bg-white/85 hover:border-carbon hover:bg-white shadow-xs"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E4E2D7] bg-paper text-carbon transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:bg-signal-lime">
        <Upload className="h-6 w-6" />
      </div>

      <p className="text-lg font-bold tracking-tight text-carbon">
        {title}
      </p>
      <p className="mt-1 text-sm text-terrain">
        {subtitle ? (
          subtitle
        ) : (
          <>
            or <span className="font-semibold text-carbon underline underline-offset-4">click to browse</span> from your device
          </>
        )}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-terrain">
        <span className="rounded-full border border-[#E4E2D7] bg-paper/70 px-2.5 py-0.5">
          {hintBadge ?? "JPG · PNG · WEBP · HEIC · AVIF"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#E4E2D7] bg-paper/70 px-2.5 py-0.5">
          <ClipboardPaste className="h-3 w-3" />
          Ctrl+V to paste
        </span>
      </div>
    </div>
  );
}
