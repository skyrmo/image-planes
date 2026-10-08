import type { Brick } from "../../types";
import chromaShaderSource from "./chroma.wgsl?raw";

export interface ChromaOptions {
    /** How far red and blue split per unit of speed. Default 0.5. */
    strength?: number;
}

/** Splits red and blue apart along the plane's movement. Kind: read. Image reads: 3 × prev. */
export function chroma({ strength = 0.5 }: ChromaOptions = {}): Brick {
    return {
        name: "chroma",
        kind: "read",
        settings: { strength },
        wgsl: chromaShaderSource,
    };
}
