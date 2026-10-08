fn main(uv: vec2f) -> vec2f {
    // Below 1 would show past the image edge (and 0 would divide by zero).
    let zoom = max(my.zoom, 1.0);
    // Zoom in around the centre, which leaves spare image beyond the frame.
    let zoomed = (uv - 0.5) / zoom + 0.5;
    // How much spare image there is above and below.
    let margin = (zoom - 1.0) / (2.0 * zoom);
    // plane.rect.y moves smoothly from about -1 to 1 as the plane crosses the
    // screen, so it works as a free "scroll position".
    let pan = clamp(plane.rect.y * my.strength, -margin, margin);
    return vec2f(zoomed.x, zoomed.y + pan);
}
