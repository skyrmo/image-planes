# Architecture

How `image-planes` works inside. The shape of the data, and what happens on each
frame. Read this before changing anything in `src/core/`.

For _using_ the package, see [README.md](./README.md).

---

## The one-sentence version

We pin a transparent WebGPU canvas over the whole viewport and, every frame, copy
each tracked DOM element's on-screen rectangle into a uniform buffer so the GPU
can draw a textured quad in exactly that spot.

That's it. No scene graph, no camera, no 3D.

## Mental model

```
        the page                        the canvas layer
 ┌──────────────────────┐        ┌──────────────────────┐
 │  <h1>Title</h1>      │        │                      │
 │                      │        │                      │
 │  ┌────────────┐      │        │   ┌────────────┐     │
 │  │  <img>     │      │   ──►  │   │ GPU quad   │     │
 │  │            │      │        │   │            │     │
 │  └────────────┘      │        │   └────────────┘     │
 │                      │        │                      │
 │  <p>body copy</p>    │        │  (rest transparent)  │
 └──────────────────────┘        └──────────────────────┘
   position: static              position: fixed; inset: 0
   normal document flow          full viewport, pointer-events: none
```

The canvas sits on top and the quad lands where the `<img>` is. Scroll the page,
the `<img>` moves, and next frame we read its new position and move the quad to
match.

Positions come from `getBoundingClientRect()`, which is viewport-relative, and
`configureCanvas()` sizes the canvas from `window.innerWidth/innerHeight`. So the
canvas has to be a full-viewport fixed layer.

## The pieces

| File                     | Owns                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `ImagePlanes.ts`         | The public API and the `requestAnimationFrame` loop.                                                      |
| `core/gpu.ts`            | `initWebGPU()` and `configureCanvas()`. Adapter, device, canvas context setup, plus canvas sizing.        |
| `core/Renderer.ts`       | Pipeline, sampler, bind groups, the render pass. Everything needed at draw time.                          |
| `core/TextureManager.ts` | Turns a source (URL, Blob, `<img>`, `ImageBitmap`) into a `GPUTexture`.                                   |
| `core/PlaneManager.ts`   | The `Set<PlaneRecord>`. Per-frame DOM tracking, the smoothing math, and uniform writes. The busiest file. |
| `core/ImagePlane.ts`     | `ImagePlane`, the handle your code holds and a plane's only identity. A thin wrapper over a record.       |
| `core/records.ts`        | The internal `PlaneRecord` shape. Types only, no logic.                                                   |
| `core/util.ts`           | `rectFromElement()` and `waitForImageReady()`. Two helpers, no state.                                     |
| `core/uniforms.ts`       | JS values → WGSL struct text, byte offsets, and a pack function. Pure, no GPU types.                      |
| `core/EffectCompiler.ts` | Effect source assembly, compilation, error formatting, and the pipeline cache.                            |
| `shaders/*.wgsl`         | Six fragments. Position a quad, sample a texture, and everything an effect can read.                      |
| `shaders/sources.ts`     | Concatenates those fragments into the three programs the package compiles.                                |

```
ImagePlanes                      ← you talk to this
 ├── device + context            ← from initWebGPU(), before anything is built
 ├── Renderer         (device, context, format)
 ├── TextureManager   (device)
 ├── EffectCompiler   (device + renderer)
 └── PlaneManager     (device + renderer)
       └── Set<PlaneRecord>      ← the only collection of planes
```

WGSL has no imports, so `shaders/sources.ts` assembles modules by
concatenation:

```
common.wgsl        structs: SceneUniforms, PlaneUniforms, VertexOutput
bindings.wgsl      the group 0 and group 1 declarations (fragment stage)

VERTEX_SOURCE    = common + vertex.wgsl
FRAGMENT_SOURCE  = common + bindings + fragment.wgsl
EFFECT_PRELUDE   = common + bindings + effect-prelude.wgsl
EFFECT_ENTRY     =          effect-entry.wgsl
```

The point is that `PlaneUniforms` exists in exactly one file. It used to be
pasted into every module that needed it, and nothing checks that copies of a
struct agree.

`core/uniforms.ts` is the only file with its own test script, `pnpm
check:uniforms`, because it is the only one with no GPU dependency. WGSL
alignment rules are unintuitive enough to be worth pinning down (`vec3f`
occupies 12 bytes but aligns to 16), and getting them wrong produces a shader
that reads plausible garbage rather than an error.

### Handle vs. record

There are two objects per plane, and the split matters:

```
   your code                    library internals
 ┌────────────────┐           ┌──────────────────────┐
 │ ImagePlane     │  wraps    │ PlaneRecord          │
 │  .bounds  ─────┼──────────►│  bounds  ◄───────────┼── ONE object,
 │  .opacity      │           │  opacity             │   mutated in place,
 │  .untrack()    │           │  texture, bindGroup  │   never replaced
 │  .track()      │           │  uniformBuffer       │
 │  .bringToFront()│          │  lastUniform         │
 │       ▲        │           │  tracking, fit...    │
 └───────┼────────┘           │  handle ─────────────┼──┐
         │                    └──────────────────────┘  │
         └───────────────── back-pointer ───────────────┘
```

The link runs both ways. `PlaneManager`'s `Set<PlaneRecord>` is the _only_
collection of planes. `scene.planes` reads each record's `handle` instead of
keeping a second `Set<ImagePlane>` in sync by hand, so it comes back in paint
order for free. The record set's iteration order _is_ the z-order. `handle` is
typed `ImagePlane | null` only because `addPlane()` allocates the record a few
lines before the handle exists. Once `addPlane()` has returned, it is never null.

`plane.bounds` returns the record's actual rect object, not a copy. That is
deliberate. GSAP, or anything else, can hold the reference and tween `x`, `y`,
`width` and `height` on it directly, and the render loop picks the new values up
on the next frame. Never reassign `record.bounds`. Mutate its fields, or every
animation holding a reference silently detaches from reality. This is the subject
of [ADR 0001](./docs/adr/0001-bounds-is-a-live-mutable-object.md).

`PlaneRecord` lives in `records.ts` rather than `types.ts` because it mentions
GPU types. Keeping it out of the public type graph means consumers don't need
`@webgpu/types` installed to use the package.

---

## Flow 1: startup

```
await ImagePlanes.create(canvas, opts)
        │
        ├─ initWebGPU(canvas)          the only async step; a constructor can't await,
        │     │                        which is why this is a static factory
        │     navigator.gpu.requestAdapter() → requestDevice()
        │     canvas.getContext("webgpu")
        │     configureCanvas():  canvas.width  = innerWidth  × dpr
        │                         canvas.height = innerHeight × dpr
        │                         alphaMode: "premultiplied"
        │     ↳ throws if navigator.gpu or the adapter is missing (this machine
        │       can't), or if the device or context fails (something broke)
        │
        ▼
new ImagePlanes(canvas, device, context, format, opts)    private, fully sync
        │
        ├─ new Renderer(device, context, format)
        │     create sampler (linear/linear)
        │     compile both .wgsl modules
        │     create the ONE render pipeline every plane shares
        │
        ├─ warn (console only) if the canvas isn't a full-viewport fixed layer
        └─ listen for window resize
```

The scene has one sampler and one default pipeline, which every plane without an
effect draws with. A plane with an effect gets its own compiled pipeline, cached
so that ten planes sharing one imported effect share one.

## Flow 2: adding a plane

`addPlane()` returns synchronously, but both the image upload and the shader
compile are async. Three timelines:

```
addPlane({ element, fit, effect })
   │
   ├── SYNC ────────────────────────────────────────────────
   │     planeManager.createRecord()   → allocates the 48-byte uniform buffer
   │                                     seeds bounds AND prevX/prevY from the
   │                                     element, readable before frame 1
   │                                     ready = false, planeBindGroup = null
   │                                     pipeline = the default one
   │     if there's an effect:
   │       record.uniformValues = cloneValues(effect.uniforms)
   │                                   → tweenable in this same tick
   │       record.pipeline = null      → withheld, so the plane is never
   │                                     drawn un-effected while compiling
   │     wrap in an ImagePlane handle  → returned to you
   │
   ├── ASYNC (effect) ──────────────────────────────────────
   │     effectCompiler.compile(effect)
   │          assemble prelude + constants + struct + your fn + entry point
   │          createShaderModule → getCompilationInfo
   │              any errors?     throw, with the generated source printed
   │          renderer.buildPipelineAsync()
   │                │
   │                ▼
   │     planeManager.attachEffect(record, compiled, animated)
   │                record.pipeline = compiled.pipeline
   │                allocate the effect uniform buffer + bind group
   │                                   (skipped when it declared no uniforms)
   │
   └── ASYNC (texture) ─────────────────────────────────────
         TextureManager.load(source)
              source is a string?      fetch → blob → createImageBitmap
              source is an <img>?      waitForImageReady() → createImageBitmap
                                       (uses the already-decoded pixels, no re-fetch)
              source is Blob/Bitmap?   createImageBitmap / pass through
                    │
                    ▼
              createTexture(bitmap)
                    device.createTexture(rgba8unorm)
                    queue.copyExternalImageToTexture(premultipliedAlpha: true)
                    │
                    ▼
         planeManager.attachTexture(record, texture, w/h)
                    destroy any previous texture
                    record.texture        = texture
                    record.texAspect      = width / height
                    record.planeBindGroup = renderer.createPlaneBindGroup(...)
                    record.ready          = true
                    │
                    ▼
         needRender = true            → appears on the next frame
```

`plane.ready` is both arms, so a shader that fails to compile surfaces the same
way a 404 image does. Both guard against the plane being removed while their
work is in flight.

Until `ready` is true the plane is skipped entirely. No uniform write, no draw.
That's why the README suggests leaving the native `<img>` visible until
`await plane.ready`. It doubles as the placeholder, and the swap is invisible.

An effect's uniform values are cloned per plane, never shared with the effect
definition. Two planes using one imported effect would otherwise share a single
live object, and tweening either would move both. A single-plane demo never
shows this, which is what makes it worth stating.

There is no way to swap a plane's texture after creation. Remove the plane and
add a new one. An early `setSource()` didn't survive. Overlapping loads resolved
out of order, so the last source you asked for wasn't reliably the one you got.

---

## Flow 3: the render loop

This is the part to understand. `ImagePlanes.loop` runs once per frame:

```
requestAnimationFrame(time)
     │
     │  ① reschedule immediately (so a throw doesn't kill the loop)
     │
     │  ② dt = time - lastTime, clamped to 0.1 - 100 ms
     │     dtRatio = dt / 16.67    (1.0 at 60Hz, 0.5 at 120Hz)
     │        └─ clamping stops a background tab returning after 10s
     │           and teleporting every plane
     │
     │  ③ run every onBeforeRender hook, passing (time, dt)
     │        this is where YOU tick Lenis / GSAP / your own state.
     │        By the time step ④ runs, scroll position and any tweened
     │        bounds are already up to date for this frame.
     │
     │  ④ dirty = planeManager.update(dtRatio, damping)     ← see below
     │
     │  ⑤ if (dirty || needRender)
     │         renderer.renderAll(records)
     │         needRender = false
     │     else
     │         submit nothing. The GPU does no work this frame.
     ▼
```

Order matters. Hooks run before tracking, so animation libraries always get to
write their values before we read them.

### Step ④, `PlaneManager.update()`

For each record, in insertion order:

```
   ┌─ is it tracking? (tracking && trackedEl)
   │
   ├─ YES ──► rect = trackedEl.getBoundingClientRect()
   │            │
   │            ├─ first time, or texture not ready, or damping <= 0
   │            │     → snap: bounds = rect exactly
   │            │
   │            └─ otherwise
   │                  → damp: k = 1 - damping
   │                          a = 1 - (1 - k)^dtRatio
   │                          bounds += (rect - bounds) * a
   │                  → if every edge is within SNAP_EPSILON (0.05px),
   │                    snap the rest of the way (see "idle" below)
   │
   └─ NO  ──► leave bounds alone. You own them while untracked.

   ── texture not ready? skip the rest, this plane isn't drawn. ──

   pack 8 floats into a reusable scratch array:
       [0..3] rect in NDC      [4] opacity     [5] padding     [6..7] fitScale

   compare all 8 against record.lastUniform
       identical  → nothing to do
       different  → lastUniform.set(scratch)
                    device.queue.writeBuffer(record.uniformBuffer, 0, scratch)
                    dirty = true
```

The exponent in `a = 1 - (1 - k)^dtRatio` is what makes smoothing frame-rate
independent. A naive `bounds += (target - bounds) * k` moves twice as fast on a
120Hz display. Raising to the power of `dtRatio` cancels that out, so
`damping: 0.88` looks the same everywhere.

`damping` is the public number and counts _up_ from 0, where 0 means follow
exactly. `k` is the fraction of the gap closed per 60Hz frame, `1 - damping`,
floored at 0.01 so a damping near 1 can't stall completely. The inversion is
deliberate, and [ADR 0002](./docs/adr/0002-damping-not-lerp.md) explains why.

### Step ⑤, `Renderer.renderAll()`

```
queue.writeBuffer(sceneBuffer, sceneUniforms)   ← time, resolution, pointer, dpr

encoder = device.createCommandEncoder()
pass = encoder.beginRenderPass({
    view: context.getCurrentTexture().createView(),
    clearValue: rgba(0,0,0,0),      ← transparent, the page shows through
    loadOp: "clear",
})
pass.setBindGroup(0, sceneBindGroup)  ← once for the whole pass

for each record:
    skip if pipeline is null        (plain planes get one at creation; an
    skip if planeBindGroup is null   effect plane waits for its shader)
    skip if width <= 0 or height <= 0

    if pipeline changed:
        pass.setPipeline(record.pipeline)

    pass.setBindGroup(1, record.planeBindGroup)
    pass.setBindGroup(2, record.effectBindGroup)   ← only if it has one
    pass.draw(4)                    ← 4 vertices, triangle-strip, no vertex buffer

pass.end()
queue.submit([encoder.finish()])
```

One pass, and per plane: one or two bind group swaps and one draw call. No vertex
or index buffers exist. The vertex shader hardcodes the quad's corners and picks
one by `vertex_index`.

The scene uniform buffer is written here rather than in `update()`, so a scene
sitting idle never touches the queue even though `time` is always advancing.

**Records are never sorted by pipeline**, tempting though it is to make the
runs of identical pipelines longer. There is no depth buffer, so iteration
order is stacking order, and sorting would silently change which plane paints
over which.

Draw order is the record set's iteration order, which starts as the order planes
were added, because `Set` iterates in insertion order. There is no depth buffer,
so this is a painter's algorithm. Later planes paint over earlier ones.
`plane.bringToFront()` exploits the same property to reorder in O(1). Delete the
entry, re-add it, and it moves to the end of the iteration.

---

## The uniform blocks

Three bind groups, split by how often each one changes:

```
group 0   scene    0: sampler        1: SceneUniforms     set once per pass
group 1   plane    0: texture        1: PlaneUniforms     2: texture2
group 2   effect   0: EffectUniforms                      only when declared
```

The layouts are explicit `GPUBindGroupLayout` objects rather than
`layout: "auto"`, and that is the whole reason custom shaders are possible. An
auto layout belongs to one pipeline and its bind groups are not valid on any
other, so an effect pipeline could not reuse a plane's bind group. Two
`GPUPipelineLayout`s are built from these, `[g0, g1]` and `[g0, g1, g2]`, and
because both name the same `g0` and `g1` **objects**, switching pipelines
mid-pass leaves groups 0 and 1 bound.

`texture2` is always bound, to a shared 1×1 transparent texture when unused, so
group 1's layout never varies with what a plane happens to have. No public API
fills it yet. It exists because adding a binding later would change the layout
and break every shader already written against it.

### PlaneUniforms, 48 bytes

Everything the shaders know about a plane, rewritten only when it changes:

| Floats | Field      | Meaning                                                                          |
| ------ | ---------- | -------------------------------------------------------------------------------- |
| 0-3    | `rect`     | `x` and `y` of the bottom-left corner in NDC, then width and height in NDC units |
| 4-5    | `fitScale` | UV window scale for cover fit. `(1, 1)` means fill                               |
| 6-7    | `velocity` | Movement in fractions of the plane's own size per 60Hz frame, y downward         |
| 8      | `aspect`   | `bounds.width / bounds.height`                                                   |
| 9      | `opacity`  | 0 to 1                                                                           |
| 10-11  | none       | Padding. A struct in the uniform address space rounds up to a multiple of 16     |

`PLANE_UNIFORM_SIZE = 48` in `Renderer.ts` and the `PlaneUniforms` struct in
`shaders/common.wgsl` have to stay in agreement, field order included. Nothing
catches a mismatch. You just get garbage. Those are the only two places now;
the struct used to be pasted into each `.wgsl` file that needed it.

**`velocity` costs nothing to produce.** The damped chase already computes the
gap between a plane and its tracked element every frame and used to throw it
away. That lag is a momentum model: it ramps and decays smoothly, it differs per
plane, and it stays correct for an untracked plane mid-flight, which page scroll
velocity does not.

Two details in `PlaneManager.update` make it work. It is computed **before** the
`ready` gate, so `prev` never goes stale on a plane whose texture is still
loading and the first drawn frame doesn't inherit the whole distance travelled
while invisible. And the `dtRatio` divisor is floored at 0.5, because the loop
clamps `dt` to a 0.1 ms minimum, so `dtRatio` can reach 0.006 and one stalled
frame would otherwise read as a ~150x velocity spike.

Velocity still converges. When bounds stop moving it reaches exactly 0, which
costs one extra rendered frame after motion ends and then the scene goes idle.

### SceneUniforms, 32 bytes

| Floats | Field        | Meaning                                     |
| ------ | ------------ | ------------------------------------------- |
| 0-1    | `resolution` | Viewport in CSS px                          |
| 2-3    | `pointer`    | Cursor in CSS px, viewport-relative         |
| 4      | `time`       | Seconds since the scene was created         |
| 5      | `dpr`        | Device pixel ratio                          |
| 6-7    | none         | Padding                                     |

`pointer` needs a `window` listener, because the canvas is
`pointer-events: none` and never sees the cursor. It is installed lazily by the
first plane with an effect, so a scene with no effects installs nothing.

`time` is not reset by `stop()` / `start()`. A clock that jumps backwards is
worse than one that skips the paused interval.

### EffectUniforms, generated

`core/uniforms.ts` derives the struct text, the byte offsets and the buffer size
from a single walk over the values an effect declared, which is the point: they
cannot drift apart the way a hand-written struct and a size constant can.
`number` becomes `f32`, and arrays of 2, 3 and 4 become the matching vecNf.
Fields keep declaration order rather than being sorted by alignment, so the
generated struct reads the way the author wrote it.

### Coordinate conversion

The DOM and the GPU disagree about where the origin is and which way `y` goes:

```
  CSS pixels (getBoundingClientRect)      NDC (what the GPU wants)

  (0,0) ┌──────────────────┐                        y = +1
        │                  │                          ▲
        │                  │              x = -1 ─────┼───── x = +1
        │                  │                          ▼
        └──────────────────┘ (vw, vh)               y = -1

    x → right,  y → DOWN                    x → right,  y → UP
```

So `PlaneManager.update` does:

```js
s[0] = (bounds.x / vw) * 2 - 1; // left edge  → NDC x
s[1] = 1 - ((bounds.y + bounds.height) / vh) * 2; // BOTTOM edge → NDC y
s[2] = (bounds.width / vw) * 2; // width, where 2 = full viewport
s[3] = (bounds.height / vh) * 2;
```

`s[1]` uses `y + height` because in CSS `y` is the _top_ edge, while the quad
builds upward from its bottom-left corner in NDC. Get this backwards and you get
the classic "everything is mirrored vertically" bug.

The vertex shader then walks the four corners:

```wgsl
let uv  = corner[vertexIndex];              // (0,0) (1,0) (0,1) (1,1)
let ndc = plane.rect.xy + uv * plane.rect.zw;
output.texcoord = vec2f(uv.x, 1.0 - uv.y);  // flip: texture v=0 is the TOP row
```

That `1.0 - uv.y` is the second half of the same y-axis mismatch. Quad space goes
up, texture space goes down.

### Cover fit

`fit: "cover"` should crop like CSS `object-fit: cover`. Rather than resize the
quad, we sample a smaller centred window of the texture:

```js
planeAspect = bounds.width / bounds.height;

if (planeAspect > texAspect)
    // plane is wider than the image → crop top/bottom
    fitScale = [1, texAspect / planeAspect];
else
    // plane is taller → crop left/right
    fitScale = [planeAspect / texAspect, 1];
```

and in the fragment shader:

```wgsl
let uv = (input.texcoord - 0.5) * plane.fitScale + 0.5;
```

Scaling around `0.5` shrinks the sampled region toward the centre, which zooms in
and crops. `(1, 1)` samples the whole texture, which is `fit: "fill"`.

We recompute this every frame rather than caching it, because the plane's aspect
ratio keeps changing while a tween moves it from one element's shape to another's.

### Blending

The fragment shader outputs premultiplied colour:

```wgsl
return vec4f(color.rgb * plane.opacity, color.a * plane.opacity);
```

which matches the pipeline's `src: one, dst: one-minus-src-alpha` blend, the
canvas's `alphaMode: "premultiplied"`, and the texture upload's
`premultipliedAlpha: true`. All four have to agree. Change one and transparent
images pick up dark or glowing edges.

---

## Why frames get skipped

A static page should cost nothing. Three things control that.

- `dirty` comes back from `update()`. It is true when any plane's 12 plane
  uniform floats, or any of its effect uniform floats, differed from the
  matching `last…` mirror this frame.
- `needRender` covers changes `update()` can't observe: a texture finished
  loading, a shader finished compiling, a plane was removed, the pointer moved,
  the window resized and reallocated the swapchain.
- `record.animated` forces `dirty` unconditionally for one plane.

If none is set, nothing calls `renderAll()` and nothing is submitted. The
`requestAnimationFrame` loop keeps ticking, which is cheap, but the GPU is idle.

This is why `SNAP_EPSILON` exists. Exponential damping approaches its target and
never mathematically arrives, so without a snap threshold the uniforms would
differ by ever-smaller amounts forever and the scene could never go idle. Once
every edge is within 0.05px we jump the remaining distance, `lastUniform`
matches, and the frames stop.

**Effect uniforms need no special handling**, which is the nicest part of the
design. `gsap.to(plane.uniforms, { progress: 1 })` mutates a live object, the
same diff-then-write that `bounds` already goes through notices, and the plane
redraws. `animated: true` exists only for the one case that diff cannot see: a
shader reading `scene.time` while nothing in JS moves. It opts that plane out
of idle frames entirely, so use it deliberately.

`needRender` is currently private, so there is no public escape hatch for
mutating something the library can't see. Both this file and the README have
referred to a `scene.requestRender()` for a while; it doesn't exist. Known gap.

---

## Who owns `bounds`

`tracking` is a single boolean deciding who writes `bounds`:

```
  tracking = true                        tracking = false

  loop reads getBoundingClientRect()     loop does not touch bounds
  loop writes bounds  ──────────┐        your tween writes bounds ─────┐
                                ▼                                      ▼
                          uniform buffer                        uniform buffer
```

A typical "image moves from a thumbnail to an article header" looks like this:

```
plane.untrack()                       // loop stops writing bounds
gsap.to(plane.bounds, {               // you write bounds instead
    ...rectFromElement(targetEl),
    onComplete: () => plane.track(targetEl),   // loop resumes, on the NEW element
})
```

Nothing extra makes the tween visible. GSAP mutates `bounds`, the uniform diff in
step ④ notices, `dirty` goes true, and the loop draws the frame.

`track(el)` can re-anchor to a different element than the plane started on. That's
how a plane "moves" between two places in the document and then keeps
scroll-tracking its new home.

Because nothing ever reallocates `bounds`, re-tracking does not stop an animation
that is still running against it. Both the tween and the loop will write the same
object every frame and the plane will visibly fight itself. Killing an
interrupted tween is the consumer's job, deliberately. See
[ADR 0001](./docs/adr/0001-bounds-is-a-live-mutable-object.md).

Note the snap rule in `update()`. A plane that isn't `seeded` or isn't `ready`
snaps to its element instead of damping. That guarantees the first frame a plane
is actually visible is positioned exactly, rather than sliding in from wherever
it happened to start.

---

## Lifecycle

```
await ImagePlanes.create()  → device, context, pipeline, resize listener. A
                              scene handed back ready, with no half-built state
addPlane()         → record now; texture whenever it resolves
start()            → resets lastTime, forces one render, starts rAF
stop()             → cancels rAF; all state and GPU resources kept, safe to start() again
plane.remove()     → destroys that plane's texture + uniform buffer, drops the handle
destroy()          → stop, unlisten, destroy every plane's resources, destroy the device
```

`start()` sets `lastTime = null` so the first frame after a pause uses a nominal
16.67ms delta instead of a huge one.

Every `GPUTexture` and `GPUBuffer` has an explicit owner that destroys it.
Textures and uniform buffers belong to `PlaneManager`; the device and context
belong to `ImagePlanes` itself.

`destroy()` is terminal and unguarded. There is no way to revive a destroyed
scene, so call `ImagePlanes.create()` again for a fresh one. Nothing enforces
this, so a stray `addPlane()` after `destroy()` submits to a destroyed device and
surfaces as a WebGPU validation error. Known sharp edge.

---

## Things that surprise people

- The canvas ignores its own CSS box. `configureCanvas()` sizes it from
  `window.innerWidth/innerHeight × devicePixelRatio`. A canvas that isn't a
  full-viewport fixed layer will be misaligned. `create()` checks for this and
  warns to the console, but never touches the consumer's CSS.
- Draw order is add order. No depth buffer, no z-index, no sorting.
- One draw call and one uniform buffer per plane. Fine for tens of planes.
  Hundreds would want instancing and a single buffer with dynamic offsets.
- `getBoundingClientRect()` runs once per tracking plane per frame. That's a
  forced layout read, but the loop performs no DOM _writes_, so nothing thrashes.
  Keep it that way. Writing to the DOM inside an `onBeforeRender` hook can
  invalidate layout between planes and cost you a recalc per plane.
- `texAspect` is 1 until the texture loads. Harmless only because unready planes
  are never drawn.
- `renderAll` silently skips a plane with zero width or height.
- `create()` rejects when WebGPU is unavailable, and that's the intended
  graceful degradation path. Leave the native `<img>`s visible and don't start
  the scene. A failure after the adapter exists means something actually broke,
  and you shouldn't swallow it.
- Device loss is not handled. Nothing observes `device.lost`, so if the GPU
  resets, the loop keeps running and submitting to a dead device, drawing
  nothing, with no error anywhere. Known gap, deliberately deferred.
- `initWebGPU` logs `uncapturederror` to the console. WebGPU reports validation
  errors asynchronously and otherwise silently, so without it a wrong bind group
  layout or uniform size shows up as "nothing drew" against an empty console.
- A plane with a broken effect shader is never drawn, because `record.pipeline`
  stays null. The error is on `plane.ready`, so don't ignore that promise.
- Effect pipelines are cached on the effect object's **identity**, in a
  `WeakMap`. Constants live on the object, so two constant sets means two
  objects and two pipelines, with nothing to serialise. The promise is cached
  rather than the pipeline, so two planes created in the same tick don't both
  compile.
- `pointermove` redraws the scene once any plane has an effect, even if no
  effect reads `scene.pointer`. The dirty check can't see the pointer, and the
  listener only exists once an effect does, so this is the least surprising rule
  available.
- The effect machinery is in the bundle for everyone. `ImagePlanes` constructs
  `EffectCompiler` in its constructor, so it cannot tree-shake for consumers who
  never pass an `effect`. That's about 7 KB raw. A dynamic import would split it
  out at the cost of `dist` becoming two files.

## Where to start reading

Follow one frame end to end: `ImagePlanes.loop` → `PlaneManager.update` →
`Renderer.renderAll` → `vertex.wgsl` → `fragment.wgsl`. That's under 250 lines
and covers everything above.

For effects, read `core/EffectCompiler.ts` top to bottom. The prelude is the
public contract, the entry point at the bottom is what makes cover-fit and
premultiplied alpha unbreakable, and `docs/shader-effects-design.md` records why
each decision went the way it did.
