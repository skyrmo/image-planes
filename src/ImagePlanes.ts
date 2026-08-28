import { configureCanvas, initWebGPU } from "./core/gpu";
import { Renderer } from "./core/Renderer";
import { TextureManager } from "./core/TextureManager";
import { ImagePlane } from "./core/Plane";
import { PlaneManager } from "./core/PlaneManager";
import { rectFromElement } from "./core/util";
import type { PlaneRecord } from "./core/records";
import type {
    AddPlaneOptions,
    BeforeRenderCallback,
    ImagePlanesOptions,
    PlaneSource,
} from "./types";

const FRAME_MS = 1000 / 60;

/**
 * A scene of WebGPU image planes drawn on a (full-viewport, fixed) canvas, each
 * tracking a DOM element.
 */
export class ImagePlanes {
    private canvas: HTMLCanvasElement;
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private format: GPUTextureFormat;
    private renderer: Renderer;
    private textureManager: TextureManager;
    private planeManager: PlaneManager;

    private hooks: Set<BeforeRenderCallback> = new Set();

    private rAF: number | null = null;
    private lastTime: number | null = null;
    private needRender = true;

    /**
     * Scene-wide bounds smoothing. 0 follows tracked elements exactly, higher
     * values follow more slowly. Fixed at construction.
     */
    readonly damping: number;

    /** Acquire the GPU device, build the pipeline, and return a scene. */
    static async create(
        canvas: HTMLCanvasElement,
        options: ImagePlanesOptions = {},
    ): Promise<ImagePlanes> {
        const { device, context, format } = await initWebGPU(canvas);
        return new ImagePlanes(canvas, device, context, format, options);
    }

    /** Use `ImagePlanes.create()` as  GPU setup  is async. */
    private constructor(
        canvas: HTMLCanvasElement,
        device: GPUDevice,
        context: GPUCanvasContext,
        format: GPUTextureFormat,
        options: ImagePlanesOptions,
    ) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;
        this.damping = options.damping ?? 0;

        this.renderer = new Renderer(device, context, format);
        this.textureManager = new TextureManager(device);
        this.planeManager = new PlaneManager(device, this.renderer);

        // this.warnIfCanvasMisplaced();
        window.addEventListener("resize", this.handleResize);
    }

    private handleResize = () => {
        configureCanvas(this.canvas, this.context, this.device, this.format);
        // A resize reallocates the swapchain — the old frame is gone, redraw.
        // this.requestRender();
    };

    /**
     * Add a plane anchored to a DOM element. Returns the handle synchronously;
     * the texture uploads async (`await plane.ready` if you need to know). If
     * `element` is an <img> and no source is given, its decoded pixels are used.
     */
    addPlane(options: AddPlaneOptions): ImagePlane {
        let source: PlaneSource;
        if (options.source !== undefined) {
            source = options.source;
        } else if (options.element instanceof HTMLImageElement) {
            source = options.element;
        } else {
            throw new Error("addPlane needs a `source` when `element` is not an <img>");
        }

        const record = this.planeManager.createRecord(options.element, options.fit ?? "cover");

        // Seed bounds so consumers can read them before the first frame.
        Object.assign(record.bounds, rectFromElement(options.element));

        const ready = this.loadTexture(record, source);

        const plane = new ImagePlane(
            record,
            {
                removeRecord: (rec) => this.removePlane(rec),
                bringToFront: (rec) => this.planeManager.bringToFront(rec),
            },
            ready,
        );

        // Back-pointer. The record set is the only collection of planes; `planes`
        // reads through this, so there is no second set to keep in sync.
        record.handle = plane;

        return plane;
    }

    /**
     * Every plane in the scene, in paint order — later entries draw over earlier
     * ones, and `bringToFront()` moves a plane to the end.
     */
    get planes(): ImagePlane[] {
        // Non-null: every record in the set has been through addPlane().
        return Array.from(this.planeManager.getRecords(), (record) => record.handle!);
    }

    /**
     * Register a per-frame hook run before tracking/rendering. Receives the rAF
     * timestamp and the frame delta in ms, already clamped to 0.1–100 so a tab
     * returning from the background can't teleport your state either.
     * Returns an unsubscribe fn.
     */
    onBeforeRender(callback: BeforeRenderCallback): () => void {
        this.hooks.add(callback);
        return () => this.hooks.delete(callback);
    }

    start(): void {
        if (this.rAF !== null) return;
        this.lastTime = null;
        this.needRender = true;
        this.rAF = requestAnimationFrame(this.loop);
    }

    stop(): void {
        if (this.rAF !== null) {
            cancelAnimationFrame(this.rAF);
            this.rAF = null;
        }
    }

    destroy(): void {
        window.removeEventListener("resize", this.handleResize);
        this.stop();
        this.planeManager.destroyAll();
        this.hooks.clear();
        this.context.unconfigure();
        this.device.destroy();
    }

    private loop = (time: number) => {
        this.rAF = requestAnimationFrame(this.loop);

        const dt =
            this.lastTime === null ? FRAME_MS : Math.min(Math.max(time - this.lastTime, 0.1), 100);

        this.lastTime = time;

        for (const callback of this.hooks) callback(time, dt);

        const dirty = this.planeManager.update(dt / FRAME_MS, this.damping);

        if (dirty || this.needRender) {
            this.renderer.renderAll(this.planeManager.getRecords());
            this.needRender = false;
        }
    };

    private async loadTexture(record: PlaneRecord, source: PlaneSource): Promise<void> {
        const managed = await this.textureManager.load(source);
        this.planeManager.attachTexture(record, managed.texture, managed.width / managed.height);
        this.needRender = true;
    }

    private removePlane(record: PlaneRecord): void {
        this.planeManager.removeRecord(record);
        this.needRender = true;
    }

    /**
     * Plane positions come from viewport-relative rects and the canvas is sized
     * from the viewport, so a canvas that isn't a full-viewport fixed layer
     * misrenders silently. Warn once rather than fail — and never touch the
     * consumer's CSS.
     */
    // private warnIfCanvasMisplaced(): void {
    //     const position = getComputedStyle(this.canvas).position;
    //     if (position !== "fixed") {
    //         console.warn(
    //             `[image-planes] canvas has position: ${position}, expected "fixed". ` +
    //                 "Planes will not line up with their elements.",
    //         );
    //         return;
    //     }

    //     const rect = this.canvas.getBoundingClientRect();
    //     const offBy = (a: number, b: number) => Math.abs(a - b) > 1;
    //     if (
    //         offBy(rect.left, 0) ||
    //         offBy(rect.top, 0) ||
    //         offBy(rect.width, window.innerWidth) ||
    //         offBy(rect.height, window.innerHeight)
    //     ) {
    //         console.warn(
    //             "[image-planes] canvas does not cover the viewport " +
    //                 `(${rect.width}x${rect.height} at ${rect.left},${rect.top}; ` +
    //                 `expected ${window.innerWidth}x${window.innerHeight} at 0,0). ` +
    //                 "Planes will not line up with their elements.",
    //         );
    //     }
    // }
}
