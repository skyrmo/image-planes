import "./style.css";
import gsap from "gsap";
import Lenis from "lenis";
import { ImagePlanes, type Brick } from "image-planes";

// const invert: Brick = {
//     name: "invert",
//     kind: "color",
//     settings: {},
//     wgsl: /* wgsl */ `
// fn main(color: vec4f) -> vec4f {
//     // Premultiplied: "full brightness" is alpha, not 1.
//     return vec4f(color.a - color.rgb, color.a);
// }`,
// };

const redden: Brick = {
    name: "redden",
    kind: "color",
    settings: { amount: 0 },
    wgsl: /* wgsl */ `
fn main(color: vec4f) -> vec4f {
    let red = vec4f(color.a, 0.0, 0.0, color.a); // pure red, premultiplied
    return mix(color, red, my.amount);
}`,
};

async function main() {
    const lenis = new Lenis({
        lerp: 0.1, // default is 0.1. Higher = closer to native.
        smoothWheel: true, // needed: fixes the desync on mouse wheel
        syncTouch: false, // leave touch scrolling native
        wheelMultiplier: 1, // same scroll distance as the browser
        autoRaf: false,
    });

    const scene = await ImagePlanes.create(document.querySelector("canvas")!, { damping: 0 });

    scene.onBeforeRender((time) => lenis.raf(time));

    for (const img of document.querySelectorAll("img")) {
        const plane = scene.addPlane({ element: img, effects: [redden] });
        img.addEventListener("click", () => {
            gsap.to(plane.effects.redden, { amount: plane.effects.redden.amount > 0.5 ? 0 : 1 });
        });
    }
    scene.start();
}
main();
