import type { Rect, UniformValues } from "../types";
import type { PlaneRecord } from "./records";

/**
 * Operations a plane handle needs from its scene.
 * @internal — not part of the public API; stripped from the emitted .d.ts.
 */
interface PlaneOps {
    removeRecord(record: PlaneRecord): void;
    bringToFront(record: PlaneRecord): void;
}

/**
 * Public handle for one image plane, and the only way to refer to it — planes
 * have no id. `bounds` and `opacity` are plain mutable state.
 */
export class ImagePlane {
    private record: PlaneRecord;
    private ops: PlaneOps; // this is the closure with remoive and bring to front.

    /** Resolves when the texture is uploaded; the plane isn't drawn until then. */
    readonly ready: Promise<void>;

    /** Constructed by `ImagePlanes.addPlane`, never directly. */
    constructor(record: PlaneRecord, ops: PlaneOps, ready: Promise<void>) {
        this.record = record;
        this.ops = ops;
        this.ready = ready;
    }

    /**
     * The plane's rect in CSS pixels. This is the same object for the plane's
     * entire lifetime — mutate its fields, never reassign it, and animation
     * libraries can hold the reference.
     *
     * While tracking, the render loop overwrites these values every frame.
     * While untracked, they are yours.
     */
    get bounds(): Rect {
        return this.record.bounds;
    }

    /**
     * This plane's effect uniforms, seeded from the effect definition and
     * mutated in place exactly like `bounds`. Animate them directly:
     * `gsap.to(plane.uniforms, { progress: 1 })` needs no redraw call, because
     * the render loop notices the values changing.
     *
     * Its own object per plane, so two planes sharing one imported effect
     * animate independently. Empty and inert on a plane with no effect.
     */
    get uniforms(): UniformValues {
        return this.record.uniformValues;
    }

    get opacity(): number {
        return this.record.opacity;
    }

    set opacity(value: number) {
        this.record.opacity = value;
    }

    /** True while the render loop is following this plane's tracked element. */
    get isTracking(): boolean {
        return this.record.tracking;
    }

    /**
     * Stop following the tracked element — you own `bounds` until you call
     * `track()` again. Kill any animation still writing to `bounds` before
     * re-tracking, or it and the render loop will fight over the same object.
     */
    untrack(): void {
        this.record.tracking = false;
    }

    /** Resume following, optionally re-anchoring to a different element. */
    track(el?: HTMLElement): void {
        if (el) this.record.trackedEl = el;
        this.record.tracking = true;
    }

    /** Draw this plane over all the others from now on. */
    bringToFront(): void {
        this.ops.bringToFront(this.record);
    }

    /** Destroy this plane's GPU resources and drop it from the scene. */
    remove(): void {
        this.ops.removeRecord(this.record);
    }
}
