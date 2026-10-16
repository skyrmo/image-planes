import "./style.css";
// import gsap from "gsap";
import Lenis from "lenis";
import { ImagePlanes } from "image-planes";

import {
  chroma,
  // grayscale,
  motionBlur,
  parallax,
  stretch,
  roundedCorners,
} from "image-planes/effects";

async function main() {
  const lenis = new Lenis({
    lerp: 0.1, // default is 0.1. Higher = closer to native.
    smoothWheel: true, // needed: fixes the desync on mouse wheel
    syncTouch: false, // leave touch scrolling native
    wheelMultiplier: 1, // same scroll distance as the browser
    autoRaf: false,
  });

  const scene = await ImagePlanes.create(document.querySelector("canvas")!, { damping: 0.6 });

  scene.onBeforeRender((time) => lenis.raf(time));

  for (const img of document.querySelectorAll("img")) {
    scene.addPlane({
      element: img,

      effects: [
        stretch({ strength: 1.0 }),
        parallax({ strength: 0.1, zoom: 1.05 }),
        chroma({ strength: 0.75 }),
        motionBlur({ strength: 1.2, trail: 1.1 }),
        roundedCorners({ radius: 0.05 }),
      ],
    });
    // Click a plane: fade to black and white. Click again: back to colour.
    img.addEventListener("click", () => {
      // const fx = plane.effects.grayscale;
      // gsap.to(fx, { amount: fx.amount > 0.5 ? 0 : 1, duration: 0.6 });
    });
  }
  scene.start();
}

await main();
