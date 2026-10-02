@fragment
fn fragmentMain(v: VertexOutput) -> @location(0) vec4f {
    return textureSample(uTexture, uSampler, v.texcoord);
}
