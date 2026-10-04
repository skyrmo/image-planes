import "./style.css";
// import gsap from "gsap";
import { ImagePlanes } from "image-planes";

import Lenis from "lenis";

async function main() {
    const lenis = new Lenis({ autoRaf: false });
    const scene = await ImagePlanes.create(document.querySelector("canvas")!, { damping: 0 });

    scene.onBeforeRender((time) => lenis.raf(time));

    for (const img of document.querySelectorAll("img")) {
        const plane = scene.addPlane({ element: img });
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
