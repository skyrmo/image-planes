// The colour of the image at `uv`.
fn readImage(uv: vec2f) -> vec4f {
    return textureSample(uTexture, uSampler, uv);
}

// plane.velocity is in plane sizes. This converts it to image coordinates (uv).
fn velocityInUv() -> vec2f {
    return plane.velocity * plane.fitScale;
}

// Make `v` no longer than `maxLength`, keeping its direction.
fn capLength(v: vec2f, maxLength: f32) -> vec2f {
    let len = length(v);
    if (len <= maxLength) {
        return v;
    }
    return v * (maxLength / len);
}

// Where the current pixel is. fragmentMain fills it in before any brick runs.
// Not available in shape bricks: they run in the vertex shader, before pixels exist.
struct Pixel {
    planeUv: vec2f,   // 0..1 across the plane as you see it. (0, 0) = top-left of the frame
    screen: vec2f,    // position on the canvas, in real pixels
};

// WGSL FYI: variables outside a function need a word in < > saying who shares it.
var<private> pixel: Pixel;
