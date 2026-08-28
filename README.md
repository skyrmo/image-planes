# image-planes

WebGPU image planes that track DOM elements. **Bring your own animation library.**

Zero runtime dependencies. ESM only. ~13 KB built.

## Install

```bash
npm install image-planes
```

## Quick start

```ts
import { ImagePlanes, WebGPUUnsupportedError } from "image-planes";

let scene: ImagePlanes;
try {
    scene = await ImagePlanes.create(canvasEl, {
        damping: 0.88, // optional smoothing; 0 (default) follows exactly
    });
} catch (error) {
    if (error instanceof WebGPUUnsupportedError) return; // keep the native <img>s
    throw error;
}

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

## Notes

- **Rendering is skipped when nothing changed.** The scene dirty-checks each
  plane's uniforms and skips the GPU submit entirely on idle frames. Call
  `scene.requestRender()` if you mutate something it can't see.
- **`addPlane` returns synchronously**, but the plane isn't drawn until its texture
  uploads (`await plane.ready`). Keep the native `<img>` visible until then and it
  doubles as the placeholder.
- **Draw order is the order planes were added.** There's no depth buffer and no
  z-index — later planes paint over earlier ones. `plane.bringToFront()` moves one
  to the top.
- **No WebGPU?** `ImagePlanes.create()` rejects with `WebGPUUnsupportedError` — keep your
  native images visible and skip the GPU layer entirely. The page should work
  without it. A `WebGPUInitError` means WebGPU exists but setup failed, which is a
  real fault rather than an unsupported browser.
- **Frame-rate independent smoothing.** The damped chase is exponential and scaled
  by delta time, so `damping` behaves the same at 60Hz and 120Hz. Hooks receive the
  clamped frame delta as a second argument (`(time, dt) => …`) if you want the same
  protection for your own state.
- **Planes have no id.** The handle returned by `addPlane` is the only way to refer
  to one; `scene.planes` lists them in draw order.

## Contributing

[ARCHITECTURE.md](./ARCHITECTURE.md) explains the internals — data flow, the
render loop, and the coordinate math. [CONTEXT.md](./CONTEXT.md) is the glossary,
and [docs/adr/](./docs/adr/) records why the load-bearing decisions were made.

## License

MIT
