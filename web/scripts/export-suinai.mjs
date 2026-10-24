/** 青穗集 · 离线导出角色验收帧：读取纯绘制函数，不启动浏览器、不请求 API；保留原稿作同尺寸对照。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
const source=resolve(process.argv[2] || 'web/src/character/suinai.ts');
const out=resolve(process.argv[3] || 'logs/suinai-presence-20261018');
const code=ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const sprite=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const frames=[];
const add=(name,pose,tick,face)=>{const frame=sprite.createSuinaiFrame(pose,tick,face);frames.push({name,width:frame.width,height:frame.height,pixels:Array.from(frame.pixels)});};
for(const pose of sprite.SPRITE_POSES) for(const tick of [0,2,8,20,35,36,38]) add(`${pose.id}-${tick}`,pose.id,tick);
for(const face of sprite.SPRITE_FACES ?? [{id:'smile'}]) add(`face-${face.id}`,'journal',0,face.id);
for(let tick=0;tick<sprite.SPRITE_LOOP;tick++) add(`motion-${tick}`,'listen',tick);
mkdirSync(out,{recursive:true});
writeFileSync(`${out}/frames.json`,JSON.stringify({palette:sprite.SPRITE_PALETTE,frames}));
console.log(`Exported ${frames.length} frames to ${out}/frames.json`);
