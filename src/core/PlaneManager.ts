import { Renderer, PLANE_UNIFORM_FLOATS } from "./Renderer";
import { pack } from "./uniforms";
import { rectFromElement } from "./util";
import type { CompiledEffect } from "./EffectCompiler";
import type { PlaneFit } from "../types";
import type { PlaneRecord } from "./records";

// Below this distance (CSS px) a damped bound snaps to its target, so the
// dirty flag can reach "converged" instead of asymptoting forever.
const SNAP_EPSILON = 0.05;

export class PlaneManager {
    private device: GPUDevice;
    private renderer: Renderer;
    private records: Set<PlaneRecord> = new Set();
    private scratch = new Float32Array(PLANE_UNIFORM_FLOATS);

    // One buffer shared by every effect plane, grown to fit the largest layout
    // seen. Effect uniform blocks are small and per-record scratch would be
    // one more allocation per plane for no gain.
    private effectScratch = new Float32Array(0);

    constructor(device: GPUDevice, renderer: Renderer) {
        this.device = device;
        this.renderer = renderer;
    }

    createRecord(trackedEl: HTMLElement, fit: PlaneFit): PlaneRecord {
        // Seeded here rather than by the caller so that bounds are readable
        // before the first frame AND prevX/prevY start somewhere real. Left at
        // the origin they would read as one frame of enormous velocity.
        const bounds = rectFromElement(trackedEl);

        const record: PlaneRecord = {
            handle: null, // set by addPlane() as soon as the handle exists
            texture: null,
            uniformBuffer: this.renderer.createUniformBuffer(),
            planeBindGroup: null,
            pipeline: this.renderer.defaultPipeline,
            bounds,
            opacity: 1,
            trackedEl,
            tracking: true,
            fit,
            texAspect: 1,
            ready: false,
            seeded: false,
            prevX: bounds.x,
            prevY: bounds.y,
            lastUniform: new Float32Array(PLANE_UNIFORM_FLOATS).fill(NaN),
            effectLayout: null,
            effectUniformBuffer: null,
            effectBindGroup: null,
            lastEffectUniform: null,
            uniformValues: {},
            animated: false,
        };

        this.records.add(record);

        return record;
    }

    attachTexture(record: PlaneRecord, texture: GPUTexture, texAspect: number): void {
        record.texture?.destroy();
        record.texture = texture;
        record.texAspect = texAspect;
        record.planeBindGroup = this.renderer.createPlaneBindGroup(texture, record.uniformBuffer);
        record.ready = true;
    }

    /**
     * Give a plane its compiled pipeline, and a uniform buffer if the effect
     * declared any. Called once the shader resolves; until then the record's
     * pipeline is null and the plane is not drawn.
     */
    attachEffect(record: PlaneRecord, compiled: CompiledEffect, animated: boolean): void {
        record.pipeline = compiled.pipeline;
        record.animated = animated;

        if (!compiled.layout) return;

        record.effectLayout = compiled.layout;
        record.effectUniformBuffer = this.device.createBuffer({
            size: compiled.layout.byteSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        record.effectBindGroup = this.renderer.createEffectBindGroup(record.effectUniformBuffer);
        record.lastEffectUniform = new Float32Array(compiled.layout.floats).fill(NaN);
    }

    has(record: PlaneRecord): boolean {
        return this.records.has(record);
    }

    removeRecord(record: PlaneRecord): void {
        if (!this.records.delete(record)) return;
        record.texture?.destroy();
        record.uniformBuffer.destroy();
        record.effectUniformBuffer?.destroy();
    }

    /**
     * Track bounds + write changed uniforms. Returns true when anything
     * changed this frame (the dirty flag that gates the GPU submit).
     */
    update(dtRatio: number, damping: number): boolean {
        // Public `damping` counts up from 0 (= follow exactly); the internal
        // coefficient is the fraction of the gap closed per 60Hz frame. The
        // floor keeps a damping of ~1 from stalling completely.
        const k = Math.max(1 - damping, 0.01);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let dirty = false;

        for (const record of this.records.values()) {
            const b = record.bounds;

            // While tracking, follow the DOM anchor each frame. Once untracked
            // the consumer owns bounds, so leave them alone.
            if (record.tracking && record.trackedEl) {
                const rect = record.trackedEl.getBoundingClientRect();

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

            // Velocity is computed before the ready gate so prev never goes
            // stale on a plane whose texture hasn't arrived. Otherwise the
            // first frame it is drawn inherits every pixel it travelled while
            // it was invisible.
            //
            // Units are fractions of the plane's own size per 60Hz frame,
            // which makes them directly comparable to planeUv. The divisor is
            // floored because the loop clamps dt to a 0.1ms minimum, so dtRatio
            // can reach 0.006 and one stalled frame would otherwise read as a
            // ~150x velocity spike.
            const vDiv = Math.max(dtRatio, 0.5);
            const vx = b.width > 0 ? (b.x - record.prevX) / b.width / vDiv : 0;
            const vy = b.height > 0 ? (b.y - record.prevY) / b.height / vDiv : 0;
            record.prevX = b.x;
            record.prevY = b.y;

            if (!record.ready) continue;

            const s = this.scratch;
            s[0] = (b.x / vw) * 2 - 1;
            s[1] = 1 - ((b.y + b.height) / vh) * 2;
            s[2] = (b.width / vw) * 2;
            s[3] = (b.height / vh) * 2;

            // Cover-fit UV window, recomputed per frame because the plane's
            // aspect morphs during flights. (1, 1) = fill.
            if (record.fit === "cover" && b.height > 0) {
                const planeAspect = b.width / b.height;
                if (planeAspect > record.texAspect) {
                    s[4] = 1;
                    s[5] = record.texAspect / planeAspect;
                } else {
                    s[4] = planeAspect / record.texAspect;
                    s[5] = 1;
                }
            } else {
                s[4] = 1;
                s[5] = 1;
            }

            s[6] = vx;
            s[7] = vy;
            s[8] = b.height > 0 ? b.width / b.height : 1;
            s[9] = record.opacity;
            s[10] = 0; // padding out to the 48-byte struct
            s[11] = 0;

            // Only write (and draw) when something actually changed.
            const last = record.lastUniform;
            let changed = false;
            for (let i = 0; i < PLANE_UNIFORM_FLOATS; i++) {
                if (last[i] !== s[i]) {
                    changed = true;
                    break;
                }
            }
            if (changed) {
                last.set(s);
                this.device.queue.writeBuffer(record.uniformBuffer, 0, s);
                dirty = true;
            }

            // Effect uniforms get the same treatment, which is why a tween on
            // plane.uniforms needs no redraw call: the value changing is the
            // dirty signal. Null until the shader compiles, and stays null for
            // an effect that declared no uniforms.
            const effectLayout = record.effectLayout;
            if (effectLayout && record.effectUniformBuffer && record.lastEffectUniform) {
                const floats = effectLayout.floats;
                if (this.effectScratch.length < floats) {
                    this.effectScratch = new Float32Array(floats);
                }

                const e = this.effectScratch;
                pack(effectLayout, record.uniformValues, e);

                const lastEffect = record.lastEffectUniform;
                let effectChanged = false;
                for (let i = 0; i < floats; i++) {
                    if (lastEffect[i] !== e[i]) {
                        effectChanged = true;
                        break;
                    }
                }

                if (effectChanged) {
                    lastEffect.set(e.subarray(0, floats));
                    this.device.queue.writeBuffer(record.effectUniformBuffer, 0, e, 0, floats);
                    dirty = true;
                }
            }

            // The one thing no dirty check can observe: a shader reading
            // scene.time while nothing in JS moves.
            if (record.animated) dirty = true;
        }

        return dirty;
    }

    /**
     * Move a plane to the end of the iteration order, so it paints over every
     * other plane. `Set` preserves insertion order, so re-inserting is O(1)
     * and needs no sort or stored depth.
     */
    bringToFront(record: PlaneRecord): void {
        if (!this.records.delete(record)) return;
        this.records.add(record);
    }

    getRecords(): IterableIterator<PlaneRecord> {
        return this.records.values();
    }

    destroyAll(): void {
        for (const record of this.records) {
            record.texture?.destroy();
            record.uniformBuffer.destroy();
            record.effectUniformBuffer?.destroy();
        }
        this.records.clear();
    }
}
