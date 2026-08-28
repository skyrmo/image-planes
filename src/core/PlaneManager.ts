import { WebGPUCore } from "./WebGPUCore";
import { Renderer, UNIFORM_FLOATS } from "./Renderer";
import type { PlaneFit } from "../types";
import type { PlaneRecord } from "./records";

// Below this distance (CSS px) a damped bound snaps to its target, so the
// dirty flag can reach "converged" instead of asymptoting forever.
const SNAP_EPSILON = 0.05;

export class PlaneManager {
    private core: WebGPUCore;
    private renderer: Renderer;
    private records: Map<number, PlaneRecord> = new Map();
    private scratch = new Float32Array(UNIFORM_FLOATS);

    constructor(core: WebGPUCore, renderer: Renderer) {
        this.core = core;
        this.renderer = renderer;
    }

    createRecord(id: number, trackedEl: HTMLElement, fit: PlaneFit): PlaneRecord {
        const record: PlaneRecord = {
            id,
            texture: null,
            uniformBuffer: this.renderer.createUniformBuffer(),
            bindGroup: null,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            opacity: 1,
            trackedEl,
            tracking: true,
            fit,
            texAspect: 1,
            ready: false,
            seeded: false,
            lastUniform: new Float32Array(UNIFORM_FLOATS).fill(NaN),
        };

        this.records.set(id, record);

        return record;
    }

    attachTexture(record: PlaneRecord, texture: GPUTexture, texAspect: number): void {
        record.texture?.destroy();
        record.texture = texture;
        record.texAspect = texAspect;
        record.bindGroup = this.renderer.createBindGroup(texture, record.uniformBuffer);
        record.ready = true;
    }

    removeRecord(id: number): void {
        const record = this.records.get(id);
        if (!record) return;
        record.texture?.destroy();
        record.uniformBuffer.destroy();
        this.records.delete(id);
    }

    /**
     * Track bounds + write changed uniforms. Returns true when anything
     * changed this frame (the dirty flag that gates the GPU submit).
     */
    update(dtRatio: number, damping: number): boolean {
        const device = this.core.getDevice();
        // Public `damping` counts up from 0 (= follow exactly); the internal
        // coefficient is the fraction of the gap closed per 60Hz frame. The
        // floor keeps a damping of ~1 from stalling completely.
        const k = Math.max(1 - damping, 0.01);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let dirty = false;

        for (const record of this.records.values()) {
            // While tracking, follow the DOM anchor each frame. Once untracked
            // the consumer owns bounds, so leave them alone.
            if (record.tracking && record.trackedEl) {
                const rect = record.trackedEl.getBoundingClientRect();
                const b = record.bounds;

                // Snap while unseeded or undrawn so the first visible frame is
                // exact; damp otherwise (the scroll-follow jitter fix).
                if (!record.seeded || !record.ready || damping <= 0) {
                    b.x = rect.x;
                    b.y = rect.y;
                    b.width = rect.width;
                    b.height = rect.height;
                    record.seeded = true;
                } else {
                    const a = 1 - Math.pow(1 - k, dtRatio);
                    b.x += (rect.x - b.x) * a;
                    b.y += (rect.y - b.y) * a;
                    b.width += (rect.width - b.width) * a;
                    b.height += (rect.height - b.height) * a;

                    if (
                        Math.abs(rect.x - b.x) < SNAP_EPSILON &&
                        Math.abs(rect.y - b.y) < SNAP_EPSILON &&
                        Math.abs(rect.width - b.width) < SNAP_EPSILON &&
                        Math.abs(rect.height - b.height) < SNAP_EPSILON
                    ) {
                        b.x = rect.x;
                        b.y = rect.y;
                        b.width = rect.width;
                        b.height = rect.height;
                    }
                }
            }

            if (!record.ready) continue;

            const { bounds, opacity } = record;
            const s = this.scratch;
            s[0] = (bounds.x / vw) * 2 - 1;
            s[1] = 1 - ((bounds.y + bounds.height) / vh) * 2;
            s[2] = (bounds.width / vw) * 2;
            s[3] = (bounds.height / vh) * 2;
            s[4] = opacity;
            s[5] = 0; // padding

            // Cover-fit UV window, recomputed per frame because the plane's
            // aspect morphs during flights. (1, 1) = fill.
            if (record.fit === "cover" && bounds.height > 0) {
                const planeAspect = bounds.width / bounds.height;
                if (planeAspect > record.texAspect) {
                    s[6] = 1;
                    s[7] = record.texAspect / planeAspect;
                } else {
                    s[6] = planeAspect / record.texAspect;
                    s[7] = 1;
                }
            } else {
                s[6] = 1;
                s[7] = 1;
            }

            // Only write (and draw) when something actually changed.
            const last = record.lastUniform;
            let changed = false;
            for (let i = 0; i < UNIFORM_FLOATS; i++) {
                if (last[i] !== s[i]) {
                    changed = true;
                    break;
                }
            }
            if (changed) {
                last.set(s);
                device.queue.writeBuffer(record.uniformBuffer, 0, s);
                dirty = true;
            }
        }

        return dirty;
    }

    /**
     * Move a plane to the end of the iteration order, so it paints over every
     * other plane. `Map` preserves insertion order, so re-inserting is O(1)
     * and needs no sort or stored depth.
     */
    bringToFront(id: number): void {
        const record = this.records.get(id);
        if (!record) return;
        this.records.delete(id);
        this.records.set(id, record);
    }

    getRecord(id: number): PlaneRecord | undefined {
        return this.records.get(id);
    }

    getRecords(): IterableIterator<PlaneRecord> {
        return this.records.values();
    }

    destroyAll(): void {
        for (const record of this.records.values()) {
            record.texture?.destroy();
            record.uniformBuffer.destroy();
        }
        this.records.clear();
    }
}
