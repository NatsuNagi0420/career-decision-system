/** 青穗集 · 忆迹场共用的分叉云脊：体积、纤维、尘埃与真实记忆使用同一三维轮廓。 */
export const NEBULA_SCALE = 70;
const TILT = .48;
const ease = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 两片向不同深度展开的褶皱云幕，沿横轴延展而不闭合成圆环。 */
export function nebulaVeil(t: number, branch = 0, strand = 0, depth = 0): [number, number, number] {
  const width = .12 + .075 * (.5 + .5 * Math.cos(t * 2.8 + branch));
  const y = .19 * Math.sin(t * 2.6) - .10 * Math.cos(t * 1.2)
    + branch * (.18 + .58 * ease(-.65, 1.15, t)) + strand * width;
  const z = .16 * Math.sin(t * 2.1) + (branch ? -.24 : .18) * Math.sin(t * 1.8 + .4)
    + .09 * Math.sin(strand * 2.5 + t * 3.1) + depth;
  return [(t * Math.cos(TILT) - y * Math.sin(TILT)) * NEBULA_SCALE,
    (t * Math.sin(TILT) + y * Math.cos(TILT)) * NEBULA_SCALE, z * NEBULA_SCALE];
}

/** 与 CPU 采样共用云脊参数，防止云层、装饰纤维和记忆节点各自漂移。 */
export const NEBULA_FORM_GLSL = `
  vec3 veilFrame(vec3 p) {
    return vec3(p.x * ${Math.cos(TILT).toFixed(8)} + p.y * ${Math.sin(TILT).toFixed(8)},
      -p.x * ${Math.sin(TILT).toFixed(8)} + p.y * ${Math.cos(TILT).toFixed(8)}, p.z);
  }
  vec2 veilSpine(float x, float branch) {
    return vec2(.19 * sin(x * 2.6) - .10 * cos(x * 1.2)
      + branch * (.18 + .58 * smoothstep(-.65, 1.15, x)),
      .16 * sin(x * 2.1) + mix(.18, -.24, branch) * sin(x * 1.8 + .4));
  }
  float veilWidth(float x, float branch) { return .12 + .075 * (.5 + .5 * cos(x * 2.8 + branch)); }
`;
