// The numbers each plane sends to the GPU.
struct PlaneUniforms {
    rect: vec4f,       // x, y (bottom-left corner), width, height — in clip space
    fitScale: vec2f,   // step 6: object-fit cover
    velocity: vec2f,   // step 9: how fast the plane moves
    aspect: f32,       // step 9: width / height
    opacity: f32,      // step 7
};  // 4+2+2+1+1 = 10 floats = 40 bytes, rounded up to 48

// What the vertex shader hands to the fragment shader.
struct VertexOutput {
    @builtin(position) position: vec4f,   // where the corner goes (required)
    @location(0) texcoord: vec2f,         // where we are on the image (0..1)
};
