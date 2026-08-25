/** A rectangle in CSS pixels, relative to the viewport. */
export type Rect = { x: number; y: number; width: number; height: number };

/** How a texture is mapped onto its plane rect. */
export type PlaneFit = "cover" | "fill";

/** Anything a plane texture can be created from. */
export type PlaneSource = string | Blob | HTMLImageElement | ImageBitmap;

export interface ImagePlanesOptions {
    /**
     * Bounds smoothing for DOM-tracked planes.
     * 1 = exact follow (default), <1 = damped chase toward the tracked element.
     */
    lerp?: number;
}

export interface AddPlaneOptions {
    /** The DOM node the plane tracks each frame. */
    element: HTMLElement;

    /**
     * Texture source. Optional when `element` is an `<img>` — its already-decoded
     * pixels are used directly, with no re-fetch.
     */
    source?: PlaneSource;

    /** Stable id for lookups; auto-assigned if omitted. */
    id?: number;

    /** How the texture maps onto the plane rect. Default `"cover"`. */
    fit?: PlaneFit;

    /** Per-plane override of the scene `lerp`. */
    lerp?: number;
}
