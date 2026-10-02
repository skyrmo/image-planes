import type { Rect } from "../types";

export interface PlaneRecord {
    element: HTMLElement;
    bounds: Rect; // where the plane is, in px. Mutated in place. NEVER REPLACED.
    uniformBuffer: GPUBuffer; // 48 bytes = PlaneUniforms
    bindGroup: GPUBindGroup | null; //
    texture: GPUTexture | null;
    texAspect: number;
    hasTexture: boolean;
}
