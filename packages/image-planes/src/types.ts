export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export interface AddPlaneOptions {
    element: HTMLElement; // DOM element
    source?: PlaneSource;
}

export type BeforeRenderCallback = (time: number, dt: number) => void;

export type PlaneSource = string | Blob | HTMLImageElement | ImageBitmap;
