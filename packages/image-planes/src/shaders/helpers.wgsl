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
