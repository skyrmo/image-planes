import "./style.css";
import { ImagePlanes } from "../src/ImagePlanes";

async function main() {
    await ImagePlanes.create(document.querySelector("canvas")!);
}
main();
