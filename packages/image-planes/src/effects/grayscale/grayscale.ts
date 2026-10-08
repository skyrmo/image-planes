import type { Brick } from "../../types";
import grayscaleShaderSource from "./grayscale.wgsl?raw";

export interface GrayscaleOptions {
    /** 0 = full colour, 1 = black and white. Default 1. */
    amount?: number;
    /** Contrast of the black-and-white version. 1 = unchanged. Default 1. */
    contrast?: number;
}

/** Fades the image to black and white. Kind: color. Image reads: 0. */
export function grayscale({ amount = 1, contrast = 1 }: GrayscaleOptions = {}): Brick {
    return {
        name: "grayscale",
        kind: "color",
        settings: { amount, contrast },
        wgsl: grayscaleShaderSource,
    };
}
