import { WebGPUCore } from "./core/WebGPUCore";
import { Renderer } from "./core/Renderer";
import { TextureManager } from "./core/TextureManager";
import { PlaneManager } from "./core/PlaneManager";
import { ImagePlane } from "./core/Plane";
import { rectFromElement } from "./core/util";
import type { AddPlaneOptions, ImagePlanesOptions, PlaneRecord, PlaneSource } from "./types";

const FRAME_MS = 1000 / 60;

export type BeforeRenderCallback = (time: number) => void;

// A scene of WebGPU image planes drawn on a full-viewport fixed canvas. each tracking a DOM element. Bring your own animation.
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

    // Scene-wide bounds smoothing for tracked planes (1 = exact follow).
    lerp: number;

    private handleResize = () => {
        this.core.configureContext();
        // A resize reallocates the swapchain — the old frame is gone, redraw.
        this.requestRender();
    };

    constructor(canvas: HTMLCanvasElement, options: ImagePlanesOptions = {}) {
        this.canvas = canvas;
        this.lerp = options.lerp ?? 1;
        this.core = new WebGPUCore();
        this.renderer = new Renderer(this.core);
        this.textureManager = new TextureManager(this.core);
        this.planeManager = new PlaneManager(this.core, this.renderer);
    }

    async init(): Promise<void> {
        await this.core.initialize(this.canvas);
        this.renderer.initialize();
        window.addEventListener("resize", this.handleResize);
    }

    /**
     * Add a plane anchored to a DOM element. Returns the handle synchronously;
     * the texture uploads async (`await plane.ready` if you need to know). If
     * `element` is an <img> and no source is given, its decoded pixels are used.
     */
    addPlane(options: AddPlaneOptions): ImagePlane {
        const id = options.id ?? this.claimAutoId();
        if (this.handles.has(id)) {
            throw new Error(`Plane with id ${id} already exists`);
        }

        let source: PlaneSource;
        if (options.source !== undefined) {
            source = options.source;
        } else if (options.element instanceof HTMLImageElement) {
            source = options.element;
        } else {
            throw new Error("addPlane needs a `source` when `element` is not an <img>");
        }

        const record = this.planeManager.createRecord(
            id,
            options.element,
            options.fit ?? "cover",
            options.lerp ?? null,
        );
        // Seed bounds so consumers can read them before the first frame.
        Object.assign(record.bounds, rectFromElement(options.element));

        const ready = this.loadTexture(record, source);
        const plane = new ImagePlane(
            record,
            {
                loadTexture: (r, s) => this.loadTexture(r, s),
                removeRecord: (planeId) => this.removePlane(planeId),
            },
            ready,
        );
        this.handles.set(id, plane);

        return plane;
    }

    getPlane(id: number): ImagePlane | undefined {
        return this.handles.get(id);
    }

    get planes(): ImagePlane[] {
        return Array.from(this.handles.values());
    }

    /** Register a per-frame hook run before tracking/rendering. Returns an unsubscribe fn. */
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
        const dt =
            this.lastTime === null ? FRAME_MS : Math.min(Math.max(time - this.lastTime, 0.1), 100);
        this.lastTime = time;

        for (const callback of this.hooks) callback(time);

        const dirty = this.planeManager.update(dt / FRAME_MS, this.lerp);
        if (dirty || this.needRender) {
            this.renderer.renderAll(this.planeManager.getRecords());
            this.needRender = false;
        }

        this.rAF = requestAnimationFrame(this.loop);
    };

    private loadTexture(record: PlaneRecord, source: PlaneSource): Promise<void> {
        return this.textureManager.load(source).then((managed) => {
            this.planeManager.attachTexture(
                record,
                managed.texture,
                managed.width / managed.height,
            );
            this.requestRender();
        });
    }

    private removePlane(id: number): void {
        this.planeManager.removeRecord(id);
        this.handles.delete(id);
        this.requestRender();
    }

    private claimAutoId(): number {
        while (this.handles.has(this.nextAutoId)) this.nextAutoId++;
        return this.nextAutoId++;
    }
}
