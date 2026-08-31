// Everything an effect author can read, on top of common.wgsl and
// bindings.wgsl.
//
// These names become a public contract the moment anyone writes an effect
// against them. Adding a function here later is safe. Changing a struct field
// in common.wgsl is not, because the byte offsets move and nothing errors.
// See docs/shader-effects-design.md §3.

struct EffectIn {
    // Fit-corrected texture coords. Pass straight to sample().
    uv: vec2f,
    // 0 to 1 across the plane's on-screen rect, y downward.
    planeUv: vec2f,
    // Pixel coordinates.
    position: vec2f,
};

fn sample(uv: vec2f) -> vec4f {
    return textureSample(uTexture, uSampler, uv);
}

fn sample2(uv: vec2f) -> vec4f {
    return textureSample(uTexture2, uSampler, uv);
}

// Plane-fraction direction to texture-space direction. Skipping this points a
// directional effect the wrong way with the wrong length, and the result looks
// close enough to be missed.
fn toUv(dir: vec2f) -> vec2f {
    return dir * plane.fitScale;
}
