import common from "./common.wgsl?raw";
import vertex from "./vertex.wgsl?raw";
import fragment from "./fragment.wgsl?raw";

export const VERTEX_SOURCE = `${common}\n${vertex}`;
export const FRAGMENT_SOURCE = `${common}\n${fragment}`;
