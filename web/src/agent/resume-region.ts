/** 青穗集 · 简历框选几何：按纸面缩放命中文字行，反向拖动与点击使用同一坐标规则。 */
export interface RegionRect { x: number; y: number; width: number; height: number }
export function regionRect(from: { x: number; y: number }, to: { x: number; y: number }): RegionRect {
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
}
export function regionIntersects(a: RegionRect, b: RegionRect) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}
export function fieldsInRegion(fields: { id: string; rects: RegionRect[] }[], rect: RegionRect): string[] {
  const area = rect.width < 5 && rect.height < 5 ? { x: rect.x - 2, y: rect.y - 2, width: 4, height: 4 } : rect;
  return fields.filter(field => field.rects.some(line => regionIntersects(area, line))).map(field => field.id);
}
