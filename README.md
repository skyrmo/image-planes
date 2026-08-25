# image-planes

WebGPU image planes that track DOM elements. **Bring your own animation library.**

Zero runtime dependencies. ESM only. ~13 KB built.

## Install

```bash
npm install image-planes
```

## Quick start

```ts
import { ImagePlanes } from "image-planes";

const scene = new ImagePlanes(canvasEl, {
    lerp: 0.12, // optional bounds smoothing (1 = exact follow, <1 = damped chase)
});
await scene.init(); // rejects if WebGPU is unavailable

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
against the viewport:

```css
canvas {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
}
```

## Animating a plane ("flight")

`plane.bounds` is a **stable object mutated in place**, so animation libraries can
hold a reference to it and tween its fields directly. `detach()` hands you
ownership of bounds; `attach()` gives it back to the DOM tracker.

```ts
import { rectFromElement } from "image-planes";

plane.detach(); // you own bounds now — the render loop stops tracking

gsap.timeline({ onComplete: () => plane.attach(targetEl) })
    .to(plane.bounds, { ...rectFromElement(targetEl), duration: 0.9 })
    .to(otherPlane, { opacity: 0 }, 0);
```

`attach(el)` optionally re-anchors to a _different_ element than the one the plane
started on — which is how an image "moves" from a gallery thumbnail to an article
header and then tracks the new element on scroll.

## Notes

- **Rendering is skipped when nothing changed.** The scene dirty-checks each
  plane's uniforms and skips the GPU submit entirely on idle frames. Call
  `scene.requestRender()` if you mutate something it can't see.
- **`addPlane` returns synchronously**, but the plane isn't drawn until its texture
  uploads (`await plane.ready`). Keep the native `<img>` visible until then and it
  doubles as the placeholder.
- **No WebGPU?** `scene.init()` rejects — keep your native images visible and skip
  the GPU layer entirely. The page should work without it.
- **Frame-rate independent smoothing.** The damped chase is exponential and scaled
  by delta time, so `lerp` behaves the same at 60Hz and 120Hz.

## License

MIT
