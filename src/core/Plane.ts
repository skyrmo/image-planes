import type { PlaneRecord, PlaneSource, Rect } from "../types";

/** Internal operations a plane handle needs from its scene. */
export interface PlaneOps {
    loadTexture(record: PlaneRecord, source: PlaneSource): Promise<void>;
    removeRecord(id: number): void;
}

/**
 * Public handle for one image plane. `bounds` and `opacity` are plain mutable
 * state, designed to be driven by any animation library:
 *
 *   plane.detach();
 *   gsap.to(plane.bounds, { ...rectFromElement(target), duration: 0.9 });
 *   gsap.to(plane, { opacity: 0 });
 */
export class ImagePlane {
    private record: PlaneRecord;
    private ops: PlaneOps;
    private readyPromise: Promise<void>;

    constructor(record: PlaneRecord, ops: PlaneOps, ready: Promise<void>) {
        this.record = record;
        this.ops = ops;
        this.readyPromise = ready;
    }

    get id(): number {
        return this.record.id;
    }

    /** Resolves when the current texture is uploaded; the plane isn't drawn until then. */
    get ready(): Promise<void> {
        return this.readyPromise;
    }

    /**
     * Stable mutable rect (CSS px). While attached, the render loop keeps it on
     * the tracked element; while detached, you own it.
     */
    get bounds(): Rect {
        return this.record.bounds;
    }

    get opacity(): number {
        return this.record.opacity;
    }

    set opacity(value: number) {
        this.record.opacity = value;
    }

    get lerp(): number | null {
        return this.record.lerp;
    }

    set lerp(value: number | null) {
        this.record.lerp = value;
    }

    get isAttached(): boolean {
        return this.record.trackBounds;
    }

    /** Stop DOM tracking — you own bounds now (start of a "flight"). */
    detach(): void {
        this.record.trackBounds = false;
    }

    /** Resume tracking, optionally re-anchoring to a new element. */
    attach(el?: HTMLElement): void {
        if (el) this.record.trackedEl = el;
        this.record.trackBounds = true;
    }

    /** Swap the texture. Returns (and replaces `ready` with) the upload promise. */
    setSource(source: PlaneSource): Promise<void> {
        this.readyPromise = this.ops.loadTexture(this.record, source);
        return this.readyPromise;
    }

    /** Destroy this plane's GPU resources and drop it from the scene. */
    remove(): void {
        this.ops.removeRecord(this.record.id);
    }
}
