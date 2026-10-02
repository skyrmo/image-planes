import { configureCanvas, initWebGPU } from "./core/gpu";
import { PlaneManager } from "./core/PlaneManager";
import { Renderer } from "./core/Renderer";
import type { AddPlaneOptions, BeforeRenderCallback } from "./types/types";

export class ImagePlanes {
    private canvas: HTMLCanvasElement;
    private context: GPUCanvasContext;
    private device: GPUDevice;
    private format: GPUTextureFormat;
    private renderer: Renderer;
    private planeManager: PlaneManager;

    private rAF: number | null = null;
    private lastTime: number | null = null;
    private hooks = new Set<BeforeRenderCallback>();

    static async create(canvas: HTMLCanvasElement): Promise<ImagePlanes> {
        const { device, context, format } = await initWebGPU(canvas);
        return new ImagePlanes(canvas, device, context, format);
    }

    private handleResize = () => {
        configureCanvas(this.canvas, this.context, this.device, this.format);
    };

    private constructor(
        canvas: HTMLCanvasElement,
        device: GPUDevice,
        context: GPUCanvasContext,
        format: GPUTextureFormat,
    ) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;
        this.renderer = new Renderer(device, context, format);
        this.planeManager = new PlaneManager(this.device, this.renderer);

        window.addEventListener("resize", this.handleResize);
    }

    addPlane(options: AddPlaneOptions): void {
        this.planeManager.createRecord(options.element);
        this.planeManager.update();
    }

    start(): void {
        if (this.rAF !== null) return;
        this.lastTime = null;
        this.rAF = requestAnimationFrame(this.loop);
    }

    stop(): void {
        if (this.rAF !== null) cancelAnimationFrame(this.rAF);
        this.rAF = null;
    }

    /** Run `callback` every frame, before planes are measured. Returns an "unsubscribe" function. */
    onBeforeRender(callback: BeforeRenderCallback): () => void {
        this.hooks.add(callback);
        return () => this.hooks.delete(callback);
    }

    private loop = (time: number) => {
        this.rAF = requestAnimationFrame(this.loop);

        // Clamped, so returning to a background tab doesn't jump.
        const dt =
            this.lastTime === null ? 1000 / 60 : Math.min(Math.max(time - this.lastTime, 0.1), 100);

        this.lastTime = time;

        for (const callback of this.hooks) callback(time, dt);

        this.planeManager.update();

        this.renderer.render(this.planeManager.records);
    };

    destroy(): void {
        this.stop();
        window.removeEventListener("resize", this.handleResize);
    }
}
