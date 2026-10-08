import type { Brick } from "../../types";
import stretchShaderSource from "./stretch.wgsl?raw";

export interface StretchOptions {
    /** How much the plane stretches per unit of speed. Default 2. */
    strength?: number;
    /** The most it can stretch: 0.5 = 1.5 times as long. Default 0.5. */
    max?: number;
}

/** Stretches the plane along its movement and squashes it across. Kind: shape. Image reads: 0. */
export function stretch({ strength = 2, max = 0.5 }: StretchOptions = {}): Brick {
    return {
        name: "stretch",
        kind: "shape",
        settings: { strength, max },
        wgsl: stretchShaderSource,
    };
}
