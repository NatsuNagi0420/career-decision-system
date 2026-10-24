/** 青穗集 · Cubism动作包导出：使用前端同一采样器生成motion3/exp3与绑定清单，不创建伪造的moc3/cmo3。 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(web, '..');
const output = resolve(root, 'docs/品牌形象/Live2D原画/06-Cubism制作/穗奈_v03_动作与绑定包');
const result = await build({ stdin: { contents: 'export * from "./src/character/suinaiActions"; export * from "./src/character/suinaiCubism";', resolveDir: web, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const write = (file, data) => { const path = resolve(output, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2) + '\n'); };
for (const action of api.SUINAI_ACTIONS) write(`motions/${action.id}.motion3.json`, api.makeCubismMotion(action.id));
for (const id of Object.keys(api.EXPRESSION_SPECS)) write(`expressions/${id}.exp3.json`, api.makeCubismExpression(id));
write('parameters.json', { _comment: '青穗集 · 参数绑定目标；这些数值不是已经存在的模型关键形。', canvas: [1536, 1536], parameterCount: api.SUINAI_CUBISM_PARAMETERS.length, parameters: api.SUINAI_CUBISM_PARAMETERS });
write('action-map.json', { _comment: '青穗集 · 场景动作与模型文件诚实分离；拿笔动作是专注整理替代。', modelStatus: 'NOT_CREATED', requiresOriginalSuinaiMoc3: true, motions: api.SUINAI_ACTIONS.map(action => ({ id: action.id, label: action.label, gesture: action.gesture, requestedGesture: action.requestedGesture, file: `motions/${action.id}.motion3.json`, playback: action.playback, substitution: action.substitution, trigger: action.trigger })) });
write('delivery-status.json', { _comment: '青穗集 · motion3/exp3格式导出不等于Cubism模型制作完成。', motions: 40, expressions: 12, parameterDefinitions: api.SUINAI_CUBISM_PARAMETERS.length, moc3: false, cmo3: false, nativeEditorRiggingVerified: false, sdkParserVerification: 'see logs, not assumed from export' });
console.log(`Exported 40 motions + 12 expressions + ${api.SUINAI_CUBISM_PARAMETERS.length} parameter definitions. No moc3/cmo3 was created.\n${output}`);
