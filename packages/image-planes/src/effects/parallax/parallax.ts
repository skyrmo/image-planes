import type { Brick } from "../../types";
import parallaxShaderSource from "./parallax.wgsl?raw";

export interface ParallaxOptions {
  /** Share of the spare image to move through, -1 to 1. The sign sets the direction. Default 0.4. */
  strength?: number;
  /** Zoom that creates spare image to move into. 1 = none. Higher zoom = more travel. Default 1.15. */
  zoom?: number;
}

/** Moves the image up and down inside its frame as the plane crosses the screen.
 *  Negative strength moves it with the scroll, positive against it. Kind: uv. Image reads: 0. */
export function parallax({ strength = 0.4, zoom = 1.15 }: ParallaxOptions = {}): Brick {
  return {
    name: "parallax",
    kind: "uv",
    settings: { strength, zoom },
    wgsl: parallaxShaderSource,
  };
}
