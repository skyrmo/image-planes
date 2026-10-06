@fragment
fn fragmentMain(v: VertexOutput) -> @location(0) vec4f {
    // Cover fit: shrink the 0..1 coordinates around the centre by fitScale.
    var uv = (v.texcoord - 0.5) * plane.fitScale + 0.5;

    uv = applyUv(uv);               // uv bricks: change WHERE we read
    var color = applyRead(uv);      // read bricks: read the image
    color = applyColor(color);      // color bricks: change the colour

    // Opacity: multiply all four channels, the premultiplied rule.
    return color * plane.opacity;
}
