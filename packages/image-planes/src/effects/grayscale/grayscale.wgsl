fn main(color: vec4f) -> vec4f {
    // How bright the colour looks. Rec.601 weights, for colours not in linear light.
    let luma = dot(color.rgb, vec3f(0.299, 0.587, 0.114));

    // Mid-grey of a premultiplied colour is 0.5 × alpha, not 0.5.
    let pivot = 0.5 * color.a;

    // Contrast pushes away from mid-grey. Clamped so grey stays between 0 and alpha.
    let grey = clamp((luma - pivot) * my.contrast + pivot, 0.0, color.a);
    return vec4f(mix(color.rgb, vec3f(grey), my.amount), color.a);
}
