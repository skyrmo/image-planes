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

        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported in this browser");
        }

        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            throw new Error("Failed to get GPU adapter");
        }

        this.device = await this.adapter.requestDevice();

        this.context = canvas.getContext("webgpu");
        if (!this.context) {
            throw new Error("Failed to get WebGPU context");
        }

        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();

        this.configureContext();
    }

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
