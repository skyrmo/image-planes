import type { PlaneFit, Rect } from "../types";

// Internal shapes carrying WebGPU handles. Deliberately kept out of `types.ts`
// (which the public entry point imports) so the emitted public .d.ts graph never
// references GPU globals — that would force every consumer to supply matching
// WebGPU type declarations. See README "Development".

// Internal: an uploaded texture plus the dimensions it was created at.
export interface ManagedTexture {
    texture: GPUTexture;
    width: number;
    height: number;
    format: GPUTextureFormat;
}

/**
 * Internal per-plane record. The public API wraps this in an ImagePlane handle;
 * `bounds` is a stable object mutated in place so animation libraries can hold
 * a reference to it (e.g. gsap.to(plane.bounds, ...)).
 */
export interface PlaneRecord {
    id: number;
    texture: GPUTexture | null;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup | null;
    bounds: Rect;
    opacity: number;
    trackedEl: HTMLElement | null;

    // When true, the render loop pulls bounds from trackedEl each frame (scroll
    // following). When false, the consumer owns bounds during a flight and the
    // loop leaves them alone.
    trackBounds: boolean;
    fit: PlaneFit;

    // Per-plane lerp override; null falls back to the scene option.
    lerp: number | null;

    // Texture aspect ratio (w/h), for cover-fit. 1 until the texture loads.
    texAspect: number;

    // True once the texture is uploaded; undrawn until then.
    ready: boolean;

    // True once bounds have been seeded from the element at least once.
    seeded: boolean;

    // Last values written to the uniform buffer, for dirty-checking.
    lastUniform: Float32Array;
}
