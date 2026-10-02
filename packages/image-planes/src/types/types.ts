export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export interface AddPlaneOptions {
    element: HTMLElement; // DOM element
}

export type BeforeRenderCallback = (time: number, dt: number) => void;
