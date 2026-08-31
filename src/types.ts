/** A rectangle in CSS pixels, relative to the viewport. */
export type Rect = { x: number; y: number; width: number; height: number };

/** How a texture is mapped onto its plane rect. */
export type PlaneFit = "cover" | "fill";

/** Anything a plane texture can be created from. */
export type PlaneSource = string | Blob | HTMLImageElement | ImageBitmap;

/**
 * A value a shader effect can declare as an animatable uniform. A `number`
 * becomes an `f32`; an array of 2, 3 or 4 numbers becomes the matching vecNf.
 */
export type UniformValue = number | number[];

export type UniformValues = Record<string, UniformValue>;

/**
 * A shader effect. Plain data: strings and numbers, no GPU types, so an effect
 * can be defined anywhere and shared between planes.
 *
 * Read once, when the effect's pipeline is compiled. Mutating `constants`, or
 * changing the shape of `uniforms`, afterwards does nothing. Animate values
 * through `plane.uniforms` instead.
 */
export interface EffectDefinition {
    /**
     * WGSL defining `fn effectMain(fx: EffectIn) -> vec4f`. Cover-fit and
     * premultiplied alpha are applied around it, so don't apply either here.
     */
    fragment: string;

    /**
     * Baked into the shader source as `const` declarations, for values that
     * have to be known at compile time. Loop bounds go here.
     */
    constants?: Record<string, number>;

    /** Initial values. Each plane gets its own live copy at `plane.uniforms`. */
    uniforms?: UniformValues;

    /**
     * Redraw every frame regardless of whether anything changed. Only needed
     * for effects driven purely by `scene.time`: a tweened uniform is already
     * its own redraw signal.
     */
    animated?: boolean;
}

export interface ImagePlanesOptions {
    /**
     * Scene-wide smoothing for how planes follow their tracked elements.
     * `0` (the default) follows exactly; higher values follow more slowly.
     * Fixed for the life of the scene — there is no per-plane value.
     */
    damping?: number;
}

/** Called once per animation frame, before planes are updated and drawn. */
export type BeforeRenderCallback = (time: number, dt: number) => void;

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

    /**
     * A shader effect for this plane. Fixed at creation, like `fit`. One effect
     * per plane; combine several by hand in a single `effectMain`.
     *
     * The plane is not drawn until the shader compiles, so it never appears
     * un-effected first. A shader that fails to compile rejects `plane.ready`.
     */
    effect?: EffectDefinition;
}
