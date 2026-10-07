export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export interface AddPlaneOptions {
    element: HTMLElement; // DOM element
    source?: PlaneSource;
    fit?: PlaneFit;
    /** Effect bricks, e.g. `[parallax(), grayscale()]`. Fixed once the plane is created. */
    effects?: Brick[];
}

export type BeforeRenderCallback = (time: number, dt: number) => void;

export type PlaneSource = string | Blob | HTMLImageElement | ImageBitmap;

export type PlaneFit = "cover" | "fill";

export interface ImagePlanesOptions {
    /** 0 = follow exactly (default). */
    damping?: number;
}

export type BrickKind = "shape" | "uv" | "read" | "color";

export type EffectSettings = Record<string, number>;

export interface Brick {
    name: string;
    kind: BrickKind;
    settings: EffectSettings;
    wgsl: string;
}
