import type { PlaneFit, Rect, UniformValues } from "../types";
import type { UniformLayout } from "./uniforms";
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

    // Bounds at the end of the previous frame, for the velocity uniform. The
    // damped chase already lags the tracked element, so the difference between
    // these and `bounds` is a momentum signal rather than raw scroll delta.
    prevX: number;
    prevY: number;

    // Last values written to the uniform buffer, for dirty-checking.
    lastUniform: Float32Array;

    // Group 2. All four are null on a plane with no effect, and also on one
    // whose effect declares no uniforms, which gets no group 2 at all.
    effectLayout: UniformLayout | null;
    effectUniformBuffer: GPUBuffer | null;
    effectBindGroup: GPUBindGroup | null;
    lastEffectUniform: Float32Array | null;

    // The live object the consumer mutates, exactly like bounds. Always this
    // plane's own copy, never the effect definition's object: two planes
    // sharing one imported effect must not share one set of values. Empty on a
    // plane with no effect, where writing to it does nothing.
    uniformValues: UniformValues;

    // Redraw every frame regardless of the dirty check. The only way to drive
    // an effect from scene.time, where no JS value moves.
    animated: boolean;
}
