# image-planes architecture

The source of truth for how image-planes works inside, and how to change it safely. For using the library, see [README.md](README.md).

If this document and the code disagree, the code wins. Fix this document in the same change.

## 1. What it is

image-planes is a WebGPU library. It draws image "planes" on one fixed, full-viewport, transparent `<canvas>`. Each plane follows a DOM element (usually an `<img>` hidden with `opacity: 0`) as the page scrolls and the layout changes. Planes can have optional **'bricks'** for shader effects like parallax, motion blur or rounded corners.

- Browser only. It needs WebGPU: `initWebGPU` throws if `navigator.gpu`, an adapter, or a `"webgpu"` context is missing.
- No runtime dependencies. The package is `sideEffects: false`, so unused code (and unused bricks) is tree-shaken.

## 2. Repo layout and tooling

A pnpm workspace (`pnpm-workspace.yaml`) with two packages:

| Package                 | What it is                                                       |
| ----------------------- | ---------------------------------------------------------------- |
| `packages/image-planes` | The library, published as `image-planes`.                        |
| `playground`            | A private Vite test page (with gsap and lenis). Never published. |

```
image-planes/
  package.json                  ← root scripts: dev, build & typecheck.
  pnpm-workspace.yaml
  README.md                     ← user docs: install, API, bricks
  ARCHITECTURE.md               ← this file
  playground/
    index.html, main.ts, style.css
    public/                     ← test images 1–5.jpg
    vite.config.ts, tsconfig.json   ← point "image-planes" at the library's source
  packages/image-planes/
    package.json, tsconfig.json, vite.config.ts
    src/
      index.ts                  ← public exports of "image-planes"
      types.ts                  ← public types (Rect, Brick, AddPlaneOptions, ...)
      utils.ts                  ← rectFromElement, waitForImageReady
      core/
        ImagePlanes.ts          ← the scene: create, addPlane, frame loop
        ImagePlane.ts           ← public handle for one plane
        records.ts              ← PlaneRecord: internal state of one plane
        PlaneManager.ts         ← every frame: DOM → numbers → GPU buffers
        Renderer.ts             ← layouts, pipeline cache, drawing
        gpu.ts                  ← device and canvas setup
        texture.ts              ← image source → GPU texture
        settings.ts             ← where each brick setting sits in the buffer
        buildShader.ts          ← bricks → one WGSL shader
        buildShader.test.ts     ← tests for buildShader and settings
      shaders/
        common.wgsl             ← PlaneUniforms and VertexOutput structs
        bindings.wgsl           ← sampler, texture and uniform declarations
        helpers.wgsl            ← functions and values every brick can use
        vertex.wgsl             ← places the 4 corners
        fragment.wgsl           ← cover fit, bricks, opacity
        sources.ts              ← each .wgsl file as a string
      effects/                  ← published as "image-planes/effects"
        index.ts
        <name>/<name>.ts        ← one folder per brick: the options and defaults
        <name>/<name>.wgsl      ←                       the shader code
```

### Commands

Run these from the repo root:

| Command                           | What it does                                            |
| --------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                        | Runs the playground with the library's source.          |
| `pnpm build`                      | Builds the library into `packages/image-planes/dist`.   |
| `pnpm typecheck`                  | `tsc --noEmit` in every package.                        |
| `pnpm --filter image-planes test` | Runs the vitest tests. (The root has no `test` script.) |

### Toolchain

- TypeScript 7. `@typescript/typescript6` is also installed for `vite-plugin-dts`.
- Vite 8 in library mode, vitest 5, and `@webgpu/types`.
- The tsconfig is `strict`, with `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals` and `noUnusedParameters`. In practice:
  - No `enum`s and no constructor parameter properties.
  - Use `import type` for type-only imports.
- `.wgsl` files are imported as strings with `?raw` (typed by `vite/client`). The build inlines them, so users get plain JavaScript.

### Build output

`vite.config.ts` has two ES entries, plus `.d.ts` files from `vite-plugin-dts` (test files are left out):

| Import                 | File                   | Source                 |
| ---------------------- | ---------------------- | ---------------------- |
| `image-planes`         | `dist/image-planes.js` | `src/index.ts`         |
| `image-planes/effects` | `dist/effects.js`      | `src/effects/index.ts` |

### Playground wiring

`playground/vite.config.ts` (`resolve.alias`) and `playground/tsconfig.json` (`paths`) both point `image-planes` and `image-planes/effects` at the library's **source**, so edits reload instantly with no build.

- **Keep the two in sync.**
- In the alias list, `image-planes/effects` must come before `image-planes`, because the shorter name would also match the longer one.

## 3. The big picture

```
              ┌──────── ImagePlanes (the scene, public) ───────────┐
  user ─────► │ create() · addPlane() · start()/stop() · destroy() │
              │ onBeforeRender() · owns the frame loop             │
              │      │                         │                   │
              │      ▼                         ▼                   │
              │ PlaneManager               Renderer                │
              │ every plane's state        pipeline cache (one per │
              │ DOM → GPU buffers          brick list), drawing    │
              └────────────────────────────────────────────────────┘
                      ▲ addPlane calls buildShader(bricks) → WGSL text → Renderer.pipelineFor
  user ◄────── ImagePlane handle: bounds · opacity · effects · track() · remove() …
                      (wraps an internal PlaneRecord)
```

**One class, one job.** If you're not sure where code goes, ask whether it is **state** (`PlaneManager`, `PlaneRecord`), **drawing** (`Renderer`), or **building shader text** (`buildShader`, `settings`).

**`PlaneRecord` vs `ImagePlane`.** A `PlaneRecord` (`core/records.ts`) holds everything about one plane, GPU objects included. Users never see it. They get an `ImagePlane` handle that reads and writes the record and forwards `bringToFront`/`remove` to the `PlaneManager`.

| Module                 | Responsibility                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `core/ImagePlanes.ts`  | Public entry point. Sets up the GPU, creates planes, runs the frame loop, handles resize.                                        |
| `core/ImagePlane.ts`   | Public per-plane handle. Thin getters and setters over the record.                                                               |
| `core/records.ts`      | The `PlaneRecord` interface.                                                                                                     |
| `core/PlaneManager.ts` | Owns the `Set` of records (which is also the draw order). Creates records, attaches textures, and runs the per-frame `update()`. |
| `core/Renderer.ts`     | Bind group layouts, the shared sampler, the pipeline cache, and `render()`.                                                      |
| `core/gpu.ts`          | `initWebGPU` (adapter, device, context, error logging) and `configureCanvas`.                                                    |
| `core/texture.ts`      | `loadTexture`: any `PlaneSource` → `ImageBitmap` → premultiplied `rgba8unorm` texture.                                           |
| `core/settings.ts`     | `listSettings` (the buffer order of brick settings) and `planeFloats` (buffer size).                                             |
| `core/buildShader.ts`  | Joins the shader files and a plane's bricks into one WGSL module.                                                                |
| `shaders/*`            | The fixed parts of the shader. `sources.ts` exposes each file as a string.                                                       |
| `effects/*`            | The built-in bricks.                                                                                                             |
| `utils.ts`             | `rectFromElement`, `waitForImageReady` (both public).                                                                            |
| `types.ts`, `index.ts` | Public types and exports.                                                                                                        |

## 4. Lifecycle

### `ImagePlanes.create(canvas, { damping })`

1. `initWebGPU(canvas)`:
   - Requests an adapter and a device.
   - Logs uncaptured GPU errors as `[image-planes] …`, so they don't fail silently.
   - Gets the `"webgpu"` context and picks `navigator.gpu.getPreferredCanvasFormat()`.
2. `configureCanvas`:
   - Sets the canvas size to `window.innerWidth/innerHeight × devicePixelRatio`.
   - Configures the context with `alphaMode: "premultiplied"`.
3. The private constructor:
   - Creates the `Renderer` and the `PlaneManager` (with `damping`, which defaults to 0).
   - Adds a window `resize` listener that re-runs `configureCanvas` and forces a render.

### `scene.addPlane({ element, source?, fit?, effects? })`

1. **Source.** `source` defaults to `element` when it's an `<img>`. Otherwise `addPlane` throws.
2. **Shader text.** `buildShader(bricks)` writes the WGSL. It throws if a brick name appears twice.
3. **Record.** `planeManager.createRecord(element, fit ?? "cover", bricks)`:
   - Allocates the uniform buffer.
   - Copies each brick's `settings` into `record.effects[brick.name]`, so every plane has its own copy.
   - Measures the element.
   - Adds the record to the `Set`. New planes go on top.
4. **Two async jobs, in parallel.** Each one first checks `planeManager.has(record)`, in case the plane was removed meanwhile:
   - `loadTexture(...)` → `attachTexture` (creates the plane's bind group) and sets `needRender`. If the plane was removed, it destroys the texture instead.
   - `renderer.pipelineFor(code)` → sets `record.pipeline` and `needRender`.
5. **Handle.** It returns an `ImagePlane` handle. `plane.ready` resolves when both jobs finish. Until then, the renderer skips the plane.

### The frame loop (`ImagePlanes.loop`)

1. Re-arm `requestAnimationFrame` first, so an exception in a hook doesn't stop the loop forever.
2. `dt` = time since the last frame, clamped to 0.1–100 ms, so returning to a background tab doesn't jump. The first frame assumes 1000/60.
3. Run every `onBeforeRender(time, dt)` hook. This is where smooth-scroll libraries (lenis) and tweens move things.
4. `dirty = planeManager.update(dt / (1000/60))`. See §5.
5. If `dirty || needRender`, run `renderer.render(records)` and clear `needRender`. **Nothing is drawn on frames where nothing changed.**

`needRender` is set by `start()`, resize, a texture arriving, and a pipeline becoming ready. `bringToFront()` and `remove()` set `PlaneManager.orderChanged`, which makes the next `update()` return dirty.

### Stopping

- `stop()` cancels the loop. `start()` resumes it (and does nothing if it's already running).
- `destroy()` calls `stop()` and removes the resize listener. **It does not free plane textures, buffers or the device.** Call `plane.remove()` to free a plane's texture and uniform buffer.

## 5. Per-frame state sync (`PlaneManager.update`)

For each record, in draw order:

1. **Follow the element (tracked planes only).** Read `element.getBoundingClientRect()`.
   - **Copy it exactly** when `damping <= 0`, or when the texture hasn't loaded yet. The second case stops a plane from "sliding in" from where its element was when it was created.
   - **Otherwise ease towards it.** Each frame closes a fraction `a = 1 − (1 − k)^dtRatio` of the gap, where `k = max(1 − damping, 0.01)`. The `pow` makes the speed the same at 60 and 120 fps.
   - **Snap** once every side is within 0.05 px. Easing never quite arrives, so without the snap the dirty check would never settle.
   - **Untracked planes** (`untrack()`) are left alone: the user owns `bounds`.
2. **Velocity.** `(bounds.x − prevX) / bounds.width / max(dtRatio, 0.5)`, and the same for y.
   - The unit is **plane sizes per 60 fps frame**.
   - The direction is CSS: +y is down.
   - A plane with zero width or height gets 0.
3. **Pack the numbers** into `record.scratch`:
   - Position, converted from CSS px to clip space (see §6).
   - Cover-fit scale, velocity, aspect and opacity.
   - Then every brick setting, in `listSettings` order.
4. **`writeIfChanged`.** Compare `scratch` with `lastUniform`, which starts as NaN so the first frame always writes. Call `queue.writeBuffer` only if a number differs, and return whether it did. **This comparison is the whole dirty-checking system.** Anything that should cause a redraw must either end up in the uniform numbers or set `needRender`/`orderChanged`.

**`bounds` is mutated in place and never replaced.** The `ImagePlane.bounds` getter returns that same object, so `gsap.to(plane.bounds, …)` works. The same goes for `record.effects[name]` objects: `gsap.to(plane.effects.motionBlur, …)` works.

## 6. GPU layout and rendering

### Plane uniforms

`PlaneUniforms` in `shaders/common.wgsl`, packed by `PlaneManager.update`:

| Floats | Field      | Meaning                                                                                 |
| ------ | ---------- | --------------------------------------------------------------------------------------- |
| 0–3    | `rect`     | x, y of the **bottom-left** corner, then width and height, in clip space (−1..1, y up). |
| 4–5    | `fitScale` | Cover fit: the part of the image that is visible. `fill` = (1, 1).                      |
| 6–7    | `velocity` | See §5. Plane sizes per frame, +y down.                                                 |
| 8      | `aspect`   | Plane width / height.                                                                   |
| 9      | `opacity`  | 0..1.                                                                                   |
| 10+    | settings   | One `f32` per brick setting, named `<brick>_<setting>`, in `listSettings` order.        |

- `PLANE_BASE_FLOATS = 10` (`core/settings.ts`).
- `planeFloats(n)` rounds `10 + n` up to a multiple of 4, because uniform structs are sized in 16-byte blocks.
- `listSettings` is the **single source** of the settings order. `buildShader` uses it to write the struct fields, and `PlaneManager` uses it to fill the buffer, so the two can't disagree.

Clip-space conversion, with `vw = innerWidth` and `vh = innerHeight`:

```
x = b.x / vw * 2 - 1
y = 1 - (b.y + b.height) / vh * 2     // bottom edge, flipped
w = b.width / vw * 2
h = b.height / vh * 2
```

### Bind groups

Resources are grouped by how often they change:

| Group     | Binding | Contents                             | Visible to        | Set            |
| --------- | ------- | ------------------------------------ | ----------------- | -------------- |
| 0 — scene | 0       | `uSampler`: linear min/mag sampler   | fragment          | once per frame |
| 1 — plane | 0       | `uTexture`: the plane's image        | fragment          | once per plane |
| 1 — plane | 1       | `plane`: the plane's `PlaneUniforms` | vertex + fragment | once per plane |

The layouts are created once in the `Renderer` constructor, and every pipeline shares one pipeline layout.

### Pipelines

- `Renderer.pipelineFor(code)` caches pipelines in a `Map` keyed by the **full shader text**. Planes with the same bricks in the same order share one pipeline, whatever their settings.
- The map stores the `createRenderPipelineAsync` promise, so concurrent `addPlane` calls with the same list share one compile.
- The cache is never emptied.
- Settings: `topology: "triangle-strip"` and no vertex buffer. The vertex shader builds the 4 corners from `vertex_index`, and each plane is drawn with `draw(4)`.

### Drawing (`Renderer.render`)

1. Begin a pass on the current canvas texture and clear it to `[0, 0, 0, 0]`, so the page shows through.
2. Set group 0 once.
3. For each record in `Set` order (later records are drawn on top):
   - Skip it if it has no bind group or pipeline yet, or if its bounds have zero size.
   - Call `setPipeline` only when the pipeline differs from the previous plane's.
   - Set group 1 and call `draw(4)`.

### Colour: premultiplied alpha everywhere

- Textures are `rgba8unorm`, copied with `premultipliedAlpha: true`.
- The canvas is configured with `alphaMode: "premultiplied"`.
- The blend is `src * 1 + dst * (1 − srcAlpha)` for both colour and alpha.
- **Invariant: every colour in the shader stays premultiplied (r, g, b ≤ a).** Opacity and edge coverage multiply all four channels. "White" or "mid-grey" are relative to `a`, not to 1. See how `grayscale` and `chroma` keep this.

## 7. Shader assembly and bricks

### The `Brick` type

```ts
interface Brick {
  name: string; // valid WGSL identifier; also the plane.effects key
  kind: "shape" | "uv" | "read" | "color";
  settings: Record<string, number>; // starting values; each becomes one f32
  wgsl: string; // exactly one function, `main`
}
```

### Kinds

| Kind    | Changes                               | `main` signature                 | Runs in  | Called from  |
| ------- | ------------------------------------- | -------------------------------- | -------- | ------------ |
| `shape` | the plane's rectangle (clip space)    | `fn main(rect: vec4f) -> vec4f`  | vertex   | `applyShape` |
| `uv`    | **where** the image is read           | `fn main(uv: vec2f) -> vec2f`    | fragment | `applyUv`    |
| `read`  | **reads** the image, maybe many times | `fn main(uv: vec2f) -> vec4f`    | fragment | `applyRead`  |
| `color` | the colour that was read              | `fn main(color: vec4f) -> vec4f` | fragment | `applyColor` |

They always run in the order **shape → uv → read → color**. Within one kind, the order of the plane's list decides.

### Special words

`buildShader` rewrites three words with regular expressions before the GPU sees the code:

| Written in a brick | Becomes                                                        | Notes                                                                                |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `main`             | `<name>_main`                                                  | Every whole-word `main`.                                                             |
| `my.<setting>`     | `plane.<name>_<setting>`                                       |                                                                                      |
| `prev`             | the previous read brick's `main`, or `readImage` for the first | Read bricks only. This is how read bricks chain: motion blur reads "through" chroma. |

Because this is plain text replacement, a brick must not use `main`, `prev` or `my` as names for anything else. Its `name` must be a valid WGSL identifier.

### Assembly order (`buildShader`)

```
common.wgsl     (with "    // @settings" replaced by one `<brick>_<setting>: f32,` line per setting)
bindings.wgsl
helpers.wgsl
<each brick's renamed function, in list order>
applyShape / applyUv / applyRead / applyColor   (generated)
vertex.wgsl
fragment.wgsl
```

With no bricks, every `apply*` function passes its value through unchanged, and `applyRead` is `readImage`.

### Inside the fixed shaders

- **`vertex.wgsl`:**
  - Picks one of 4 unit-square corners and runs `applyShape(plane.rect)`.
  - Places the corner on the resulting rect.
  - Sets `texcoord = (c.x, 1 − c.y)`, so (0, 0) is the top-left of the image.
- **`fragment.wgsl`:**
  1. Fills `pixel`.
  2. Applies the cover fit: `uv = (texcoord − 0.5) * fitScale + 0.5`.
  3. Runs `applyUv`, then `applyRead`, then `applyColor`.
  4. Returns `color * plane.opacity`.

### What a brick can use

| Name                                                          | What it is                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `plane.rect`, `.fitScale`, `.velocity`, `.aspect`, `.opacity` | The plane's numbers (§6).                                                    |
| `readImage(uv)`                                               | Sample the image.                                                            |
| `velocityInUv()`                                              | `plane.velocity * plane.fitScale`: speed in image coordinates.               |
| `capLength(v, max)`                                           | Shorten a vector to at most `max`, keeping its direction.                    |
| `pixel.planeUv`                                               | 0..1 across the visible frame, (0, 0) at the top-left. Fragment bricks only. |
| `pixel.screen`                                                | The pixel's position on the canvas, in device pixels. Fragment bricks only.  |

`pixel` is a `var<private>` that `fragmentMain` fills in before any brick runs. Shape bricks run in the vertex shader, where `pixel` isn't set.

### Rules

- **The brick list is fixed when the plane is created.** Settings can change at any time through `plane.effects.<name>.<setting>`. Each plane has its own copy, even when planes share a list.
- **Each brick can be used only once per plane.** `buildShader` throws `[image-planes] effect "<name>" is in the list twice`.
- **Read bricks multiply their reads.** Each `prev` call runs the whole chain before it, so `chroma` (3) + `motionBlur` (12) = 36 image reads per pixel. A brick at strength 0 still costs its reads.
- **Movement bricks** (`stretch`, `chroma`, `motionBlur`) read `plane.velocity`. They look best with damping or smooth scrolling.

### Built-in bricks

| Brick              | Kind  | Settings (default)              | Image reads   | Notes                                                                                                                                                                                                                                          |
| ------------------ | ----- | ------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stretch()`        | shape | `strength` (2), `max` (0.5)     | 0             | Longer along the movement, thinner across it, scaled around the centre.                                                                                                                                                                        |
| `parallax()`       | uv    | `strength` (0.4), `zoom` (1.15) | 0             | Zooms in to leave spare image, then pans through it with the plane's progress across the screen (−1 entering, 1 leaving). `strength` is the share of the spare image, clamped to −1..1; its sign sets the direction. `zoom` is clamped to ≥ 1. |
| `chroma()`         | read  | `strength` (0.5)                | 3 × previous  | Red and blue offsets, capped at 0.05 uv. Clamped to alpha.                                                                                                                                                                                     |
| `motionBlur()`     | read  | `strength` (1), `trail` (1)     | 12 × previous | 12 samples, smear capped at 0.88 uv. `trail` 1 = behind, 0 = centred.                                                                                                                                                                          |
| `grayscale()`      | color | `amount` (1), `contrast` (1)    | 0             | Rec.601 luma. Contrast pivots on `0.5 × alpha`.                                                                                                                                                                                                |
| `roundedCorners()` | color | `radius` (0.1)                  | 0             | Rounded-box distance with `fwidth` anti-aliasing. Fixed to the frame (uses `pixel.planeUv`).                                                                                                                                                   |

### Custom bricks

Any object that matches `Brick` works. Users don't need to use `image-planes/effects`. The commented-out `invert` brick in `playground/main.ts` is an example.

## 8. Public API

Exported from `image-planes` (`src/index.ts`):

- **`ImagePlanes`**
  - `static create(canvas, { damping? })`
  - `addPlane({ element, source?, fit?, effects? })` → `ImagePlane`
  - `start()`, `stop()`, `destroy()`
  - `onBeforeRender((time, dt) => void)` → an unsubscribe function
  - `planes`: every handle, in draw order
- **`ImagePlane`**
  - `ready` (Promise)
  - `bounds`: a `Rect` in CSS px, mutated in place
  - `opacity`
  - `effects`
  - `isTracking`, `track(element?)`, `untrack()`
  - `bringToFront()`, `remove()`
- **Functions:** `rectFromElement(el)` and `waitForImageReady(img)`.
- **Types:** `AddPlaneOptions`, `Brick`, `BrickKind`, `EffectSettings`, `BeforeRenderCallback`, `PlaneFit` (`"cover" | "fill"`), `PlaneSource` (`string | Blob | HTMLImageElement | ImageBitmap`), `Rect`, `ImagePlanesOptions`.

Exported from `image-planes/effects`: `chroma`, `grayscale`, `motionBlur`, `parallax`, `stretch`, `roundedCorners`, and their `…Options` interfaces.

## 9. How to change things

### Add a brick

1. Create `src/effects/<name>/<name>.ts` and `src/effects/<name>/<name>.wgsl`.
2. The `.ts` follows this template:

   ```ts
   import type { Brick } from "../../types";
   import somethingShaderSource from "./something.wgsl?raw";

   export interface SomethingOptions {
     /** What it does. Default 1. */
     strength?: number;
   }

   /** What it does. Kind: color. Image reads: 0. */
   export function something({ strength = 1 }: SomethingOptions = {}): Brick {
     return {
       name: "something",
       kind: "color",
       settings: { strength },
       wgsl: somethingShaderSource,
     };
   }
   ```

3. Follow these rules:
   - The function name, the brick's `name`, and the `plane.effects` key are the same word.
   - Every option has a documented default.
   - The doc comment states the kind and the image-read cost.
   - The `.wgsl` file holds exactly one function, `main`, with the signature for its kind (§7).
   - Fixed numbers are `const`s inside `main`.
   - Read settings with `my.<setting>`.
   - Keep colours premultiplied (§6).
4. Export it from `src/effects/index.ts`.
5. Add a row to the bricks table in `README.md` and in §7 of this file.
6. Try it in `playground/main.ts`.

### Add a field to `PlaneUniforms`

All of these must change together:

1. `shaders/common.wgsl`: add the field above `// @settings`. Respect WGSL alignment: `vec2f` aligns to 8 bytes, `vec4f` to 16, and `f32` to 4.
2. `core/settings.ts`: update `PLANE_BASE_FLOATS`.
3. `core/PlaneManager.ts`: write the value into `scratch` at the matching index in `update()`.
4. `core/buildShader.test.ts`: update the `planeFloats` expectations.
5. The uniform table in §6 of this file.

### Change shader assembly

Edit `core/buildShader.ts` and keep `core/buildShader.test.ts` passing, or update it on purpose. The tests check:

- the renaming of `main` and `my.`
- the `prev` chaining
- duplicate-brick detection
- the settings order
- the buffer size

### Add a public option, method or type

1. Add it to `types.ts` (options and types) or to the class.
2. Export it from `src/index.ts`, or from `src/effects/index.ts` for bricks.
3. Update `README.md`.

### Before committing

1. Run `pnpm typecheck`.
2. Run `pnpm --filter image-planes test`.
3. Run `pnpm dev` and check the playground in a WebGPU browser. Most bugs are visual, and GPU errors appear in the console with the `[image-planes]` prefix.

## 10. Conventions

- **Formatting:** 4-space indentation and double quotes.
- **Comments:** short, plain-English sentences that explain _why_. Avoid jargon where a plain word works ("bricks", "reads", "plane sizes").
- **Errors:** GPU error logs and `buildShader` errors start with `[image-planes]`. Some older setup errors (`gpu.ts`, `addPlane`) don't yet. New errors should use the prefix.
- **Commits:** `[feat:] …`, `[chore:] …` or `[docs:] …`.
- **Internal types** (`PlaneRecord`, `SettingSlot`) are not exported from `index.ts`.

## 11. Known limitations and gotchas

- **Only a window `resize` reconfigures the canvas.** A `devicePixelRatio` change on its own, such as dragging the window to another monitor, does not.
- **The canvas must cover the whole viewport.** Positions are converted using `innerWidth`/`innerHeight`, not the canvas's own rect.
- **A tracked plane overwrites `bounds` every frame.** Call `untrack()` before animating `bounds` yourself.
- **Planes don't ease until their texture loads.** This is on purpose (§5).
- **`destroy()` doesn't free GPU memory** (§4). The pipeline cache also grows with every unique brick list.
- **Velocity is in CSS direction (+y down)**, but `rect` is in clip space (+y up). Bricks that mix the two must flip y themselves.
- **`docs/` is gitignored.** It holds local notes: `guide.md` is a step-by-step build tutorial, and `ideas.md` lists brick ideas and possible extensions. Use it for background, but this file and the code are the source of truth.
