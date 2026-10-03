@group(1) @binding(1) var<uniform> plane: PlaneUniforms;

@vertex
fn vertexMain(@builtin(vertex_index) i: u32) -> VertexOutput {
    var corner = array<vec2f, 4>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
    let c = corner[i];

    let rect = plane.rect;

    var out: VertexOutput;

    // Stretch the unit square to the rect: start at the corner, add a fraction of the size.
    out.position = vec4f(rect.xy + c * rect.zw, 0.0, 1.0);

    // Clip space y goes UP but images go DOWN, so flip y for the image coordinate.
    out.texcoord = vec2f(c.x, 1.0 - c.y);
    return out;
}
