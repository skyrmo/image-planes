import type { EffectSettings, Rect } from "../types";
import type { ImagePlane } from "./ImagePlane";
import type { SettingSlot } from "./settings";

export interface PlaneRecord {
    element: HTMLElement;
    bounds: Rect; // where the plane is, in px. Mutated in place. NEVER REPLACED.
    uniformBuffer: GPUBuffer; // 48 bytes = PlaneUniforms, more with effect settings
    bindGroup: GPUBindGroup | null; // null until image is loaded
    pipeline: GPURenderPipeline | null;
    texture: GPUTexture | null; // null until image is loaded
    texAspect: number;
    hasTexture: boolean;
    fit: "cover" | "fill";
    opacity: number;
    tracking: boolean;
    handle: ImagePlane | null;
    scratch: Float32Array<ArrayBuffer>;
    lastUniform: Float32Array<ArrayBuffer>;
    prevX: number;
    prevY: number;
    settings: SettingSlot[]; // where effect setting goes in the buffer
    effects: Record<string, EffectSettings>; // the live values: effects.grayscale.amount
}
