// The vertex stage reads only the plane rect, so it declares that one binding
// rather than pulling in all of bindings.wgsl.
@group(1) @binding(1) var<uniform> plane: PlaneUniforms;

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
