/** A rectangle in CSS pixels, relative to the viewport. */
export type Rect = { x: number; y: number; width: number; height: number };

/** How a texture is mapped onto its plane rect. */
export type PlaneFit = "cover" | "fill";

/** Anything a plane texture can be created from. */
export type PlaneSource = string | Blob | HTMLImageElement | ImageBitmap;

export interface ImagePlanesOptions {
    /**
     * Scene-wide smoothing for how planes follow their tracked elements.
     * `0` (the default) follows exactly; higher values follow more slowly.
     * Fixed for the life of the scene — there is no per-plane value.
     */
    damping?: number;
}

export interface AddPlaneOptions {
    /** The DOM node the plane tracks each frame. */
    element: HTMLElement;

    /**
     * Texture source. Optional when `element` is an `<img>` — its already-decoded
     * pixels are used directly, with no re-fetch.
     */
    source?: PlaneSource;

    /** How the texture maps onto the plane rect. Fixed at creation. Default `"cover"`. */
    fit?: PlaneFit;
}
