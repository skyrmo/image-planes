export type Rect = { x: number; y: number; width: number; height: number };

// the possible ways to map the texture onto the plane.
export type PlaneFit = "cover" | "fill";

// the possible source of the plame image.
export type PlaneSource = string | Blob | HTMLImageElement | ImageBitmap;

export interface ImagePlanesOptions {
    // Smoothing for DOM-tracked planes.
    // 1 = exact follow (default), <1 = damped chase toward the tracked element.
    lerp?: number;
}

export interface AddPlaneOptions {
    // The DOM node the plane tracks.
    element: HTMLElement;

    // Texture source. (Optional when`element` is an<img>). — its decoded pixels
    source?: PlaneSource;

    // id for lookups.
    id?: number;

    // How the texture maps onto the plane rect. Default =  "cover"
    fit?: PlaneFit;

    // Per-plane override of the scene lerp.
    lerp?: number;
}

// the type for storing created textures.
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
