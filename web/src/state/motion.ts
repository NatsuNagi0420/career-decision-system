import type { CSSProperties } from "react";

/**
 * Stagger for `.card-in`: the nth block that appears in one change waits n × 60ms.
 *
 * Anything that appears because something changed should arrive, not switch on. The
 * rule is the owner's, 2026-09-23: 凡是变化的地方都要加微动效.
 */
export function rise(index: number): CSSProperties {
  return { "--i": String(index) } as CSSProperties;
}
