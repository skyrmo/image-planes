# image-planes

Draw WebGPU image planes that track DOM elements with scroll and layout.

## Install

    pnpm add image-planes

## Setup

Add a fixed canvas over the whole page:

```html
<canvas id="planes"></canvas>
```

```css
#planes {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
}
```

## Usage

```ts
import { ImagePlanes } from "image-planes";

const scene = await ImagePlanes.create(document.querySelector("#planes")!, {
    damping: 0, // 0 = follow exactly. Closer to 1 = follow more slowly.
});

for (const img of document.querySelectorAll("img")) {
    scene.addPlane({ element: img }); // or { element, source: "/photo.jpg", fit: "fill" }
}

scene.start();
```

## ImagePlane

`addPlane` returns a handle:

| Member            | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `ready`           | Promise that resolves when the image is on the GPU.                 |
| `bounds`          | `{ x, y, width, height }` in CSS px. Edit or tween it.              |
| `opacity`         | 0–1.                                                                |
| `effects`         | This plane's effect settings: `plane.effects.grayscale.amount = 1`. |
| `isTracking`      | `true` while the plane follows its element.                         |
| `untrack()`       | Stop following the element. `bounds` is now yours to animate.       |
| `track(element?)` | Follow again. Can be a different element.                           |
| `bringToFront()`  | Draw on top of the other planes.                                    |
| `remove()`        | Remove the plane and free its GPU memory.                           |

## Effects

Effects come as '**bricks**', small pieces of shader code that you stack on a plane. They're optional and you only import the bricks you use. Apps that dont import any, don't download any.

### 1. Give a plane a list of bricks

Each brick is a function. Call it, optionally with starting settings, and put the results in the plane's `effects` list:

```ts
import { ImagePlanes } from "image-planes";
import { parallax, motionBlur, grayscale } from "image-planes/effects";

const scene = await ImagePlanes.create(canvas, { damping: 0.8 });

// Make the list once and share it between planes.
const effects = [
    parallax(), // all defaults
    motionBlur({ strength: 0.5 }), // override one setting
    grayscale({ amount: 0 }), // start in full colour
];

for (const img of document.querySelectorAll("img")) {
    scene.addPlane({ element: img, effects });
}

scene.start();
```

### 2. Change settings later

Every plane gets its own copy of each brick's settings at `plane.effects.<brick>.<setting>`. Set them directly, or tween them:

```ts
const plane = scene.addPlane({ element: img, effects });

plane.effects.grayscale.amount = 1; // black and white, from the next frame
gsap.to(plane.effects.motionBlur, { strength: 2 }); // tween the brick's settings object
```

Changing one plane's settings doesn't affect the other planes, even when they share a list.

### Currently available bricks

| Brick              | What it does                                    | Settings (default)              | Image reads   |
| ------------------ | ----------------------------------------------- | ------------------------------- | ------------- |
| `stretch()`        | Stretches the plane along its movement.         | `strength` (2), `max` (0.5)     | 0             |
| `parallax()`       | Moves the image inside its frame as it scrolls. | `strength` (0.1), `zoom` (1.15) | 0             |
| `chroma()`         | Splits red and blue apart along the movement.   | `strength` (0.5)                | 3 × previous  |
| `motionBlur()`     | Smears the image along the movement.            | `strength` (1), `trail` (1)     | 12 × previous |
| `grayscale()`      | Fades to black and white.                       | `amount` (1), `contrast` (1)    | 0             |
| `roundedCorners()` | Rounds the plane's corners.                     | `radius` (0.1)                  | 0             |

### Rules

- **The list of bricks is fixed at plane creation.** Settings can change at any time, but you can't add or remove bricks later.
- **Each brick can be used only once per plane.**
- **Shaders are cached.** Planes with the same bricks (in the same order) share one compiled shader, whatever their settings.
- **Read bricks multiply.** Leave out bricks you don't use, because a brick with its strength at 0 still costs its reads. Eg, `chroma` + `motionBlur` is 3 × 12 = 36 image reads per pixel.
- **Movement bricks work best with damping.** `stretch`, `chroma` and `motionBlur` react to the plane’s speed. A damping or smooth scrolling makes them look smoother.

## Every frame

`onBeforeRender` runs your callback at the start of every frame. Use it to drive anything that moves the page, like a smooth-scroll library.

```ts
const unsubscribe = scene.onBeforeRender((time, dt) => {
    // runs before planes are measured, e.g. lenis.raf(time)
});
```

`scene.stop()` pauses the loop. `scene.destroy()` stops it and removes listeners.
