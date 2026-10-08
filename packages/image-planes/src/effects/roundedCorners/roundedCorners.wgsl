fn main(color: vec4f) -> vec4f {
    // Measure in plane heights, so the corners are circles, not ovals.
    let size = vec2f(plane.aspect, 1.0);
    // This pixel, from the centre of the frame.
    let p = (pixel.planeUv - 0.5) * size;
    let r = my.radius * min(size.x, size.y);

    // How far past the rounded edge this pixel is: negative inside, positive outside.
    let q = abs(p) - (size * 0.5 - r);
    let d = length(max(q, vec2f(0.0))) - r;

    // How much d changes from one screen pixel to the next. Fade over that, for a smooth edge.
    let coverage = clamp(0.5 - d / fwidth(d), 0.0, 1.0);

    // Fade all four channels, like opacity (step 7). Premultiplied stays valid.
    return color * coverage;
}
