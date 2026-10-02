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
}

export type BeforeRenderCallback = (time: number, dt: number) => void;

export type PlaneSource = string | Blob | HTMLImageElement | ImageBitmap;

export type PlaneFit = "cover" | "fill";
