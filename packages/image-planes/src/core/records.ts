import type { Rect } from "../types";
import type { ImagePlane } from "./ImagePlane";

export interface PlaneRecord {
    element: HTMLElement;
    bounds: Rect; // where the plane is, in px. Mutated in place. NEVER REPLACED.
    uniformBuffer: GPUBuffer; // 48 bytes = PlaneUniforms
    bindGroup: GPUBindGroup | null; //
    texture: GPUTexture | null;
    texAspect: number;
    hasTexture: boolean;
    fit: "cover" | "fill";
    opacity: number;
    tracking: boolean;
    handle: ImagePlane | null;
    lastUniform: Float32Array<ArrayBuffer>;
    prevX: number;
    prevY: number;
}
