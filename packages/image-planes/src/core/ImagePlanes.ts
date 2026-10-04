import { configureCanvas, initWebGPU } from "./gpu";
import { ImagePlane } from "./ImagePlane";
import { PlaneManager } from "./PlaneManager";
import { Renderer } from "./Renderer";
import { loadTexture } from "./texture";
import type { AddPlaneOptions, BeforeRenderCallback, ImagePlanesOptions } from "../types";

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
    private needRender = true;

    static async create(
        canvas: HTMLCanvasElement,
        options: ImagePlanesOptions = {},
    ): Promise<ImagePlanes> {
        const { device, context, format } = await initWebGPU(canvas);
        return new ImagePlanes(canvas, device, context, format, options.damping ?? 0);
    }

    private constructor(
        canvas: HTMLCanvasElement,
        device: GPUDevice,
        context: GPUCanvasContext,
        format: GPUTextureFormat,
        damping: number,
    ) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;
        this.renderer = new Renderer(device, context, format);
        this.planeManager = new PlaneManager(this.device, this.renderer, damping);

        window.addEventListener("resize", this.handleResize);
    }

    private handleResize = () => {
        configureCanvas(this.canvas, this.context, this.device, this.format);
        this.needRender = true;
    };

    addPlane(options: AddPlaneOptions) {
        const source =
            options.source ??
            (options.element instanceof HTMLImageElement ? options.element : undefined);

        if (!source) throw new Error("addPlane: pass a source, or use an <img> element");

        const record = this.planeManager.createRecord(options.element, options.fit ?? "cover");

        const ready = loadTexture(this.device, source).then(({ texture, aspect }) => {
            // Removed before the image arrived: free the texture instead of attaching it.
            if (!this.planeManager.has(record)) {
                texture.destroy();
                return;
            }
            this.planeManager.attachTexture(record, texture, aspect);
            this.needRender = true;
        });

        const plane = new ImagePlane(record, this.planeManager, ready);
        record.handle = plane;
        return plane;
    }

    start(): void {
        if (this.rAF !== null) return;
        this.lastTime = null;
        this.needRender = true;
        this.rAF = requestAnimationFrame(this.loop);
    }

    stop(): void {
        if (this.rAF !== null) cancelAnimationFrame(this.rAF);
        this.rAF = null;
    }

    /** Every plane, in drawing order (last = on top). */
    get planes(): ImagePlane[] {
        return Array.from(this.planeManager.records, (record) => record.handle!);
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

        const dtRatio = dt / (1000 / 60);
        const dirty = this.planeManager.update(dtRatio);
        if (dirty || this.needRender) {
            this.renderer.render(this.planeManager.records);
            this.needRender = false;
        }
    };

    destroy(): void {
        this.stop();
        window.removeEventListener("resize", this.handleResize);
    }
}
