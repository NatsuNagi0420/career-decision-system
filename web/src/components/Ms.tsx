/**
 * Material Symbols ligature span, the same mechanism the reference uses.
 *
 * The text content *is* the icon name, so adding an icon costs nothing here. The font
 * is loaded from Google Fonts in index.html to match the reference 1:1; before this is
 * deployed anywhere real, those files should be vendored (see the note in index.html).
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
