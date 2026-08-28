import { WebGPUCore } from "./core/WebGPUCore";
import { Renderer } from "./core/Renderer";
import { TextureManager } from "./core/TextureManager";
import { ImagePlane } from "./core/Plane";
import { PlaneManager } from "./core/PlaneManager";
import { rectFromElement } from "./core/util";
import type { AddPlaneOptions, ImagePlanesOptions, PlaneSource } from "./types";
import type { PlaneRecord } from "./core/records";

const FRAME_MS = 1000 / 60;

export type BeforeRenderCallback = (time: number, dt: number) => void;

/**
 * A scene of WebGPU image planes drawn on a full-viewport fixed canvas, each
 * tracking a DOM element. Bring your own animation: tick GSAP/Lenis/etc. in an
 * `onBeforeRender` hook and tween plane handles directly.
 */
export class ImagePlanes {
    private canvas: HTMLCanvasElement;
    private core: WebGPUCore;
    private renderer: Renderer;
    private textureManager: TextureManager;
    private planeManager: PlaneManager;

    private handles: Map<number, ImagePlane> = new Map();
    private hooks: Set<BeforeRenderCallback> = new Set();

    private rAF: number | null = null;
    private lastTime: number | null = null;
    private needRender = true;
    private nextAutoId = 0;

    /**
     * Scene-wide bounds smoothing. 0 follows tracked elements exactly, higher
     * values follow more slowly. Fixed at construction.
     */
    readonly damping: number;

    private handleResize = () => {
        this.core.configureContext();
        // A resize reallocates the swapchain — the old frame is gone, redraw.
        this.requestRender();
    };

    constructor(canvas: HTMLCanvasElement, options: ImagePlanesOptions = {}) {
        this.canvas = canvas;
        this.damping = options.damping ?? 0;
        this.core = new WebGPUCore();
        this.renderer = new Renderer(this.core);
        this.textureManager = new TextureManager(this.core);
        this.planeManager = new PlaneManager(this.core, this.renderer);
    }

    /**
     * Acquire the GPU device and build the pipeline. Rejects with
     * `WebGPUUnsupportedError` when the browser or machine can't do WebGPU —
     * that's the signal to leave your native <img>s visible and stop here.
     */
    async init(): Promise<void> {
        await this.core.initialize(this.canvas);
        this.renderer.initialize();
        this.warnIfCanvasMisplaced();
        window.addEventListener("resize", this.handleResize);
    }

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

        const id = this.nextAutoId++;
        const record = this.planeManager.createRecord(id, options.element, options.fit ?? "cover");
        // Seed bounds so consumers can read them before the first frame.
        Object.assign(record.bounds, rectFromElement(options.element));

        const ready = this.loadTexture(record, source);
        const plane = new ImagePlane(
            record,
            {
                removeRecord: (planeId) => this.removePlane(planeId),
                bringToFront: (planeId) => this.planeManager.bringToFront(planeId),
            },
            ready,
        );
        this.handles.set(id, plane);

        return plane;
    }

    get planes(): ImagePlane[] {
        return Array.from(this.handles.values());
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

    /** Force a draw on the next frame (submits are skipped when nothing changed). */
    requestRender(): void {
        this.needRender = true;
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
        this.stop();
        window.removeEventListener("resize", this.handleResize);
        this.planeManager.destroyAll();
        this.handles.clear();
        this.hooks.clear();
        this.core.destroy();
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
        this.requestRender();
    }

    private removePlane(id: number): void {
        this.planeManager.removeRecord(id);
        this.handles.delete(id);
        this.requestRender();
    }

    /**
     * Plane positions come from viewport-relative rects and the canvas is sized
     * from the viewport, so a canvas that isn't a full-viewport fixed layer
     * misrenders silently. Warn once rather than fail — and never touch the
     * consumer's CSS.
     */
    private warnIfCanvasMisplaced(): void {
        const position = getComputedStyle(this.canvas).position;
        if (position !== "fixed") {
            console.warn(
                `[image-planes] canvas has position: ${position}, expected "fixed". ` +
                    "Planes will not line up with their elements.",
            );
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const offBy = (a: number, b: number) => Math.abs(a - b) > 1;
        if (
            offBy(rect.left, 0) ||
            offBy(rect.top, 0) ||
            offBy(rect.width, window.innerWidth) ||
            offBy(rect.height, window.innerHeight)
        ) {
            console.warn(
                "[image-planes] canvas does not cover the viewport " +
                    `(${rect.width}x${rect.height} at ${rect.left},${rect.top}; ` +
                    `expected ${window.innerWidth}x${window.innerHeight} at 0,0). ` +
                    "Planes will not line up with their elements.",
            );
        }
    }
}
