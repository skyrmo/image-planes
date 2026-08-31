import { configureCanvas, initWebGPU } from "./core/gpu";
import { Renderer } from "./core/Renderer";
import { TextureManager } from "./core/TextureManager";
import { ImagePlane } from "./core/ImagePlane";
import { PlaneManager } from "./core/PlaneManager";
import { EffectCompiler } from "./core/EffectCompiler";
import { SCENE_UNIFORM_FLOATS } from "./core/Renderer";
import { cloneValues } from "./core/uniforms";
import type { PlaneRecord } from "./core/records";
import type {
    AddPlaneOptions,
    BeforeRenderCallback,
    EffectDefinition,
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
    private effectCompiler: EffectCompiler;

    private hooks: Set<BeforeRenderCallback> = new Set();

    private rAF: number | null = null;
    private lastTime: number | null = null;
    private needRender = true;

    private sceneScratch = new Float32Array(SCENE_UNIFORM_FLOATS);

    // Wall clock for shader effects, in seconds, from the first drawn frame.
    // Not reset by stop()/start(): a clock that jumps backwards is worse than
    // one that skips the paused interval.
    private startTime: number | null = null;

    // Cursor in viewport CSS px, from a window listener installed lazily by
    // the first effect plane. A scene with no effects installs nothing.
    private pointerX = 0;
    private pointerY = 0;
    private pointerListening = false;

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
        this.effectCompiler = new EffectCompiler(device, this.renderer);

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

        // Two independent async arms. `ready` covers both, so a shader that
        // fails to compile surfaces the same way a 404 image does.
        const texture = this.loadTexture(record, source);
        const effect = options.effect
            ? this.attachEffect(record, options.effect)
            : Promise.resolve();

        const plane = new ImagePlane(
            record,
            {
                removeRecord: (rec) => this.removePlane(rec),
                bringToFront: (rec) => this.planeManager.bringToFront(rec),
            },
            Promise.all([texture, effect]).then(() => undefined),
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
        window.removeEventListener("pointermove", this.handlePointer);
        this.stop();
        this.planeManager.destroyAll();
        this.renderer.destroy();
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
            if (this.startTime === null) this.startTime = time;

            const s = this.sceneScratch;
            s[0] = window.innerWidth;
            s[1] = window.innerHeight;
            s[2] = this.pointerX;
            s[3] = this.pointerY;
            s[4] = (time - this.startTime) / 1000;
            s[5] = window.devicePixelRatio || 1;

            this.renderer.renderAll(this.planeManager.getRecords(), s);
            this.needRender = false;
        }
    };

    private async loadTexture(record: PlaneRecord, source: PlaneSource): Promise<void> {
        const managed = await this.textureManager.load(source);
        this.planeManager.attachTexture(record, managed.texture, managed.width / managed.height);
        this.needRender = true;
    }

    private async attachEffect(record: PlaneRecord, effect: EffectDefinition): Promise<void> {
        // Everything up to the await runs before addPlane returns, so
        // plane.uniforms is tweenable in the same tick even though the shader
        // is still compiling.
        record.uniformValues = cloneValues(effect.uniforms ?? {});
        // Withhold the default pipeline so the plane isn't drawn un-effected
        // for the frames the compile takes.
        record.pipeline = null;
        this.ensurePointerTracking();

        const compiled = await this.effectCompiler.compile(effect);

        // The plane may have been removed while this was in flight, in which
        // case its buffers are already destroyed.
        if (!this.planeManager.has(record)) return;

        this.planeManager.attachEffect(record, compiled, effect.animated === true);
        this.needRender = true;
    }

    /**
     * The canvas is pointer-events: none and never sees the cursor, so
     * `scene.pointer` needs a window listener. Installed on the first effect
     * plane, since nothing else can read it.
     */
    private ensurePointerTracking(): void {
        if (this.pointerListening) return;
        this.pointerListening = true;
        window.addEventListener("pointermove", this.handlePointer, { passive: true });
    }

    private handlePointer = (event: PointerEvent) => {
        this.pointerX = event.clientX;
        this.pointerY = event.clientY;
        // No dirty check can see this. The listener only exists once a plane
        // has an effect, so redrawing on move is the least surprising rule,
        // even for an effect that never reads the pointer.
        this.needRender = true;
    };

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
