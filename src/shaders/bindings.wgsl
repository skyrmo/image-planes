// Fragment-stage bindings, shared by the default fragment shader and by every
// effect. Groups are split by how often they change: 0 is scene-wide and bound
// once per pass, 1 is per plane.

@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var uTexture: texture_2d<f32>;
@group(1) @binding(1) var<uniform> plane: PlaneUniforms;
@group(1) @binding(2) var uTexture2: texture_2d<f32>;
