import type { Rect } from "../types";

export function rectFromElement(el: HTMLElement): Rect {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}

// Resolves once an <img> has decoded pixel data ready to paint, so callers can
// measure/animate against it without racing the network fetch.
export async function waitForImageReady(img: HTMLImageElement): Promise<void> {
    if (img.complete && img.naturalWidth > 0) return;
    try {
        await img.decode();
    } catch {
        // decode() rejects on error/removal — fall back to the load event.
        await new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
        });
    }
}
