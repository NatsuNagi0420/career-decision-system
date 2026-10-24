/** 青穗集 · 穗奈像素角色：舒展的半身比例、可辨手势与状态神态；共用整数网格，不伪造保存结果。 */
export type Face = "smile" | "think" | "happy" | "listen" | "explain" | "worry" | "warn" | "encourage";
export type SpriteMode = "pixel" | "dots";
export type SpritePose = "journal" | "listen" | "write" | "compare" | "review" | "filed";
// 构图坐标保持 96×128；每格拆为 2×2 原生像素，允许用 0.5 构图单位精修轮廓。
export const SPRITE_LAYOUT = { width: 96, height: 128 } as const;
export const SPRITE_DETAIL = 2;
export const SPRITE_WIDTH = SPRITE_LAYOUT.width * SPRITE_DETAIL;
export const SPRITE_HEIGHT = SPRITE_LAYOUT.height * SPRITE_DETAIL;
export const SPRITE_SCALE = 2;
export const SPRITE_AVATAR = { x: 26 * SPRITE_DETAIL, y: 5 * SPRITE_DETAIL, width: 46 * SPRITE_DETAIL, height: 50 * SPRITE_DETAIL } as const;
export const SPRITE_FPS = 8;
export const SPRITE_LOOP = 48;

// 同一份固定色板供方块、点阵和离线导出使用，0 号为透明。
export const SPRITE_PALETTE = [
  "transparent", "#403341", "#634332", "#86553c", "#a97048", "#c58b59", "#e2b879",
  "#e8b29b", "#f6cfb2", "#ffe2c6", "#fff1dd", "#ba796f", "#fff7eb",
  "#95643d", "#dba65b", "#9ba9b6", "#d6e2e4", "#7186b0", "#94add6",
  "#b5cef0", "#e0ebfa", "#e4d9ce", "#42887f", "#6bb1a2", "#a7d0b6",
  "#e4c78c", "#b09161", "#d9a09b", "#f0c6ab", "#dca98e",
] as const;
const C = {
  ink: 1, hairDark: 2, hairShade: 3, hair: 4, hairLight: 5, hairShine: 6,
  skinShade: 7, skin: 8, skinLight: 9, skinShine: 10, mouth: 11, white: 12,
  irisDark: 13, iris: 14, glasses: 15, glassLight: 16, clothDark: 17,
  cloth: 18, clothLight: 19, clothShine: 20, shirtShade: 21,
  greenDark: 22, green: 23, greenLight: 24, wheat: 25, gold: 26, blush: 27,
  skinContour: 28, neckShade: 29,
} as const;
export const SPRITE_POSES: ReadonlyArray<{ id: SpritePose; name: string; note: string }> = [
  { id: "journal", name: "拿起手账", note: "放松地捧着手账，偶尔移开视线，再看向你。" },
  { id: "listen", name: "专注倾听", note: "抬手到脸侧、微微点头；给你把话说完的空间。" },
  { id: "write", name: "记笔记", note: "视线落到纸上，手腕和笔尖一起移动。" },
  { id: "compare", name: "对照资料", note: "展开双臂展示两份资料，解释时眼神和嘴形有变化。" },
  { id: "review", name: "请你确认", note: "一手递资料，一手摊掌邀请你检查；确认前不保存。" },
  { id: "filed", name: "收好成果", note: "手指扶住文件夹、把纸页收进去；仅为本地动作演示。" },
];
export const SPRITE_FACES: ReadonlyArray<{ id: Face; name: string }> = [
  { id: "smile", name: "放松" }, { id: "listen", name: "倾听" },
  { id: "think", name: "思考" }, { id: "explain", name: "解释" },
  { id: "encourage", name: "鼓励" }, { id: "happy", name: "开心" },
  { id: "worry", name: "关切" }, { id: "warn", name: "提醒" },
];
export function poseForFace(face: Face): SpritePose {
  switch (face) {
    case "think": return "write";
    case "listen": return "listen";
    case "explain": return "compare";
    case "warn": case "worry": return "review";
    // 开心不是保存证据，收好资料只能由显式状态指定。
    default: return "journal";
  }
}
export function faceForPose(pose: SpritePose): Face {
  return ({ journal: "smile", listen: "listen", write: "think", compare: "explain", review: "encourage", filed: "smile" } as const)[pose];
}
export interface SpriteFrame { width: number; height: number; pixels: Uint8Array }
type Point = readonly [number, number];

class Grid {
  readonly pixels = new Uint8Array(SPRITE_WIDTH * SPRITE_HEIGHT);
  private fill(x: number, y: number, width: number, height: number, color: number) {
    for (let row=Math.max(0,y);row<Math.min(SPRITE_HEIGHT,y+height);row++) {
      const start=row*SPRITE_WIDTH+Math.max(0,x), end=row*SPRITE_WIDTH+Math.min(SPRITE_WIDTH,x+width);
      if (end>start) this.pixels.fill(color,start,end);
    }
  }
  put(x: number, y: number, color: number, size = 1) { this.rect(x,y,size,size,color); }
  rect(x: number, y: number, width: number, height: number, color: number) {
    this.fill(Math.round(x*SPRITE_DETAIL),Math.round(y*SPRITE_DETAIL),Math.round(width*SPRITE_DETAIL),Math.round(height*SPRITE_DETAIL),color);
  }
  line(x0: number, y0: number, x1: number, y1: number, color: number, width = 1) {
    // 在原生网格求整数阶梯，不把旧的低分辨率斜线简单放大两倍。
    x0=Math.round(x0*SPRITE_DETAIL); y0=Math.round(y0*SPRITE_DETAIL);
    x1=Math.round(x1*SPRITE_DETAIL); y1=Math.round(y1*SPRITE_DETAIL);
    const stroke=Math.max(1,Math.round(width*SPRITE_DETAIL));
    const dx=Math.abs(x1-x0), sx=x0<x1 ? 1 : -1;
    const dy=-Math.abs(y1-y0), sy=y0<y1 ? 1 : -1;
    let error=dx+dy;
    for (;;) {
      this.fill(x0,y0,stroke,stroke,color);
      if(x0===x1 && y0===y1) break;
      const twice=2*error;
      if(twice>=dy) { error+=dy; x0+=sx; }
      if(twice<=dx) { error+=dx; y0+=sy; }
    }
  }
  polygon(points: readonly Point[], color: number) {
    const vertices=points.map(([x,y])=>[Math.round(x*SPRITE_DETAIL),Math.round(y*SPRITE_DETAIL)] as const);
    const minY=Math.min(...vertices.map(([,y])=>y)), maxY=Math.max(...vertices.map(([,y])=>y));
    for(let y=minY;y<=maxY;y++) {
      const cuts:number[]=[];
      for(let i=0;i<vertices.length;i++) {
        const a=vertices[i],b=vertices[(i+1)%vertices.length];
        if((a[1]<=y && b[1]>y) || (b[1]<=y && a[1]>y)) cuts.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      cuts.sort((a,b)=>a-b);
      for(let i=0;i+1<cuts.length;i+=2) this.fill(Math.ceil(cuts[i]),y,Math.floor(cuts[i+1])-Math.ceil(cuts[i])+1,1,color);
    }
  }
  stamp(source: Grid, dx: number, dy: number, fromY = 0, toY: number = SPRITE_LAYOUT.height) {
    const offsetX=Math.round(dx*SPRITE_DETAIL),offsetY=Math.round(dy*SPRITE_DETAIL);
    for(let y=fromY*SPRITE_DETAIL;y<toY*SPRITE_DETAIL;y++) for(let x=0;x<SPRITE_WIDTH;x++) {
      const color=source.pixels[y*SPRITE_WIDTH+x],targetX=x+offsetX,targetY=y+offsetY;
      if(color && targetX>=0 && targetX<SPRITE_WIDTH && targetY>=0 && targetY<SPRITE_HEIGHT) this.pixels[targetY*SPRITE_WIDTH+targetX]=color;
    }
  }
}

function glasses(g: Grid, x: number, y: number) {
  const ring: readonly Point[] = [[-3,-4],[3,-4],[5,-2],[5,2],[3,4],[-3,4],[-5,2],[-5,-2],[-3,-4]];
  for (let i = 0; i < ring.length - 1; i++) g.line(x + ring[i][0], y + ring[i][1], x + ring[i + 1][0], y + ring[i + 1][1], C.glasses,.5);
  g.line(x - 2,y - 4,x + 2,y - 4,C.glassLight,.5);
  g.put(x - 4,y - 2,C.glassLight,.5);
  g.line(x - 2,y + 4,x + 2,y + 4,C.glassLight,.5);
}
function eye(g: Grid, x: number, y: number, face: Face, tick: number) {
  const closed = tick === 36 || tick === 37;
  if (closed || face === "happy") {
    const smile = face === "happy";
    g.line(x - 3,y + 1,x - 1,y + (smile ? 0 : 2),C.hairDark,.5);
    g.line(x - 1,y + (smile ? 0 : 2),x + 1,y + (smile ? 0 : 2),C.hairDark,.5);
    g.line(x + 1,y + (smile ? 0 : 2),x + 3,y + 1,C.hairDark,.5);
    return;
  }
  const half = tick === 35 || tick === 38;
  const down = face === "think" ? 1 : 0;
  const glance = face === "think" ? -1 : tick >= 8 && tick < 13 && face === "smile" ? 1 : 0;
  // 眼睑、眼白与瞳孔分开，视线只在镜片内移动，不把五官整块平移。
  g.polygon([[x-3,y+.5],[x-2,y],[x+2,y],[x+3,y+1],[x+2.5,y+3.5],[x-2,y+3.5],[x-3,y+2.5]],C.white);
  g.put(x - 3,y,C.skinLight); g.put(x + 3,y,C.skinLight);
  g.rect(x - .5 + glance,y + down,2.5,3.5 - down,C.irisDark);
  g.rect(x + glance,y + 2 + down,1.5,1.5 - down,C.iris);
  g.rect(x + .5 + glance,y + down,.5,2,C.hairDark);
  g.rect(x + glance,y + .5 + down,.5,1,C.white);
  g.line(x - 2,y - 1 + Number(half),x + 2,y - 1 + Number(half),C.hairDark,.5);
  g.put(x - 3,y + Number(half),C.hairDark,.5); g.put(x + 3,y + Number(half),C.hairDark,.5);
  if (half) g.rect(x - 2,y,5,1,C.skinShade);
  g.put(x - 2,y + 3.5,C.skinContour,.5); g.put(x + 2,y + 3.5,C.skinContour,.5);
}
function head(g: Grid, face: Face, tick: number) {
  // 头颅与躯干分层：栗发轮廓保持一致，表情由眉眼口共同组成。
  g.polygon([[38,10],[50,6],[60,10],[66,19],[68,42],[72,61],[67,69],[58,65],[55,52],[53,48],[43,48],[41,52],[39,65],[28,69],[25,62],[28,43],[28,24],[32,15]],C.ink);
  g.polygon([[38,12],[50,8],[59,12],[64,20],[65,43],[69,61],[66,66],[57,62],[54,50],[52,47],[44,47],[42,51],[40,62],[30,65],[28,61],[31,42],[30,25],[34,16]],C.hairShade);
  g.polygon([[32,33],[36,32],[36,53],[33,62],[29,63],[31,56]],C.hair);
  g.polygon([[61,30],[65,36],[65,52],[68,61],[64,63],[60,55]],C.hair);
  g.line(31,40,30,58,C.hairLight); g.line(64,44,65,58,C.hairLight);
  // 下颌由颊部逐渐收圆，底部停在颈部上缘，不拉成长三角形。
  g.polygon([[36,22],[43,17],[53,17],[61,24],[62,33],[61,37],[59.5,40],[57.5,42.5],[55,44.5],[52,46],[50,46.5],[48.5,47],[46.5,47],[44,46],[41,44.5],[38.5,42],[36,39],[34,35],[33,31],[33,27]],C.skinContour);
  g.polygon([[37,23],[44,19],[52,19],[59.5,25],[61,33],[60,36.5],[58.5,39.5],[56.5,42],[54,44],[51.5,45.5],[49.5,46],[48,46.5],[46,46.5],[44.5,45.5],[41.5,44],[39,41.5],[36.5,38.5],[35,34],[34.5,30],[35,27]],C.skinLight);
  g.polygon([[34.5,29],[36,31],[36.5,35],[38.5,39],[42,43],[45,45.5],[43.5,45],[40.5,43.5],[37.5,40.5],[35,36],[34,32]],C.skin);
  g.rect(60,29,3,7,C.skin); g.line(61,31,61,34,C.skinShade);
  // 成束高光而非随机噪点，保留原来的侧分刘海。
  g.polygon([[31,22],[37,14],[49,10],[58,14],[64,22],[64,31],[59,29],[54,23],[50,19],[46,26],[40,31],[33,35],[30,37]],C.hairDark);
  g.polygon([[33,22],[38,16],[48,12],[57,16],[62,22],[62,28],[57,25],[50,16],[45,24],[39,29],[33,32]],C.hair);
  g.polygon([[34,23],[39,17],[46,14],[43,20],[37,25],[33,29]],C.hairLight);
  g.polygon([[51,13],[56,16],[60,21],[61,25],[55,21]],C.hairLight);
  g.line(36,21,42,17,C.hairShine); g.line(41,24,45,18,C.hairShade);
  g.line(34,37,34,50,C.hairDark); g.line(34,50,32,59,C.hairDark);
  g.line(61,36,60,51,C.hairDark); g.line(60,51,64,60,C.hairDark);
  // 不同眉峰和眉间距离，避免所有状态都只换嘴形。
  if (face === "worry" || face === "warn") {
    g.line(38,27,43,25,C.hairDark,.5); g.line(52,25,57,27,C.hairDark,.5);
  } else if (face === "think") {
    g.line(38,27,43,27,C.hairDark,.5); g.line(52,25,57,26,C.hairDark,.5);
  } else if (face === "listen") {
    g.line(38,25,43,24,C.hairDark,.5); g.line(52,24,57,25,C.hairDark,.5);
  } else {
    g.line(38,26,42,25,C.hairDark,.5); g.line(53,25,57,26,C.hairDark,.5);
  }
  eye(g,41,30,face,tick); eye(g,54,30,face,tick);
  glasses(g,41,31); glasses(g,54,31);
  g.line(46,30,49,30,C.glasses,.5); g.put(47,29,C.glassLight,.5);
  g.line(34,29,36,30,C.glasses,.5); g.line(59,30,61,28,C.glasses,.5);
  g.line(48,34.5,47.5,37,C.skinContour,.5); g.put(48,37.5,C.skinShine,.5);
  const warm = face === "happy" || face === "encourage";
  g.rect(36,37,warm ? 4 : 3,1,C.blush); g.rect(56,37,warm ? 4 : 3,1,C.blush);
  const talking = face === "explain" && tick % 12 >= 4 && tick % 12 < 8;
  if (talking || face === "happy") {
    g.line(45,40,50,40,C.mouth,.5); g.rect(46,41,4,1.5,C.mouth); g.rect(46,40,4,1,C.white);
  } else if (face === "explain") {
    g.line(46,41,49,41,C.mouth,.5); g.put(50,40,C.mouth,.5);
  } else if (face === "listen") {
    g.line(46,41,49,41,C.mouth,.5);
  } else if (face === "think") {
    g.line(47,41,50,41,C.mouth,.5); g.put(46,40,C.skinShade);
  } else if (face === "worry") {
    g.line(45,42,47,41,C.mouth,.5); g.line(47,41,50,42,C.mouth,.5);
  } else if (face === "warn") {
    g.line(45,41,50,41,C.mouth,.5); g.put(50,42,C.mouth,.5);
  } else {
    g.line(45,40,47,41,C.mouth,.5); g.line(47,41,50,40,C.mouth,.5);
    if (face === "encourage") g.line(47,42,49,42,C.skinContour,.5);
  }
  // 麦穗固定在画面右边：一根茎、交错麦粒、少量高光。
  g.line(59,26,65,15,C.gold); g.line(60,25,65,16,C.wheat);
  for (const [x,y] of [[60,23],[62,20],[64,17]] as const) {
    g.rect(x - 2,y - 2,2,2,C.wheat); g.rect(x + 1,y,2,2,C.wheat); g.put(x - 2,y - 2,C.skinShine);
  }
}

function neck(g: Grid, breath: number) {
  const b = breath;
  // 颈部两侧向衣领打开；下巴投影仅占一条窄弧，不再画整块深色矩形。
  g.polygon([[44,45+b],[53,45+b],[53,51+b],[55.5,54+b],[53,56+b],[44,56+b],[41.5,54+b],[44,51+b]],C.skin);
  g.polygon([[45,48+b],[51.5,48+b],[51.5,52+b],[53.5,54+b],[46,54.5+b],[44.5,53+b]],C.skinLight);
  // 下巴投影改成浅浅的弧线：中心略低，两侧提前回收，避免平直横线。
  g.polygon([[44,46+b],[46,46.5+b],[48,47+b],[50,46.5+b],[53,46+b],[53,47+b],[50,48.5+b],[47,48+b],[44,47+b]],C.skinContour);
  g.line(44.5,47+b,47,48+b,C.neckShade,.5);
}
function torso(g: Grid, breath: number) {
  const b = breath;
  g.polygon([[34,54+b],[43,52+b],[55,52+b],[63,56+b],[70,65],[66,91],[69,123],[27,123],[30,91],[25,64]],C.ink);
  g.polygon([[35,56+b],[44,54+b],[54,54+b],[62,58+b],[67,65],[63,91],[66,123],[30,123],[33,91],[28,65]],C.cloth);
  g.polygon([[42,54+b],[55,54+b],[59,64],[56,104],[58,123],[38,123],[40,103],[37,65]],C.shirtShade);
  g.polygon([[43,55+b],[53,55+b],[56,64],[53,104],[55,123],[41,123],[43,104],[40,64]],C.white);
  neck(g, b);
  g.line(41,55+b,47,58+b,C.skinShade); g.line(47,58+b,55,55+b,C.skinShade);
  g.polygon([[36,56+b],[41,55+b],[39,65],[42,70],[36,67],[33,60]],C.clothLight);
  g.polygon([[57,55+b],[62,58+b],[63,64],[57,70],[58,64]],C.clothLight);
  g.line(35,69,33,103,C.clothDark); g.line(61,70,63,105,C.clothDark);
  g.line(32,110,31,119,C.clothLight); g.line(63,109,65,119,C.clothDark);
  g.line(41,72,42,92,C.skinShine);
  g.rect(32,107,6,1,C.clothDark); g.rect(59,107,6,1,C.clothDark);
  g.rect(33,108,4,6,C.clothLight); g.rect(60,108,4,6,C.clothLight);
  g.put(60,75,C.wheat); g.put(60,88,C.wheat); g.put(61,103,C.wheat);
  g.line(30,121,65,121,C.clothDark);
}
function sleeve(g: Grid, points: readonly Point[], highlights: readonly [Point, Point][]) {
  g.polygon(points,C.ink);
  // 手臂内部以缩进色块形成弯肘，避免靠悬浮手掌表现动作。
  const centerX = points.reduce((sum,[x]) => sum + x,0) / points.length;
  const centerY = points.reduce((sum,[,y]) => sum + y,0) / points.length;
  g.polygon(points.map(([x,y]) => [Math.round(x + (centerX - x) * .16), Math.round(y + (centerY - y) * .08)] as const),C.cloth);
  for (const [a,b] of highlights) g.line(a[0],a[1],b[0],b[1],C.clothLight);
}
function hand(g: Grid, x: number, y: number, kind: "grip" | "chin" | "offer" = "grip", mirror = false) {
  const point = ([px,py]: Point): Point => [x + (mirror ? 9 - px : px),y + py];
  const p = (points: readonly Point[],color: number) => g.polygon(points.map(point),color);
  const l = (a: Point,b: Point,color: number) => { const aa=point(a),bb=point(b); g.line(aa[0],aa[1],bb[0],bb[1],color); };
  if (kind === "chin") {
    p([[0,5],[1,1],[3,0],[4,1],[4,4],[6,3],[8,4],[9,7],[8,11],[5,14],[1,13],[-1,10],[-2,7]],C.hairShade);
    p([[1,5],[2,1],[3,2],[3,7],[6,4],[7,5],[8,8],[7,11],[4,13],[1,11],[0,8],[-1,7]],C.skin);
    p([[1,6],[3,7],[4,9],[3,12],[1,10],[-1,7]],C.skinLight);
    l([5,6],[7,7],C.skinShade); l([4,9],[7,10],C.skinShade);
  } else if (kind === "offer") {
    // 侧向摊掌有朝上的掌心与并拢手指，不用竖起五指的“停止”手势。
    p([[0,6],[2,4],[6,4],[9,2],[11,3],[10,5],[8,7],[12,6],[14,7],[13,9],[9,11],[3,11],[0,9],[-2,7]],C.hairShade);
    p([[0,7],[2,5],[6,5],[9,3],[10,3],[8,6],[6,8],[12,7],[13,8],[9,10],[3,10],[0,8]],C.skin);
    p([[2,6],[5,6],[7,8],[5,9],[2,8]],C.skinLight);
    l([8,8],[11,8],C.skinShade);
  } else {
    p([[0,3],[2,1],[5,0],[8,2],[9,6],[8,10],[2,11],[-1,8],[-1,5]],C.hairShade);
    p([[0,4],[3,1],[5,1],[7,3],[8,6],[7,9],[2,10],[0,8]],C.skin);
    p([[0,4],[2,2],[5,2],[6,4],[2,5],[1,8],[-1,7]],C.skinLight);
    l([4,5],[7,6],C.skinShade); l([4,8],[7,8],C.skinShade);
  }
}
function card(g: Grid,x: number,y: number,accent: number,height = 24) {
  g.rect(x+1,y+1,20,height,C.shirtShade); g.rect(x,y,20,height,C.hairShade);
  g.rect(x+1,y+1,18,height-2,C.white); g.rect(x+3,y+4,13,4,accent);
  g.line(x+3,y+12,x+15,y+12,C.glasses); g.line(x+3,y+16,x+13,y+16,C.glasses);
  if (height > 24) g.line(x+3,y+20,x+10,y+20,C.glasses);
}
function journal(g: Grid,y: number) {
  g.polygon([[30,y],[45,y+2],[48,y+5],[51,y+2],[68,y],[68,y+24],[51,y+26],[45,y+26],[30,y+24]],C.hairShade);
  g.polygon([[31,y+1],[44,y+3],[47,y+6],[47,y+24],[31,y+22]],C.white);
  g.polygon([[49,y+6],[52,y+3],[67,y+1],[67,y+22],[49,y+24]],C.skinShine);
  g.line(48,y+6,48,y+25,C.gold); g.line(31,y+24,46,y+26,C.greenDark); g.line(50,y+26,68,y+24,C.greenDark);
  for(let i=0;i<3;i++) {
    g.line(34,y+7+i*4,43,y+8+i*4,C.glassLight); g.line(53,y+8+i*4,63,y+7+i*4,C.glassLight);
  }
  g.line(33,y+21,44,y+23,C.shirtShade); g.line(53,y+23,65,y+21,C.shirtShade);
  g.rect(67,y+7,3,3,C.wheat); g.rect(67,y+13,3,3,C.greenLight);
}
function action(g: Grid,pose: SpritePose,tick: number,b: number) {
  const write = pose === "write";
  const pen = write ? [0,1,2,1][Math.floor(tick / 2) % 4] : 0;
  const lift = tick >= 8 && tick < 16 ? 1 : 0;
  if (pose === "listen") {
    sleeve(g,[[29,58+b],[36,65],[32,85],[39,97],[34,107],[23,101],[19,91],[22,69]],[[[25,73],[23,91]],[[24,94],[31,101]]]);
    sleeve(g,[[65,58+b],[72,64],[80,90],[77,98],[70,99],[57,66],[58,59],[66,61]],[[[72,71],[76,89]],[[69,87],[61,66]]]);
    g.rect(34,83+b,22,29,C.greenDark); g.rect(36,84+b,18,26,C.green); g.rect(38,85+b,1,24,C.greenLight);
    g.rect(54,88+b,3,3,C.wheat); g.rect(54,96+b,3,3,C.greenLight);
    g.line(29,98,35,94,C.clothShine); hand(g,31,98+b);
    g.line(59,64,66,62,C.clothShine); hand(g,59,48+b+lift,"chin");
  } else if (pose === "compare") {
    sleeve(g,[[29,58+b],[36,66],[31,88],[29,103],[19,106],[17,97],[21,72]],[[[24,73],[21,94]]]);
    sleeve(g,[[64,58+b],[72,65],[80,96],[78,106],[69,103],[65,87],[60,66]],[[[72,73],[76,93]]]);
    card(g,19,77+b,C.cloth,27); card(g,58,77+b-lift,C.green,27);
    hand(g,17,99+b); hand(g,72,99+b-lift,"grip",true);
  } else if (pose === "review") {
    sleeve(g,[[29,58+b],[36,65],[32,86],[41,100],[37,110],[26,105],[20,93],[21,75]],[[[25,72],[23,92]],[[25,98],[33,104]]]);
    sleeve(g,[[64,58+b],[72,65],[79,96],[75,104],[66,103],[61,95],[63,83],[59,66]],[[[72,73],[75,93]]]);
    card(g,34,78+b-lift,C.wheat,33); hand(g,29,102+b);
    g.line(64,96,71,99,C.clothShine); hand(g,65,87+b-lift,"offer");
  } else if (pose === "filed") {
    sleeve(g,[[29,58+b],[36,66],[30,90],[39,106],[34,116],[24,109],[19,96],[21,74]],[[[25,73],[22,94]],[[25,105],[31,111]]]);
    sleeve(g,[[65,58+b],[72,64],[79,95],[76,109],[67,114],[61,106],[67,91],[60,67]],[[[72,73],[75,94]]]);
    const slide=tick < 8 ? 0 : tick < 16 ? 3 : 6;
    g.rect(30,100+b,40,21,C.gold); g.rect(31,97+b,15,4,C.gold);
    card(g,42,80+b+slide,C.greenLight,28);
    g.rect(29,108+b,43,14,C.gold); g.rect(30,109+b,41,12,C.wheat); g.line(31,110+b,69,110+b,C.skinShine);
    hand(g,26,109+b); hand(g,66,108+b,"grip",true);
  } else {
    sleeve(g,[[29,58+b],[36,66],[31,88],[29,97],[38,102],[35,113],[24,110],[18,101],[19,88],[22,72]],[[[24,73],[22,92]],[[23,104],[31,108]]]);
    sleeve(g,[[64,58+b],[72,65],[79,96],[77,104],[68,108],[61,98],[63,87],[59,67]],[[[72,75],[75,94]],[[69,102],[74,100]]]);
    journal(g,83+b);
    g.line(28,102,32,101,C.clothShine); hand(g,25,100+b);
    const x=write ? 57-pen : 64, y=write ? 91+b : 84+b;
    g.polygon([[68,103],[64,98],[x+4,y+7],[x+8,y+8],[73,99]],C.clothDark);
    g.line(x+3,y+10,x+8,y+8,C.clothShine);
    hand(g,x,y,"grip",true);
    g.line(x-2,y+14,x+7,y-4,C.hairDark); g.line(x-1,y+11,x+6,y-3,C.wheat); g.put(x-2,y+15,C.ink);
    if(write && tick % 8 >= 4) g.line(53,101+b,57,100+b,C.glasses);
  }
}

/** 纯帧函数：表情、手势和呼吸独立变化，可静帧检查、离线导出，无模型或业务请求。 */
export function createSuinaiFrame(pose: SpritePose = "journal", tick = 0, face: Face = faceForPose(pose)): SpriteFrame {
  const g = new Grid();
  const frame = ((Math.floor(Number.isFinite(tick) ? tick : 0) % SPRITE_LOOP) + SPRITE_LOOP) % SPRITE_LOOP;
  const breath = frame >= 16 && frame < 32 ? 1 : 0;
  const nod = pose === "listen" && frame >= 20 && frame < 24 ? 1 : 0;
  // 头发在肩后，面部在领口前；固定腰线，不让整张角色上下抖动。
  const h = new Grid(); head(h,face,frame);
  const n = new Grid(); neck(n, breath);
  g.stamp(h,0,breath+nod,50,70);
  torso(g,breath);
  // 两次仅复制互不重叠的行：后发在肩后，脸在领口前，不重复遍历整张画布。
  g.stamp(h,0,breath+nod,5,50);
  // 前景头发的下缘不应盖住脖子；复用同一份颈部图层恢复下巴下方的衔接。
  g.stamp(n,0,0,46,50);
  action(g,pose,frame,breath);
  return { width: SPRITE_WIDTH, height: SPRITE_HEIGHT, pixels: g.pixels };
}

/** 一份像素数据，两种呈现；头像只裁切头部，不让半身缩进聊天小图标。 */
export function paintSuinaiFrame(context: CanvasRenderingContext2D, frame: SpriteFrame, mode: SpriteMode, avatar = false) {
  const crop = avatar ? SPRITE_AVATAR : { x: 0, y: 0, width: frame.width, height: frame.height };
  const scale = SPRITE_SCALE;
  context.canvas.width = crop.width * scale; context.canvas.height = crop.height * scale;
  context.imageSmoothingEnabled = false;
  context.clearRect(0,0,context.canvas.width,context.canvas.height);
  for (let y=0;y<crop.height;y++) for(let x=0;x<crop.width;x++) {
    const color=frame.pixels[(y+crop.y)*frame.width+x+crop.x];
    if(!color) continue;
    context.fillStyle=SPRITE_PALETTE[color];
    if(mode === "dots") { context.beginPath(); context.arc((x+.5)*scale,(y+.5)*scale,scale*.42,0,Math.PI*2); context.fill(); }
    else context.fillRect(x*scale,y*scale,scale,scale);
  }
}

