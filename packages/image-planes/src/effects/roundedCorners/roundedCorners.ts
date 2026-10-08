import type { Brick } from "../../types";
import roundedCornersShaderSource from "./roundedCorners.wgsl?raw";

export interface RoundedCornersOptions {
    /** Corner radius, as a fraction of the plane's shorter side. 0 = square, 0.5 = fully round ends. Default 0.1. */
    radius?: number;
}

/** Rounds off the corners of the plane. Stays fixed to the frame. Kind: color. Image reads: 0. */
export function roundedCorners({ radius = 0.1 }: RoundedCornersOptions = {}): Brick {
    return {
        name: "roundedCorners",
        kind: "color",
        settings: { radius },
        wgsl: roundedCornersShaderSource,
    };
}
