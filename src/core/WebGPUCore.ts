import { WebGPUInitError, WebGPUUnsupportedError } from "./errors";

export class WebGPUCore {
    private device: GPUDevice | null = null;
    private adapter: GPUAdapter | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private context: GPUCanvasContext | null = null;
    private canvasFormat: GPUTextureFormat = "bgra8unorm";

    async initialize(canvas: HTMLCanvasElement): Promise<void> {
        if (this.device) {
            console.warn("WebGPU already initialized");
            return;
        }

        this.canvas = canvas;

        // No navigator.gpu and no adapter both mean "this machine can't" —
        // the graceful degradation path. Everything below them is a real fault.
        if (!navigator.gpu) {
            throw new WebGPUUnsupportedError("WebGPU is not available in this browser");
        }

        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            throw new WebGPUUnsupportedError("No WebGPU adapter is available on this machine");
        }

        try {
            this.device = await this.adapter.requestDevice();
        } catch (cause) {
            throw new WebGPUInitError("Failed to create a WebGPU device", { cause });
        }

        this.context = canvas.getContext("webgpu");
        if (!this.context) {
            throw new WebGPUInitError("The canvas would not return a \"webgpu\" context");
        }

        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();

        this.configureContext();
    }

    /** Configures the WebGPU context for the canvas. Also used upon window resize. */
    configureContext(): void {
        if (!this.context || !this.device || !this.canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(window.innerWidth * dpr));
        const height = Math.max(1, Math.floor(window.innerHeight * dpr));

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        this.context.configure({
            device: this.device,
            format: this.canvasFormat,
            alphaMode: "premultiplied",
        });
    }

    getDevice(): GPUDevice {
        if (!this.device) {
            throw new Error("WebGPU not initialized. Call init() first.");
        }
        return this.device;
    }

    getContext(): GPUCanvasContext | null {
        return this.context;
    }

    getCanvasFormat(): GPUTextureFormat {
        return this.canvasFormat;
    }

    isInitialized(): boolean {
        return this.device !== null;
    }

    destroy(): void {
        this.context?.unconfigure();
        this.device?.destroy();
        this.device = null;
        this.context = null;
        this.canvas = null;
        this.adapter = null;
    }
}
