@fragment
fn fragmentMain(v: VertexOutput) -> @location(0) vec4f {
    // Shrink the 0..1 coordinates around the centre (0.5) by fitScale.
    let uv = (v.texcoord - 0.5) * plane.fitScale + 0.5;
    let c = textureSample(uTexture, uSampler, uv);
    return vec4f(c.rgb * plane.opacity, c.a * plane.opacity);
}
