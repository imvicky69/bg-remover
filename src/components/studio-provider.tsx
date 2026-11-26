"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { convertHeicToJpeg, downscaleImageIfNeeded } from "@/lib/image-utils";
import type { BackendKind } from "@/app/worker";

export type StudioStage = "idle" | "busy" | "done" | "error";

type WorkerMsg =
  | { type: "progress"; text: string; value: number }
  | { type: "ready"; backend: BackendKind; cached: boolean }
  | {
      type: "done";
      mask: ArrayBuffer;
      width: number;
      height: number;
      backend: BackendKind;
      cached: boolean;
    }
  | { type: "error"; message: string };

interface StudioContextValue {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  stage: StudioStage;
  progress: { text: string; value: number };
  sourceUrl: string | null;
  originalResultUrl: string | null;
  resultUrl: string | null;
  fileName: string;
  fileSize: number;
  imageDims: { width: number; height: number };
  errorMsg: string;
  maxResolution: 2048 | 0;
  setMaxResolution: (res: 2048 | 0) => void;
  offlineReady: boolean;
  passportBgColor: string;
  setPassportBgColor: (color: string) => void;
  processFile: (file: File) => Promise<void>;
  reset: () => void;
  applyMaskEditUrl: (newUrl: string) => void;
  restoreOriginalCutout: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const [stage, setStage] = useState<StudioStage>("idle");
  const [progress, setProgress] = useState({ text: "", value: 0 });
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [originalResultUrl, setOriginalResultUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const [maxResolution, setMaxResolution] = useState<2048 | 0>(2048);
  const [offlineReady, setOfflineReady] = useState(false);
  const [passportBgColor, setPassportBgColor] = useState("#F4F6F9");

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("xweet-bg-offline-ready") === "1") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setOfflineReady(true);
        }
      } catch {
        // noop
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }

    const worker = new Worker(new URL("../app/worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      if (e.data.type === "ready") {
        setOfflineReady(true);
        try {
          localStorage.setItem("xweet-bg-offline-ready", "1");
        } catch {
          // noop
        }
      }
    };
    worker.postMessage({ type: "warmup" });
    return () => {
      worker.terminate();
    };
  }, []);

  const reset = useCallback(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (originalResultUrl) URL.revokeObjectURL(originalResultUrl);
    if (resultUrl && resultUrl !== originalResultUrl) URL.revokeObjectURL(resultUrl);

    setSourceUrl(null);
    setOriginalResultUrl(null);
    setResultUrl(null);
    setFileName("");
    setFileSize(0);
    setImageDims({ width: 0, height: 0 });
    setStage("idle");
    setProgress({ text: "", value: 0 });
    setErrorMsg("");
  }, [sourceUrl, originalResultUrl, resultUrl]);

  const processFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const ACCEPTED = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp", "tiff", "avif"];
      const validType = file.type.startsWith("image/") || ACCEPTED.includes(ext);
      if (!validType) {
        setErrorMsg("Please choose a valid image (JPG, PNG, WEBP, HEIC, AVIF, GIF…).");
        setStage("error");
        return;
      }

      reset();
      setFileName(file.name);
      setFileSize(file.size);

      let processable = file;
      const isHeic =
        ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";

      if (isHeic) {
        setStage("busy");
        setProgress({ text: "Converting HEIC photo…", value: 6 });
        try {
          processable = await convertHeicToJpeg(file);
        } catch {
          setErrorMsg("Could not decode this HEIC file. Please export it as JPG and try again.");
          setStage("error");
          return;
        }
      }

      if (maxResolution > 0) {
        processable = await downscaleImageIfNeeded(processable, maxResolution);
      }

      const src = URL.createObjectURL(processable);
      setSourceUrl(src);
      setStage("busy");
      setProgress({ text: "Starting on-device AI…", value: isHeic ? 12 : 3 });

      const worker = workerRef.current!;
      worker.onmessage = async (e: MessageEvent<WorkerMsg>) => {
        const msg = e.data;
        if (msg.type === "progress") {
          setProgress({ text: msg.text, value: msg.value });
        } else if (msg.type === "done") {
          setProgress({ text: "Done!", value: 100 });
          setOfflineReady(true);
          try {
            localStorage.setItem("xweet-bg-offline-ready", "1");
          } catch {
            // noop
          }

          const canvas = canvasRef.current!;
          canvas.width = msg.width;
          canvas.height = msg.height;
          setImageDims({ width: msg.width, height: msg.height });
          const ctx = canvas.getContext("2d")!;

          const bmp = await createImageBitmap(processable);
          ctx.drawImage(bmp, 0, 0, msg.width, msg.height);
          bmp.close();

          const imgData = ctx.getImageData(0, 0, msg.width, msg.height);
          const mask = new Uint8Array(msg.mask);
          for (let i = 0; i < mask.length; i++) {
            imgData.data[4 * i + 3] = mask[i];
          }
          ctx.putImageData(imgData, 0, 0);

          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), "image/png")
          );
          const url = URL.createObjectURL(blob);
          setOriginalResultUrl(url);
          setResultUrl(url);
          setTimeout(() => setStage("done"), 200);
        } else if (msg.type === "error") {
          setErrorMsg(msg.message);
          setStage("error");
        }
      };

      worker.onerror = (err) => {
        setErrorMsg(err.message || "Worker execution error.");
        setStage("error");
      };

      const buf = await processable.arrayBuffer();
      worker.postMessage({ type: "process", imageBuffer: buf }, [buf]);
    },
    [reset, maxResolution]
  );

  // Global Ctrl+V / Cmd+V paste support
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (stage === "busy") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            processFile(
              new File([file], `pasted-${Date.now()}.png`, { type: file.type || "image/png" })
            );
            break;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage, processFile]);

  const applyMaskEditUrl = useCallback(
    (newUrl: string) => {
      if (resultUrl && resultUrl !== originalResultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
      const img = new window.Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setResultUrl(newUrl);
      };
      img.src = newUrl;
    },
    [resultUrl, originalResultUrl]
  );

  const restoreOriginalCutout = useCallback(() => {
    if (!originalResultUrl) return;
    if (resultUrl && resultUrl !== originalResultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    const img = new window.Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setResultUrl(originalResultUrl);
    };
    img.src = originalResultUrl;
  }, [originalResultUrl, resultUrl]);

  return (
    <StudioContext.Provider
      value={{
        canvasRef,
        stage,
        progress,
        sourceUrl,
        originalResultUrl,
        resultUrl,
        fileName,
        fileSize,
        imageDims,
        errorMsg,
        maxResolution,
        setMaxResolution,
        offlineReady,
        passportBgColor,
        setPassportBgColor,
        processFile,
        reset,
        applyMaskEditUrl,
        restoreOriginalCutout,
      }}
    >
      <canvas ref={canvasRef} className="hidden" />
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error("useStudio must be used within StudioProvider");
  }
  return ctx;
}
