// The default fragment shader, used by every plane without an effect.

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    // Cover-fit: sample a centred UV window whose aspect matches the plane
    // rect, so pixels line up with an object-fit: cover <img>. fitScale is
    // (1, 1) for "fill".
    let uv = (input.texcoord - 0.5) * plane.fitScale + 0.5;
    let color = textureSample(uTexture, uSampler, uv);

    return vec4f(color.rgb * plane.opacity, color.a * plane.opacity);
}
