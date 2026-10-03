import type { PlaneFit } from "../types";
import { rectFromElement } from "../utils";
import type { PlaneRecord } from "./records";
import type { Renderer } from "./Renderer";

export const PLANE_UNIFORM_FLOATS = 12;

export class PlaneManager {
    private device: GPUDevice;
    private renderer: Renderer;
    private scratch = new Float32Array(PLANE_UNIFORM_FLOATS);
    readonly records = new Set<PlaneRecord>();

    constructor(device: GPUDevice, renderer: Renderer) {
        this.device = device;
        this.renderer = renderer;
    }

    createRecord(element: HTMLElement, fit: PlaneFit): PlaneRecord {
        const uniformBuffer = this.device.createBuffer({
            size: PLANE_UNIFORM_FLOATS * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const record: PlaneRecord = {
            element,
            bounds: rectFromElement(element),
            uniformBuffer,
            bindGroup: null,
            texture: null,
            texAspect: 1,
            hasTexture: false,
            fit,
            opacity: 1,
            tracking: true,
            handle: null,
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

    update(): void {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        for (const record of this.records) {
            const b = record.bounds;
            // Untracked planes: the user owns bounds, so leave them alone.
            if (record.tracking) {
                const r = record.element.getBoundingClientRect();
                b.x = r.x;
                b.y = r.y;
                b.width = r.width;
                b.height = r.height;
            }
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
            s[9] = record.opacity;
            this.device.queue.writeBuffer(record.uniformBuffer, 0, s);
        }
    }

    // Planes draw in Set insertion order, later on top; re-adding moves it to the end.
    bringToFront(record: PlaneRecord): void {
        this.records.delete(record);
        this.records.add(record);
    }

    remove(record: PlaneRecord): void {
        if (!this.records.delete(record)) return;
        record.texture?.destroy();
        record.uniformBuffer.destroy();
    }

    has(record: PlaneRecord): boolean {
        return this.records.has(record);
    }
}
