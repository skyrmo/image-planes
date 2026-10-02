import "./style.css";
import { ImagePlanes } from "../src/ImagePlanes";

async function main() {
    const scene = await ImagePlanes.create(document.querySelector("canvas")!);
    for (const img of document.querySelectorAll("img")) scene.addPlane({ element: img });
}
main();
