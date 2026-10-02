import type { Rect } from "../types/types";

export function rectFromElement(el: HTMLElement): Rect {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
}
