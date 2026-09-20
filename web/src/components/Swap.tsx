import type { ReactNode } from "react";

/**
 * Fades its content in whenever `when` changes.
 *
 * The mechanism is a React key: a new key remounts the node, and a remount is what a
 * CSS `animation` needs to run again. This inline version is for labels — the
 * capability name in the picker trigger, a status line — where a swap should read as
 * "this changed", not as a silent text mutation.
 *
 * For whole blocks the same effect is achieved by putting `key=` on the existing
 * container instead of wrapping it, so the layout tree is untouched.
 *
 * Never wrap something that changes every frame (the streaming answer): it would
 * restart the animation on each delta.
 */
export function Swap({ when, children }: { when: string | null; children: ReactNode }) {
  return (
    <span className="swap" key={when ?? "none"}>
      {children}
    </span>
  );
}
