// The numbers each plane sends to the GPU.
struct PlaneUniforms {
    rect: vec4f,       // x, y (bottom-left corner), width, height (in clip space)
    fitScale: vec2f,   // object-fit cover
    velocity: vec2f,   //
    aspect: f32,       // width / height
    opacity: f32,      // range 0..1
    // Below this line, buildShader adds one f32 per effect setting.
    // @settings
};

// What vertex shader sends to fragment shader.
struct VertexOutput {
    @builtin(position) position: vec4f,   // where the corner goes
    @location(0) texcoord: vec2f,         // where we are on the image
};
