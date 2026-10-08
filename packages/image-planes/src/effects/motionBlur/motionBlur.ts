import type { Brick } from "../../types";
import motionBlurShaderSource from "./motionBlur.wgsl?raw";

export interface MotionBlurOptions {
    /** Length of the smear per unit of speed. Default 1. */
    strength?: number;
    /** Where the smear sits. 1 = behind the movement, 0 = centred. Default 1. */
    trail?: number;
}

/** Smears the image along the plane's movement. Kind: read. Image reads: 12 × prev. */
export function motionBlur({ strength = 1, trail = 1 }: MotionBlurOptions = {}): Brick {
    return {
        name: "motionBlur",
        kind: "read",
        settings: { strength, trail },
        wgsl: motionBlurShaderSource,
    };
}
