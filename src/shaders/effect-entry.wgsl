// Appended after the author's effectMain, so that function is always declared
// before this one calls it.
//
// Cover-fit on the way in and premultiplied alpha on the way out are applied
// here rather than by the author, because both fail silently when written by
// hand: a crop that is subtly off against the <img> beside it, or dark fringing
// on a transparent PNG. Neither throws, so neither is left to chance.

@fragment
fn fragmentMain(v: VertexOutput) -> @location(0) vec4f {
    var fx: EffectIn;
    fx.uv = (v.texcoord - 0.5) * plane.fitScale + 0.5;
    fx.planeUv = v.texcoord;
    fx.position = v.position.xy;

    let c = effectMain(fx);
    return vec4f(c.rgb * plane.opacity, c.a * plane.opacity);
}
