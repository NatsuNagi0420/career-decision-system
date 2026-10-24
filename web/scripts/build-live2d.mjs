/** 青穗集 · Live2D 独立运行时构建：固定本地 SDK，惰性加载，不在构建时联网下载素材。 */
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = fileURLToPath(new URL('../../assets/web/live2d/', import.meta.url));
await build({
  configFile: false,
  root,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: `${assets}runtime`,
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: { output: { banner: '/** 青穗集 · Live2D 本地运行时构建产物；第三方 SDK 版权与许可见 /api/assets/live2d/licenses/。 */' } },
    lib: { entry: `${root}scripts/live2d-runtime.mjs`, formats: ['iife'], name: 'CareerLive2D', fileName: () => 'companion.js' },
  },
});
const motions = {
  nod: { duration: 1.2, curves: { ParamAngleY: [[0,0],[.25,-7],[.55,3],[.8,-3],[1.2,0]] } },
  tilt: { duration: 1.8, curves: { ParamAngleZ: [[0,0],[.6,7],[1.1,7],[1.8,0]] } },
  celebrate: { duration: 1.8, curves: { ParamAngleY: [[0,0],[.45,7],[1.1,4],[1.8,0]], ParamBodyAngleZ: [[0,0],[.5,-2],[1.2,2],[1.8,0]] } },
};
mkdirSync(`${assets}motions`, { recursive: true });
for (const [name, motion] of Object.entries(motions)) {
  const curves = Object.entries(motion.curves).map(([id, points]) => ({ Target:'Parameter', Id:id, FadeInTime:.2, FadeOutTime:.25, Segments:points.flatMap(([t,v],i)=>i===0?[t,v]:[0,t,v]) }));
  const counts = Object.values(motion.curves).map(points=>points.length);
  writeFileSync(`${assets}motions/${name}.motion3.json`, JSON.stringify({ Version:3, Meta:{ Duration:motion.duration, Fps:30, Loop:false, AreBeziersRestricted:true, CurveCount:curves.length, TotalSegmentCount:counts.reduce((n,c)=>n+c-1,0), TotalPointCount:counts.reduce((n,c)=>n+c,0), UserDataCount:0, TotalUserDataSize:0 }, Curves:curves },null,2)+'\n');
}
console.log('Live2D runtime and 3 authored parameter motions built.');


