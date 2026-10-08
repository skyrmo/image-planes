fn main(rect: vec4f) -> vec4f {
    // How much to stretch in x and in y, from how fast the plane moves that way.
    let amount = min(abs(plane.velocity) * my.strength, vec2f(my.max));
    // Longer along the movement, thinner across it, so the area stays about the same.
    let scale = (1.0 + amount) / (1.0 + amount.yx);
    // Scale around the centre, so the plane stays where it is.
    let centre = rect.xy + rect.zw * 0.5;
    let size = rect.zw * scale;
    return vec4f(centre - size * 0.5, size);
}
