// The numbers each plane sends to the GPU.
struct PlaneUniforms {
    rect: vec4f,       // x, y (bottom-left corner), width, height (in clip space)
    fitScale: vec2f,   // object-fit cover
    velocity: vec2f,   //
    aspect: f32,       // width / height
    opacity: f32,      // range 0..1
};  // 4+2+2+1+1 = 10 floats = 40 bytes, rounded up to 48

// What vertex shader sends to fragment shader.
struct VertexOutput {
    @builtin(position) position: vec4f,   // where the corner goes
    @location(0) texcoord: vec2f,         // where we are on the image
};
