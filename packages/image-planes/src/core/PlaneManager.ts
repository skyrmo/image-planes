import type { PlaneFit } from "../types";
import { rectFromElement } from "../utils";
import type { PlaneRecord } from "./records";
import type { Renderer } from "./Renderer";

export const PLANE_UNIFORM_FLOATS = 12;

function writeIfChanged(
    device: GPUDevice,
    buffer: GPUBuffer,
    last: Float32Array,
    next: Float32Array,
): boolean {
    for (let i = 0; i < next.length; i++) {
        if (last[i] !== next[i]) {
            last.set(next); // remember what we're about to send
            device.queue.writeBuffer(buffer, 0, next);
            return true;
        }
    }
    return false;
}

export class PlaneManager {
    private device: GPUDevice;
    private renderer: Renderer;
    private scratch = new Float32Array(PLANE_UNIFORM_FLOATS);
    readonly records = new Set<PlaneRecord>();
    private orderChanged = false;
    private damping: number;

    constructor(device: GPUDevice, renderer: Renderer, damping: number) {
        this.device = device;
        this.renderer = renderer;
        this.damping = damping;
    }

    createRecord(element: HTMLElement, fit: PlaneFit): PlaneRecord {
        const uniformBuffer = this.device.createBuffer({
            size: PLANE_UNIFORM_FLOATS * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bounds = rectFromElement(element);

        const record: PlaneRecord = {
            element,
            bounds: bounds,
            uniformBuffer,
            bindGroup: null,
            texture: null,
            texAspect: 1,
            hasTexture: false,
            fit,
            opacity: 1,
            tracking: true,
            handle: null,
            lastUniform: new Float32Array(PLANE_UNIFORM_FLOATS).fill(NaN),
            prevX: bounds.x,
            prevY: bounds.y,
        };

        this.records.add(record);
        return record;
    }

    attachTexture(record: PlaneRecord, texture: GPUTexture, aspect: number): void {
        record.texture = texture;
        record.texAspect = aspect;
        record.bindGroup = this.renderer.createPlaneBindGroup(texture, record.uniformBuffer);
        record.hasTexture = true;
    }

    update(dtRatio: number): boolean {
        let dirty = this.orderChanged; // see 8.3
        this.orderChanged = false;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        for (const record of this.records) {
            const b = record.bounds;
            // Untracked planes: the user owns bounds, so leave them alone.
            if (record.tracking) {
                const r = record.element.getBoundingClientRect();
                if (this.damping <= 0 || !record.hasTexture) {
                    // Copy exactly. Also used before the image arrives, so a plane never
                    // "slides in" from where its element was when it was created.
                    b.x = r.x;
                    b.y = r.y;
                    b.width = r.width;
                    b.height = r.height;
                } else {
                    // Close a fraction of the gap each frame. The pow() makes it the same speed at 60 or 120fps.
                    const k = Math.max(1 - this.damping, 0.01);
                    const a = 1 - Math.pow(1 - k, dtRatio);
                    b.x += (r.x - b.x) * a;
                    b.y += (r.y - b.y) * a;
                    b.width += (r.width - b.width) * a;
                    b.height += (r.height - b.height) * a;
                    // Easing never quite arrives. Snap when close, or dirty checking never settles.
                    if (
                        Math.abs(r.x - b.x) < 0.05 &&
                        Math.abs(r.y - b.y) < 0.05 &&
                        Math.abs(r.width - b.width) < 0.05 &&
                        Math.abs(r.height - b.height) < 0.05
                    ) {
                        b.x = r.x;
                        b.y = r.y;
                        b.width = r.width;
                        b.height = r.height;
                    }
                }
            }

            const perFrame = Math.max(dtRatio, 0.5); // floored so a tiny dt can't spike it
            const vx = b.width > 0 ? (b.x - record.prevX) / b.width / perFrame : 0;
            const vy = b.height > 0 ? (b.y - record.prevY) / b.height / perFrame : 0;
            record.prevX = b.x;
            record.prevY = b.y;

            const s = this.scratch;
            // CSS px → clip space.
            s[0] = (b.x / vw) * 2 - 1;
            s[1] = 1 - ((b.y + b.height) / vh) * 2;
            s[2] = (b.width / vw) * 2;
            s[3] = (b.height / vh) * 2;

            const planeAspect = b.height > 0 ? b.width / b.height : 1;

            if (record.fit === "fill") {
                s[4] = 1;
                s[5] = 1; // use the whole image, stretched
            } else if (planeAspect > record.texAspect) {
                s[4] = 1;
                s[5] = record.texAspect / planeAspect; // frame is wider: crop top and bottom
            } else {
                s[4] = planeAspect / record.texAspect;
                s[5] = 1; // frame is taller: crop the sides
            }

            s[6] = vx;
            s[7] = vy;
            s[8] = planeAspect; // width / height, already worked out for the cover fit
            s[9] = record.opacity;

            dirty =
                writeIfChanged(this.device, record.uniformBuffer, record.lastUniform, s) || dirty;
        }
        return dirty;
    }

    // Planes draw in Set insertion order, later on top.
    bringToFront(record: PlaneRecord): void {
        this.records.delete(record);
        this.records.add(record);
        this.orderChanged = true;
    }

    remove(record: PlaneRecord): void {
        if (!this.records.delete(record)) return;
        record.texture?.destroy();
        record.uniformBuffer.destroy();
        this.orderChanged = true;
    }

    has(record: PlaneRecord): boolean {
        return this.records.has(record);
    }
}
