import "./style.css";
// import gsap from "gsap";
import { ImagePlanes, type Brick } from "image-planes";

const invert: Brick = {
    name: "invert",
    kind: "color",
    settings: {},
    wgsl: /* wgsl */ `
fn main(color: vec4f) -> vec4f {
    // Premultiplied: "full brightness" is alpha, not 1.
    return vec4f(color.a - color.rgb, color.a);
}`,
};

import Lenis from "lenis";

async function main() {
    const lenis = new Lenis({
        lerp: 0.1, // default is 0.1. Higher = closer to native. Try 0.15–0.25
        smoothWheel: true, // needed: this is what fixes the desync on mouse wheel
        syncTouch: false, // leave touch scrolling native (feels best on phones)
        wheelMultiplier: 1, // same scroll distance as the browser
        autoRaf: false, // you drive the loop yourself (see below)
    });

    const scene = await ImagePlanes.create(document.querySelector("canvas")!, { damping: 0 });

    scene.onBeforeRender((time) => lenis.raf(time));

    for (const img of document.querySelectorAll("img")) {
        scene.addPlane({ element: img, effects: [invert] });
        // img.addEventListener("click", () => {
        //     plane.untrack();
        //     plane.opacity = 0.5;
        //     gsap.to(plane.bounds, {
        //         x: 0,
        //         y: 0,
        //         width: innerWidth * 0.8,
        //         height: innerHeight * 0.9,
        //     });
        // });
    }
    scene.start();
}
main();
