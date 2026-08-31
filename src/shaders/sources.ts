import common from "./common.wgsl?raw";
import bindings from "./bindings.wgsl?raw";
import vertexMain from "./vertex.wgsl?raw";
import fragmentMain from "./fragment.wgsl?raw";
import effectPrelude from "./effect-prelude.wgsl?raw";
import effectEntry from "./effect-entry.wgsl?raw";

/**
 * WGSL has no imports, so shaders are assembled by concatenation. The point is
 * that `PlaneUniforms` exists once, in common.wgsl, rather than once per module
 * that needs it. Nothing checks that copies of a struct agree, and a mismatch
 * renders plausible garbage rather than failing.
 */

export const VERTEX_SOURCE = `${common}\n${vertexMain}`;

export const FRAGMENT_SOURCE = `${common}\n${bindings}\n${fragmentMain}`;

/** Everything an effect is compiled on top of. */
export const EFFECT_PRELUDE = `${common}\n${bindings}\n${effectPrelude}`;

/** Appended last, after the author's `effectMain`. */
export const EFFECT_ENTRY = effectEntry;
