# image-planes

WebGPU image planes that track DOM elements. **Bring your own animation library.**

Zero runtime dependencies. ESM only. ~22 KB built, ~7 KB gzipped.

## Install

```bash
npm install image-planes
```

## Quick start

```ts
import { ImagePlanes } from "image-planes";

let scene: ImagePlanes = await ImagePlanes.create(canvasEl, {
    damping: 0.88, // optional smoothing; 0 (default) follows exactly
});

// Planes anchor to DOM elements. If the element is an <img>, its already-decoded
// pixels are used directly — no re-fetch.
const plane = scene.addPlane({ element: imgEl, fit: "cover" });

// Tick your own scroll/animation libraries each frame:
scene.onBeforeRender((time) => {
    lenis.raf(time);
    gsap.updateRoot(time / 1000);
});

scene.start();
```

The canvas must be a full-viewport fixed layer — plane positions are computed
against the viewport, and the canvas is sized from it. `create()` warns to the
console if the canvas isn't positioned this way:

```css
canvas {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
}
```

## Animating a plane

`plane.bounds` is a **stable object mutated in place**, so animation libraries can
hold a reference to it and tween its fields directly. `untrack()` stops the render
loop following the DOM, leaving `bounds` yours to animate; `track()` hands it back.

```ts
import { rectFromElement } from "image-planes";

plane.untrack(); // you own bounds now — the render loop stops following the DOM
plane.bringToFront(); // draw it over everything else while it moves

const tween = gsap
    .timeline({ onComplete: () => plane.track(targetEl) })
    .to(plane.bounds, { ...rectFromElement(targetEl), duration: 0.9 })
    .to(otherPlane, { opacity: 0 }, 0);
```

`track(el)` optionally re-anchors to a _different_ element than the one the plane
started on — which is how an image "moves" from a gallery thumbnail to an article
header and then follows the new element on scroll.

> **Kill your tween before re-tracking.** `plane.bounds` is the same object for the
> plane's whole life, so if you call `track()` while an animation is still writing
> to it, the animation and the render loop will both write it every frame and the
> plane will visibly fight itself. On an interrupted flight, `tween.kill()` first.

## Shader effects

A plane can be drawn with a custom fragment shader. An effect is plain data,
strings and numbers, so it can live anywhere and be shared between planes.

```ts
const pixelateWipe = {
    uniforms: { progress: -0.05, blocks: 32 },
    fragment: `
        fn effectMain(fx: EffectIn) -> vec4f {
            let grid = vec2f(u.blocks);
            let snapped = (floor(fx.uv * grid) + 0.5) / grid;
            let mask = 1.0 - smoothstep(u.progress - 0.02, u.progress + 0.02, fx.planeUv.y);
            return mix(sample(fx.uv), sample(snapped), mask);
        }`,
};

const plane = scene.addPlane({ element: imgEl, effect: pixelateWipe });

imgEl.addEventListener("click", () => {
    gsap.to(plane.uniforms, { progress: 1.05, duration: 1 });
});
```

`plane.uniforms` is a live object mutated in place, exactly like `plane.bounds`.
Tween it and the plane redraws; there is nothing to push and no per-frame hook
to write. Each plane gets its own copy, so two planes sharing one imported
effect animate independently.

You write one function, `effectMain`. Cover-fit is applied to `fx.uv` before it
reaches you and premultiplied alpha is applied to what you return, because
getting either wrong doesn't throw, it just looks subtly wrong.

### What you can read

| Name | Meaning |
|---|---|
| `fx.uv` | Fit-corrected texture coords. Pass straight to `sample()`. |
| `fx.planeUv` | 0 to 1 across the plane's on-screen rect, y downward |
| `fx.position` | Pixel coordinates |
| `sample(uv)` | The plane's texture |
| `toUv(dir)` | Converts a plane-fraction direction to texture space |
| `plane.velocity` | How fast this plane is moving, in fractions of its own size per 60Hz frame |
| `plane.aspect` | `width / height` of the on-screen rect |
| `plane.fitScale`, `plane.opacity`, `plane.rect` | |
| `scene.time` | Seconds since the scene was created |
| `scene.resolution`, `scene.pointer`, `scene.dpr` | Viewport size and cursor in CSS px |
| `u.*` | Your uniforms |

`plane.velocity` comes from the damped chase, so it ramps and decays smoothly
and is correct for an untracked plane mid-flight. Scroll-direction motion blur:

```ts
const motionBlur = {
    constants: { SAMPLES: 12 },
    uniforms: { strength: 1.0 },
    fragment: `
        fn effectMain(fx: EffectIn) -> vec4f {
            let dir = toUv(plane.velocity) * u.strength;
            var acc = vec4f(0.0);
            for (var i = 0; i < SAMPLES; i++) {
                acc += sample(fx.uv + dir * (f32(i) / f32(SAMPLES - 1) - 0.5));
            }
            return acc / f32(SAMPLES);
        }`,
};
```

`toUv()` is not optional there. A direction in plane fractions has to go through
`fitScale` to become a texture-space offset, and skipping it points the blur the
wrong way with the wrong length.

### `constants` versus `uniforms`

`constants` are baked into the shader source as WGSL `const` declarations, for
values that must be known at compile time. A loop bound is the usual case, since
`SAMPLES` has to be constant for the loop to unroll.

`uniforms` are animatable. A `number` becomes an `f32`, and an array of 2, 3 or
4 numbers becomes the matching `vec2f` / `vec3f` / `vec4f`.

Both are read once, when the effect's pipeline compiles. Mutating
`effect.constants` afterwards does nothing; two sample counts means two effect
objects.

### Things that will catch you

- **One effect per plane.** There is no chaining. Combine effects by hand in a
  single `effectMain`. Effects are fixed at creation, like `fit`.
- **Don't name your parameter `in`.** It's a WGSL reserved word. `fx` is the
  convention here.
- **A shader that fails to compile rejects `plane.ready`**, with the failing
  lines of the generated source printed. Line numbers refer to that generated
  source, not to your snippet, because your `effectMain` sits after a prelude.
- **The plane isn't drawn until its shader compiles**, so it never flashes
  un-effected first.
- **Sampling outside 0 to 1 clamps**, so a multi-sample effect smears the border
  pixel at high strength.
- **`sample()` can't be called from non-uniform control flow.** That's a WGSL
  rule about texture sampling, not something this library imposes. Compute both
  branches and `mix()` instead of sampling inside an `if`.
- **A tweened uniform is its own redraw signal.** You only need
  `animated: true` for an effect driven purely by `scene.time`, where no JS
  value moves and there is nothing for the dirty check to notice. It opts that
  plane out of idle frames entirely.

## Notes

- **Rendering is skipped when nothing changed.** The scene dirty-checks each
  plane's uniforms, including effect uniforms, and skips the GPU submit entirely
  on idle frames. There is currently no public way to force a redraw for
  something it can't observe.
- **`addPlane` returns synchronously**, but the plane isn't drawn until its texture
  uploads (`await plane.ready`). Keep the native `<img>` visible until then and it
  doubles as the placeholder.
- **Draw order is the order planes were added.** There's no depth buffer and no
  z-index — later planes paint over earlier ones. `plane.bringToFront()` moves one
  to the top.
- **No WebGPU?** `ImagePlanes.create()` rejects. Keep your native images visible
  and skip the GPU layer entirely; the page should work without it. A rejection
  after the adapter exists means something actually broke rather than the
  browser being unsupported, and you shouldn't swallow it.
- **Frame-rate independent smoothing.** The damped chase is exponential and scaled
  by delta time, so `damping` behaves the same at 60Hz and 120Hz. Hooks receive the
  clamped frame delta as a second argument (`(time, dt) => …`) if you want the same
  protection for your own state.
- **Planes have no id.** The handle returned by `addPlane` is the only way to refer
  to one; `scene.planes` lists them in draw order.

## License

MIT
