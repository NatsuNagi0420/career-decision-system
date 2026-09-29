/**
 * Material Symbols ligature span, the same mechanism the reference uses.
 *
 * The text content *is* the icon name, so adding an icon costs nothing here — but the
 * shipped font is a subset, so it must be a name that exists. `npm run fonts` rebuilds
 * it from `scripts/icons.used.txt`, and `fonts.contract.test.mjs` fails when a name
 * in the source is not in that list. `fill` needs the FILL variation axis, which the
 * build script asserts survives the cut.
 */

export function Ms({
  g,
  size = 24,
  fill = false,
  className = "",
  style,
}: {
  g: string;
  size?: number;
  fill?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`ms${fill ? " ms-fill" : ""} ${className}`.trim()}
      style={{ fontSize: size, ...style }}
    >
      {g}
    </span>
  );
}
