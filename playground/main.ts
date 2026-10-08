import "./style.css";
import gsap from "gsap";
import Lenis from "lenis";
import { ImagePlanes, type Brick } from "image-planes";

import {
    chroma,
    grayscale,
    motionBlur,
    parallax,
    stretch,
} from "../packages/image-planes/src/effects";

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

async function main() {
    const lenis = new Lenis({
        lerp: 0.1, // default is 0.1. Higher = closer to native.
        smoothWheel: true, // needed: fixes the desync on mouse wheel
        syncTouch: false, // leave touch scrolling native
        wheelMultiplier: 1, // same scroll distance as the browser
        autoRaf: false,
    });

    const scene = await ImagePlanes.create(document.querySelector("canvas")!, { damping: 0.2 });

    scene.onBeforeRender((time) => lenis.raf(time));

    for (const img of document.querySelectorAll("img")) {
        const plane = scene.addPlane({
            element: img,
            effects: [stretch(), parallax(), chroma(), motionBlur(), grayscale({ amount: 0 })],
        });
        // Click a plane: fade to black and white. Click again: back to colour.
        img.addEventListener("click", () => {
            const fx = plane.effects.grayscale;
            gsap.to(fx, { amount: fx.amount > 0.5 ? 0 : 1, duration: 0.6 });
        });
    }
    scene.start();
}
main();
