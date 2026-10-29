fn main(uv: vec2f) -> vec2f {
    // Below 1 would show past the image edge (and 0 would divide by zero).
    let zoom = max(my.zoom, 1.0);
    // Zoom in around the centre, which leaves spare image beyond the frame.
    let zoomed = (uv - 0.5) / zoom + 0.5;
    // How much spare image there is above and below.
    let margin = (zoom - 1.0) / (2.0 * zoom);
    // How far the plane is across the screen: -1 as its top edge enters at the
    // bottom, 1 as its bottom edge leaves at the top.
    let centreY = plane.rect.y + plane.rect.w * 0.5;
    let progress = clamp(centreY / (1.0 + plane.rect.w * 0.5), -1.0, 1.0);
    // strength is the share of the spare image to use (-1..1). The sign sets the direction.
    let pan = progress * margin * clamp(my.strength, -1.0, 1.0);
    return vec2f(zoomed.x, zoomed.y + pan);
}
