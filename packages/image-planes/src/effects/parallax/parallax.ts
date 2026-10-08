import type { Brick } from "../../types";
import parallaxShaderSource from "./parallax.wgsl?raw";

export interface ParallaxOptions {
    /** How far the image moves. Negative flips the direction. Default 0.1. */
    strength?: number;
    /** Zoom that creates spare image to move into. 1 = none. Default 1.15. */
    zoom?: number;
}

/** Moves the image up and down inside its frame as the plane scrolls. Kind: uv. Image reads: 0. */
export function parallax({ strength = 0.1, zoom = 1.15 }: ParallaxOptions = {}): Brick {
    return {
        name: "parallax",
        kind: "uv",
        settings: { strength, zoom },
        wgsl: parallaxShaderSource,
    };
}
