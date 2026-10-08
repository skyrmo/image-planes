fn main(uv: vec2f) -> vec4f {
    // Cap the split: a big one looks broken rather than fast.
    const MAX_OFFSET = 0.05;
    let offset = capLength(velocityInUv() * my.strength, MAX_OFFSET);
    let middle = prev(uv);
    let red = prev(uv + offset).r;
    let blue = prev(uv - offset).b;
    // Red and blue came from other spots, so at a transparent edge they can end up
    // bigger than alpha. Clamp to keep a valid premultiplied colour.
    return vec4f(min(red, middle.a), middle.g, min(blue, middle.a), middle.a);
}
