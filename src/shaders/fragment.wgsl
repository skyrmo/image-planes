struct SceneUniforms {
    resolution: vec2f,
    pointer: vec2f,
    time: f32,
    dpr: f32,
};

struct PlaneUniforms {
    rect: vec4f,
    opacity: f32,
    fitScale: vec2f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texcoord: vec2f,
};

// Group 0 is scene-wide and bound once per pass; group 1 is per plane. These
// names and groupings are the ones an effect shader's generated prelude will
// declare, so keep the two in step.
@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var uTexture: texture_2d<f32>;
@group(1) @binding(1) var<uniform> plane: PlaneUniforms;
@group(1) @binding(2) var uTexture2: texture_2d<f32>;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    // Cover-fit: sample a centred UV window whose aspect matches the plane
    // rect, so pixels line up with an object-fit: cover <img>. fitScale is
    // (1, 1) for "fill".
    let uv = (input.texcoord - 0.5) * plane.fitScale + 0.5;
    let color = textureSample(uTexture, uSampler, uv);

    return vec4f(color.rgb * plane.opacity, color.a * plane.opacity);
}
