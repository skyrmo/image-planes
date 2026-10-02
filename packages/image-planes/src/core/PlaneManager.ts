import { rectFromElement } from "../utils/utils";
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

    createRecord(element: HTMLElement): PlaneRecord {
        const uniformBuffer = this.device.createBuffer({
            size: PLANE_UNIFORM_FLOATS * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const record: PlaneRecord = {
            element,
            bounds: rectFromElement(element),
            uniformBuffer,
            bindGroup: this.renderer.createPlaneBindGroup(uniformBuffer),
        };

        this.records.add(record);

        return record;
    }

    update(): void {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        for (const record of this.records) {
            const b = record.bounds;
            const s = this.scratch;
            // CSS px → clip space.
            s[0] = (b.x / vw) * 2 - 1;
            s[1] = 1 - ((b.y + b.height) / vh) * 2;
            s[2] = (b.width / vw) * 2;
            s[3] = (b.height / vh) * 2;
            this.device.queue.writeBuffer(record.uniformBuffer, 0, s);
        }
    }
}
