fn main(uv: vec2f) -> vec4f {
    // How many reads to average. A constant, so every pixel loops the same number of times.
    const SAMPLES = 12;
    // Cap the smear. Past the image edge, reads repeat the edge pixel, so an
    // uncapped fast fling would streak it across the whole plane.
    const MAX_LENGTH = 0.88;
    let dir = capLength(velocityInUv() * my.strength, MAX_LENGTH);
    // trail 1: t goes 0 → 1, only spots BEHIND the movement, like a camera.
    // trail 0: t goes -0.5 → 0.5, centred on where the plane is now.
    let start = my.trail * 0.5 - 0.5;
    var total = vec4f(0.0);
    for (var i = 0; i < SAMPLES; i++) {
        let t = start + f32(i) / f32(SAMPLES - 1);
        total += prev(uv + dir * t);
    }
    return total / f32(SAMPLES);
}
