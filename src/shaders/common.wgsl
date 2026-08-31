// Prepended to every shader this package builds: the default vertex and
// fragment modules, and the prelude each effect is compiled against. One copy,
// so PLANE_UNIFORM_SIZE in Renderer.ts is the only thing left to keep in step
// by hand.

struct SceneUniforms {
    resolution: vec2f,
    pointer: vec2f,
    time: f32,
    dpr: f32,
};

// 48 bytes. Field order is load-bearing and matches PLANE_UNIFORM_SIZE.
// See docs/shader-effects-design.md §4.
struct PlaneUniforms {
    rect: vec4f,
    fitScale: vec2f,
    velocity: vec2f,
    aspect: f32,
    opacity: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texcoord: vec2f,
};
