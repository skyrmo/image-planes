struct PlaneUniforms {
    rect: vec4f,
    opacity: f32,
    fitScale: vec2f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texcoord: vec2f,
};

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> plane: PlaneUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    // Cover-fit: sample a centred UV window whose aspect matches the plane
    // rect, so pixels line up with an object-fit: cover <img>. fitScale is
    // (1, 1) for "fill".
    let uv = (input.texcoord - 0.5) * plane.fitScale + 0.5;
    let color = textureSample(myTexture, mySampler, uv);

    return vec4f(color.rgb * plane.opacity, color.a * plane.opacity);
}
