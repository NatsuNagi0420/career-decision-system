/**
 * 穗奈's face, cut from docs/品牌形象 (the BgSub_ sheets are the transparent ones).
 *
 * The reference mockup used a generic `psychology` glyph for the agent. Here the
 * expression follows what the run is actually doing, so the state is legible before
 * you read a word — which is the whole point of having an IP character.
 */

export type Face = "smile" | "think" | "happy" | "listen" | "explain" | "worry" | "warn" | "encourage";

const FACE: Record<Face, string> = {
  smile: "/brand/su-smile.webp",
  think: "/brand/su-think.webp",
  happy: "/brand/su-happy.webp",
  listen: "/brand/su-listen.webp",
  explain: "/brand/su-explain.webp",
  worry: "/brand/su-worry.webp",
  warn: "/brand/su-warn.webp",
  encourage: "/brand/su-encourage.webp",
};

export function SuinaiFace({ face, size = 40 }: { face: Face; size?: number }) {
  return (
    <span className="agenthead__logo" style={{ width: size, height: size }}>
      {/* Keyed so a state change cross-fades instead of cutting to the new face. */}
      <img key={face} src={FACE[face]} alt="" />
    </span>
  );
}

export function BrandMark() {
  return (
    <div className="brand__mark">
      <img className="brand__img" src="/brand/logo-head.webp" alt="" />
      <img className="brand__word" src="/brand/wordmark.webp" alt="青穗集" />
    </div>
  );
}
