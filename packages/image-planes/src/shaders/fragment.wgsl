@fragment
fn fragmentMain(v: VertexOutput) -> @location(0) vec4f {
    // Shrink the 0..1 coordinates around the centre (0.5) by fitScale. For Object Fill.
    let uv = (v.texcoord - 0.5) * plane.fitScale + 0.5;
    return textureSample(uTexture, uSampler, uv);
}
