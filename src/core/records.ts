import type { PlaneFit, Rect } from "../types";
import type { ImagePlane } from "./ImagePlane";

/** Internal types that use WebGPU handles.
 *  Deliberately kept out of `types.ts` (which the public entry point imports)
 *  so the emitted public .d.ts graph never references GPU globals — that
 *  would force every consumer to supply matching WebGPU type declarations.
 */

/** @internal: an uploaded texture plus the dimensions it was created at. */
export interface ManagedTexture {
    texture: GPUTexture;
    width: number;
    height: number;
    format: GPUTextureFormat;
}

/**
 * @internal: per-plane record. The public API wraps this in an ImagePlane handle;
 * `bounds` is a stable object mutated in place and never reassigned, so
 * animation libraries can hold a reference to it. See docs/adr/0001.
 *
 * The record set in PlaneManager is the single collection of live planes —
 * `handle` lets the public `planes` list be derived from it rather than kept in
 * a second, separately-maintained set.
 */
export interface PlaneRecord {
    // The public handle wrapping this record. Null only between createRecord()
    // and the ImagePlane built a few lines later in addPlane(); non-null for the
    // record's entire observable lifetime.
    handle: ImagePlane | null;

    texture: GPUTexture | null;
    uniformBuffer: GPUBuffer;

    // Group 1: this plane's texture and uniforms. Null until the texture is
    // uploaded, which is also what keeps the plane out of the render pass.
    planeBindGroup: GPUBindGroup | null;

    // The pipeline this plane draws with, or null while it isn't drawable.
    // Plain planes get the renderer's shared default immediately; a plane with
    // an effect stays null until its shader compiles, so it never flashes
    // un-effected on the way there.
    pipeline: GPURenderPipeline | null;

    bounds: Rect;
    opacity: number;
    trackedEl: HTMLElement | null;

    // When true, the render loop pulls bounds from trackedEl each frame (scroll
    // following). When false, the consumer owns bounds and the loop leaves
    // them alone.
    tracking: boolean;

    fit: PlaneFit;

    // Texture aspect ratio (w/h), for cover-fit. 1 until the texture loads.
    texAspect: number;

    // True once the texture is uploaded; undrawn until then.
    ready: boolean;

    // True once bounds have been seeded from the element at least once.
    seeded: boolean;

    // Last values written to the uniform buffer, for dirty-checking.
    lastUniform: Float32Array;
}
