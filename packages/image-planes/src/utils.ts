import type { Rect } from "./types";

export function rectFromElement(el: HTMLElement): Rect {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
}

export async function waitForImageReady(img: HTMLImageElement): Promise<void> {
    if (img.complete && img.naturalWidth > 0) return;
    try {
        await img.decode();
    } catch {
        // decode() can reject (e.g. image swapped mid-load). Fall back to the load event.
        await new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
        });
    }
}
