/** 青穗集 · 像素角色回归：比例边界、独立神态、局部手势、自然眨眼及两种渲染的同源性。 */
import { describe, expect, it } from "vitest";
import { createSuinaiFrame, paintSuinaiFrame, poseForFace, faceForPose, SPRITE_AVATAR, SPRITE_DETAIL, SPRITE_HEIGHT, SPRITE_LAYOUT, SPRITE_LOOP, SPRITE_SCALE, SPRITE_PALETTE, SPRITE_POSES, SPRITE_FACES, SPRITE_WIDTH, type SpriteFrame } from "./suinai";

function rawRegion(frame: SpriteFrame, x: number, y: number, width: number, height: number) {
  return Array.from({ length: height }, (_, row) => Array.from(frame.pixels.slice((y+row)*frame.width+x,(y+row)*frame.width+x+width))).flat();
}
function region(frame: SpriteFrame, x: number, y: number, width: number, height: number) {
  return rawRegion(frame, x*SPRITE_DETAIL, y*SPRITE_DETAIL, width*SPRITE_DETAIL, height*SPRITE_DETAIL);
}
function includesColor(frame: SpriteFrame, x: number, y: number, width: number, height: number, color: string) {
  return region(frame,x,y,width,height).some((index) => SPRITE_PALETTE[index] === color);
}
function span(frame: SpriteFrame, y: number) {
  const columns = Array.from({ length: frame.width }, (_, x) =>
    Array.from({ length: SPRITE_DETAIL }, (_, row) => frame.pixels[(y*SPRITE_DETAIL+row)*frame.width+x]).some(Boolean),
  );
  const first = columns.findIndex(Boolean);
  const last = columns.length - 1 - [...columns].reverse().findIndex(Boolean);
  return first < 0 ? 0 : last - first + 1;
}

describe("Suinai's expressive half-body sprite", () => {
  it("all six poses and all expressions stay inside a transparent, palette-indexed grid", () => {
    for (const pose of SPRITE_POSES) for (let tick=0;tick<SPRITE_LOOP;tick++) {
      const frame=createSuinaiFrame(pose.id,tick);
      expect([frame.width,frame.height]).toEqual([SPRITE_WIDTH,SPRITE_HEIGHT]);
      expect(frame.pixels.length).toBe(SPRITE_WIDTH*SPRITE_HEIGHT);
      expect(Math.max(...frame.pixels)).toBeLessThan(SPRITE_PALETTE.length);
      expect(rawRegion(frame,0,0,SPRITE_WIDTH,4).every((p)=>p===0)).toBe(true);
      expect(rawRegion(frame,0,0,10,SPRITE_HEIGHT).every((p)=>p===0)).toBe(true);
      expect(rawRegion(frame,SPRITE_WIDTH-10,0,10,SPRITE_HEIGHT).every((p)=>p===0)).toBe(true);
      expect(rawRegion(frame,0,SPRITE_HEIGHT-3,SPRITE_WIDTH,3).every((p)=>p===0)).toBe(true);
    }
    for(const face of SPRITE_FACES) expect(createSuinaiFrame("journal",0,face.id).pixels.length).toBe(SPRITE_WIDTH*SPRITE_HEIGHT);
  });
  it("fixed ticks are reproducible and loop without a second asset set", () => {
    expect(createSuinaiFrame("write",3)).toEqual(createSuinaiFrame("write",3));
    expect(createSuinaiFrame("write",3)).toEqual(createSuinaiFrame("write",3+SPRITE_LOOP));
    expect(createSuinaiFrame("write",-1)).toEqual(createSuinaiFrame("write",SPRITE_LOOP-1));
    expect(createSuinaiFrame("write",NaN)).toEqual(createSuinaiFrame("write",0));
  });
  it("keeps the same head, chestnut hair, silver glasses and wheat pin across poses", () => {
    const reference=createSuinaiFrame("journal",0,"smile");
    for(const pose of SPRITE_POSES) expect(region(createSuinaiFrame(pose.id,0,"smile"),26,5,46,42)).toEqual(region(reference,26,5,46,42));
    expect(includesColor(reference,34,26,28,11,"#d6e2e4")).toBe(true);
    expect(includesColor(reference,56,13,13,15,"#e4c78c")).toBe(true);
  });
  it("leaves a wider shoulder/arm silhouette than the skull and actual skin detail for hands", () => {
    const frame=createSuinaiFrame();
    expect(span(frame,20)/span(frame,80)).toBeLessThan(.8);
    const skinColors=new Set(["#e8b29b","#f6cfb2","#ffe2c6"]);
    const handSkin=region(frame,22,82,55,31).filter((index)=>skinColors.has(SPRITE_PALETTE[index])).length;
    expect(handSkin).toBeGreaterThan(65);
  });
  it("has eight distinct static expressions instead of identical smiles with different labels", () => {
    const faces=SPRITE_FACES.map(({id})=>region(createSuinaiFrame("journal",0,id),35,24,26,20).join(","));
    expect(new Set(faces).size).toBe(SPRITE_FACES.length);
    expect(faceForPose("write")).toBe("think");
    expect(faceForPose("listen")).toBe("listen");
    expect(createSuinaiFrame("write",0)).toEqual(createSuinaiFrame("write",0,"think"));
  });
  it("blinks through half-closed lids without moving glasses, mouth, arms or props", () => {
    const open=createSuinaiFrame("journal",0), half=createSuinaiFrame("journal",35), closed=createSuinaiFrame("journal",36);
    expect(rawRegion(open,0,0,SPRITE_WIDTH,29*SPRITE_DETAIL)).toEqual(rawRegion(closed,0,0,SPRITE_WIDTH,29*SPRITE_DETAIL));
    expect(region(open,36,29,24,7)).not.toEqual(region(half,36,29,24,7));
    expect(region(half,36,29,24,7)).not.toEqual(region(closed,36,29,24,7));
    expect(rawRegion(open,0,37*SPRITE_DETAIL,SPRITE_WIDTH,91*SPRITE_DETAIL)).toEqual(rawRegion(closed,0,37*SPRITE_DETAIL,SPRITE_WIDTH,91*SPRITE_DETAIL));
  });
  it("moves the gaze inside the lenses, not the entire face", () => {
    const front=createSuinaiFrame("journal",0), aside=createSuinaiFrame("journal",8);
    expect(region(front,36,29,24,7)).not.toEqual(region(aside,36,29,24,7));
    expect(rawRegion(front,0,37*SPRITE_DETAIL,SPRITE_WIDTH,91*SPRITE_DETAIL)).toEqual(rawRegion(aside,0,37*SPRITE_DETAIL,SPRITE_WIDTH,91*SPRITE_DETAIL));
    expect(rawRegion(front,0,0,SPRITE_WIDTH,29*SPRITE_DETAIL)).toEqual(rawRegion(aside,0,0,SPRITE_WIDTH,29*SPRITE_DETAIL));
  });
  it("pen, paper and listening hand have local keyframes independent of the head", () => {
    for(const [pose,tick] of [["write",2],["compare",8],["review",8],["filed",10],["listen",8]] as const) {
      const first=createSuinaiFrame(pose,0,"think"), next=createSuinaiFrame(pose,tick,"think");
      expect(region(first,26,5,46,42)).toEqual(region(next,26,5,46,42));
      expect(region(first,10,48,76,77)).not.toEqual(region(next,10,48,76,77));
    }
  });
  it("has six distinct action frames with recognizable listening and review hands", () => {
    const poses=SPRITE_POSES.map((pose)=>region(createSuinaiFrame(pose.id,0,"smile"),10,56,76,67).join(","));
    expect(new Set(poses).size).toBe(SPRITE_POSES.length);
    // 倾听时抬手到脸侧；确认时摊掌到纸页旁；不会共享同一只悬空小手。
    expect(includesColor(createSuinaiFrame("listen"),58,48,13,15,"#ffe2c6")).toBe(true);
    expect(includesColor(createSuinaiFrame("review"),64,88,18,13,"#ffe2c6")).toBe(true);
  });
  it("keeps the rounded chin connected to the neck across breathing and blinking", () => {
    const hair = new Set(["#403341", "#634332", "#86553c", "#a97048"]);
    for (const pose of SPRITE_POSES) for (const tick of [0, 20, 23, 35, 36]) {
      const frame = createSuinaiFrame(pose.id, tick);
      const underChin = region(frame, 45, 47, 7, 4).filter((index) => hair.has(SPRITE_PALETTE[index]));
      expect(underChin).toHaveLength(0);
    }
  });
  it("uses the denser native grid for single pixel contour details", () => {
    expect(SPRITE_WIDTH).toBe(SPRITE_LAYOUT.width * SPRITE_DETAIL);
    expect(SPRITE_HEIGHT).toBe(SPRITE_LAYOUT.height * SPRITE_DETAIL);
    const frame = createSuinaiFrame();
    const hasSingleNativePixel = frame.pixels.some((color, index) => {
      if (!color) return false;
      const x = index % frame.width;
      const y = Math.floor(index / frame.width);
      return (x % SPRITE_DETAIL === 1 && frame.pixels[index - 1] !== color) ||
        (y % SPRITE_DETAIL === 1 && frame.pixels[index - frame.width] !== color);
    });
    expect(hasSingleNativePixel).toBe(true);
  });
  it("never treats an expression as proof that a draft was saved", () => {
    expect(poseForFace("happy")).toBe("journal");
    expect(poseForFace("think")).toBe("write");
    expect(poseForFace("warn")).toBe("review");
  });
  it("both renderers use the same grid and an independent face-only avatar crop", () => {
    const frame=createSuinaiFrame();
    for(const mode of ["pixel","dots"] as const) {
      const calls={rects:0,arcs:0};
      const context={ canvas:{width:0,height:0},imageSmoothingEnabled:true,fillStyle:"",clearRect:()=>{},fillRect:()=>{calls.rects++;},beginPath:()=>{},arc:()=>{calls.arcs++;},fill:()=>{} } as unknown as CanvasRenderingContext2D;
      paintSuinaiFrame(context,frame,mode);
      expect(context.canvas.width).toBe(SPRITE_WIDTH*SPRITE_SCALE);
      expect(context.canvas.height).toBe(SPRITE_HEIGHT*SPRITE_SCALE);
      expect(context.imageSmoothingEnabled).toBe(false);
      const filled=Array.from(frame.pixels).filter(Boolean).length;
      expect(mode === "pixel" ? calls.rects : calls.arcs).toBe(filled);
      expect(mode === "pixel" ? calls.arcs : calls.rects).toBe(0);
      paintSuinaiFrame(context,frame,mode,true);
      expect(context.canvas.width).toBe(SPRITE_AVATAR.width*SPRITE_SCALE);
      expect(context.canvas.height).toBe(SPRITE_AVATAR.height*SPRITE_SCALE);
    }
  });
});

