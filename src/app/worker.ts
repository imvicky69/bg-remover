/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Web Worker: runs quantized (q8) BRIA RMBG-1.4 inference off the main thread.
 * - Uses dtype: "q8" (~44 MB vs ~176 MB fp32) for 4x faster first-time download.
 * - Supports background "warmup" on page load so the model is ready before the user drops an image.
 * - Automatically uses WebGPU when available, falling back to WASM.
 */

export type BackendKind = "webgpu" | "wasm";

type InMsg =
  | { type: "warmup" }
  | { type: "process"; imageBuffer: ArrayBuffer };

type OutMsg =
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

const post = (msg: OutMsg, transfer?: Transferable[]) =>
  transfer
    ? (self as unknown as Worker).postMessage(msg, transfer)
    : (self as unknown as Worker).postMessage(msg);

let cachedModel: any = null;
let cachedProcessor: any = null;
let activeBackend: BackendKind = "wasm";
let loadPromise: Promise<void> | null = null;
let reportProgressToUi = false;

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function supportsWebGpu(): Promise<boolean> {
  try {
    const nav = self.navigator as unknown as {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    };
    if (!nav?.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function ensureModelLoaded(emitProgress: boolean): Promise<boolean> {
  if (cachedModel && cachedProcessor) return true;
  if (emitProgress) reportProgressToUi = true;

  if (!loadPromise) {
    loadPromise = (async () => {
      const { AutoModel, AutoProcessor, env } = await import("@huggingface/transformers");

      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.proxy = false;
      }

      const fileProgress: Record<string, { loaded: number; total: number }> = {};

      const onProgress = (p: any) => {
        if (p.status === "progress" && p.file != null && p.loaded != null && p.total != null) {
          fileProgress[p.file] = { loaded: p.loaded, total: p.total };
          const loaded = Object.values(fileProgress).reduce((s, f) => s + f.loaded, 0);
          const total = Object.values(fileProgress).reduce((s, f) => s + f.total, 0);
          const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
          if (reportProgressToUi) {
            post({
              type: "progress",
              text: `Downloading AI model (${formatMb(loaded)} / ${formatMb(total)})…`,
              value: Math.round(pct * 0.65),
            });
          }
        }
      };

      if (reportProgressToUi) {
        post({ type: "progress", text: "Preparing on-device AI…", value: 2 });
      }

      const useWebGpu = await supportsWebGpu();
      activeBackend = useWebGpu ? "webgpu" : "wasm";

      const loadModel = async (device: BackendKind) => {
        return AutoModel.from_pretrained("briaai/RMBG-1.4", {
          config: { model_type: "custom" } as any,
          device,
          dtype: "q8",
          progress_callback: onProgress,
        } as any);
      };

      try {
        cachedModel = await loadModel(activeBackend);
      } catch {
        activeBackend = "wasm";
        cachedModel = await loadModel("wasm");
      }

      cachedProcessor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
        config: {
          do_normalize: true,
          do_pad: false,
          do_rescale: true,
          do_resize: true,
          image_mean: [0.5, 0.5, 0.5],
          image_std: [1.0, 1.0, 1.0],
          feature_extractor_type: "ImageFeatureExtractor",
          resample: 2,
          rescale_factor: 0.00392156862745098,
          size: { width: 1024, height: 1024 },
        },
      });
    })();
  }

  try {
    await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
  return false;
}

(self as unknown as Worker).addEventListener("message", async (e: MessageEvent<InMsg>) => {
  const data = e.data;

  if (data.type === "warmup") {
    try {
      const wasCached = await ensureModelLoaded(false);
      post({ type: "ready", backend: activeBackend, cached: wasCached });
    } catch {
      // Silent warmup failure — will retry with visible error if user processes an image
    }
    return;
  }

  if (data.type === "process") {
    try {
      const { RawImage } = await import("@huggingface/transformers");
      const wasCached = await ensureModelLoaded(true);

      post({ type: "progress", text: "Reading image…", value: wasCached ? 25 : 70 });

      const blob = new Blob([data.imageBuffer]);
      const url = URL.createObjectURL(blob);
      const image = await (RawImage as any).fromURL(url);
      URL.revokeObjectURL(url);

      post({ type: "progress", text: "Preprocessing…", value: wasCached ? 48 : 78 });
      const { pixel_values } = await cachedProcessor(image);

      post({
        type: "progress",
        text: `Running ${activeBackend === "webgpu" ? "WebGPU" : "WASM"} inference…`,
        value: wasCached ? 70 : 86,
      });
      const { output } = await cachedModel({ input: pixel_values });

      post({ type: "progress", text: "Refining alpha mask…", value: 94 });
      const mask: any = await (RawImage as any)
        .fromTensor(output[0].mul(255).to("uint8"))
        .resize(image.width, image.height);

      post({ type: "progress", text: "Finalising…", value: 99 });

      const maskBuffer =
        mask.data instanceof Uint8Array
          ? mask.data
          : new Uint8Array(mask.data as ArrayLike<number>);
      const transferable = maskBuffer.buffer.slice(0) as ArrayBuffer;

      post(
        {
          type: "done",
          mask: transferable,
          width: image.width,
          height: image.height,
          backend: activeBackend,
          cached: wasCached,
        },
        [transferable]
      );
    } catch (err: any) {
      post({ type: "error", message: err?.message ?? "Unknown inference error." });
    }
  }
});
