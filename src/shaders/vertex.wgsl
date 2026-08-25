struct PlaneUniforms {
    rect: vec4f,
    opacity: f32,
    fitScale: vec2f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texcoord: vec2f,
};

@group(0) @binding(2) var<uniform> plane: PlaneUniforms;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var corner = array<vec2f, 4>(
        vec2f(0.0, 0.0),
        vec2f(1.0, 0.0),
        vec2f(0.0, 1.0),
        vec2f(1.0, 1.0)
    );

    let uv = corner[vertexIndex];
    let ndc = plane.rect.xy + uv * plane.rect.zw;

    var output: VertexOutput;
    output.position = vec4f(ndc, 0.0, 1.0);
    output.texcoord = vec2f(uv.x, 1.0 - uv.y);
    return output;
}
