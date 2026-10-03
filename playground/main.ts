import "./style.css";
// import gsap from "gsap";
import { ImagePlanes } from "image-planes";

async function main() {
    const scene = await ImagePlanes.create(document.querySelector("canvas")!);
    for (const img of document.querySelectorAll("img")) {
        const plane = scene.addPlane({ element: img });
        // img.addEventListener("click", () => {
        //     plane.untrack();
        //     plane.opacity = 0.5;
        //     gsap.to(plane.bounds, { x: 0, y: 0, width: innerWidth, height: innerHeight });
        // });
    }
    scene.start();
}
main();
