// 青穗集 · 穗奈渲染器：代码稿与 v0.4 PNG 素材稿共用状态机，并保留安全回退。
import { useEffect, useRef, useState } from "react";
import { createSuinaiFrame, paintSuinaiFrame, poseForFace, faceForPose, SPRITE_FPS, SPRITE_LOOP, SPRITE_WIDTH, SPRITE_HEIGHT, SPRITE_AVATAR, SPRITE_SCALE, SPRITE_FACES, SPRITE_POSES, type Face, type SpriteMode, type SpritePose } from "../character/suinai";
import { pixelAssetFrameForTick, pixelAssetPath, pixelAssetStateFor, type SpriteSource } from "../character/suinaiAssets";

type Props = {
  face?: Face;
  pose?: SpritePose;
  mode?: SpriteMode;
  source?: SpriteSource;
  animated?: boolean;
  frame?: number;
  avatar?: boolean;
  className?: string;
};

type AssetCrop = { x: number; y: number; width: number; height: number };
const pixelImageCache = new Map<string, HTMLImageElement>();

function paintPixelAsset(context: CanvasRenderingContext2D, image: HTMLImageElement, mode: SpriteMode, avatar: boolean) {
  const crop: AssetCrop = avatar ? SPRITE_AVATAR : { x: 0, y: 0, width: SPRITE_WIDTH, height: SPRITE_HEIGHT };
  const scale = SPRITE_SCALE;
  context.canvas.width = crop.width * scale;
  context.canvas.height = crop.height * scale;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);

  if (mode === "pixel") {
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width * scale, crop.height * scale);
    return;
  }

  const sample = document.createElement("canvas");
  sample.width = SPRITE_WIDTH;
  sample.height = SPRITE_HEIGHT;
  const sampleContext = sample.getContext("2d");
  if (!sampleContext) return;
  sampleContext.imageSmoothingEnabled = false;
  sampleContext.drawImage(image, 0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
  const pixels = sampleContext.getImageData(crop.x, crop.y, crop.width, crop.height).data;
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const offset = (y * crop.width + x) * 4;
      const alpha = pixels[offset + 3];
      if (alpha < 40) continue;
      context.fillStyle = `rgba(${pixels[offset]}, ${pixels[offset + 1]}, ${pixels[offset + 2]}, ${alpha / 255})`;
      context.beginPath();
      context.arc((x + 0.5) * scale, (y + 0.5) * scale, scale * 0.42, 0, Math.PI * 2);
      context.fill();
    }
  }
}

export function SuinaiSprite({ face: requestedFace, pose: requestedPose, mode = "pixel", source = "code", animated = true, frame, avatar = false, className = "" }: Props) {
  // 头像只用中性身体层，避免抬到脸侧的手指混入头部裁切。
  const pose = avatar ? "journal" : requestedPose ?? poseForFace(requestedFace ?? "smile");
  const face = requestedFace ?? faceForPose(requestedPose ?? pose);
  const assetState = source === "pixel-v04-reference" ? pixelAssetStateFor(pose, requestedFace, avatar) : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const [assetImage, setAssetImage] = useState<HTMLImageElement | null>(null);
  const renderedFrame = frame ?? tick;
  const assetFrame = frame === undefined ? pixelAssetFrameForTick(renderedFrame) : ((renderedFrame % 4) + 4) % 4;
  const renderedAssetPath = assetState ? pixelAssetPath(assetState, assetFrame) : null;

  useEffect(() => {
    if (!renderedAssetPath) {
      setAssetImage(null);
      return;
    }
    let active = true;
    const cached = pixelImageCache.get(renderedAssetPath);
    if (cached?.complete && cached.naturalWidth > 0) {
      setAssetImage(cached);
      return () => { active = false; };
    }
    const image = cached ?? new Image();
    if (!cached) {
      image.decoding = "async";
      pixelImageCache.set(renderedAssetPath, image);
    }
    const onLoad = () => { if (active) setAssetImage(image); };
    const onError = () => {
      pixelImageCache.delete(renderedAssetPath);
      if (active) setAssetImage(null);
    };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    setAssetImage(null);
    if (!cached) image.src = renderedAssetPath;
    return () => {
      active = false;
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
  }, [renderedAssetPath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (assetImage && renderedAssetPath) paintPixelAsset(context, assetImage, mode, avatar);
    else paintSuinaiFrame(context, createSuinaiFrame(pose, renderedFrame, face), mode, avatar);
  }, [pose, renderedFrame, face, mode, avatar, assetImage, renderedAssetPath]);

  useEffect(() => {
    setTick(0);
    if (!animated || frame !== undefined || avatar) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = canvas.closest<HTMLElement>("[data-motion]");
    let inView = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      const active = inView && !document.hidden && !preference.matches && root?.dataset.motion !== "off";
      if (active && timer === undefined) timer = setInterval(() => setTick((current) => (current + 1) % SPRITE_LOOP), 1000 / SPRITE_FPS);
      else if (!active && timer !== undefined) { clearInterval(timer); timer = undefined; }
    };
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    observer.observe(canvas);
    const mutation = new MutationObserver(sync);
    if (root) mutation.observe(root, { attributes: true, attributeFilter: ["data-motion"] });
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      if (timer !== undefined) clearInterval(timer);
      observer.disconnect(); mutation.disconnect();
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [animated, frame, pose, avatar, source]);

  const renderedSource = assetImage && renderedAssetPath ? "pixel-v04-reference" : "code";
  return <canvas
    ref={canvasRef}
    className={`suinai-sprite ${className}`.trim()}
    width={(avatar ? SPRITE_AVATAR.width : SPRITE_WIDTH) * SPRITE_SCALE} height={(avatar ? SPRITE_AVATAR.height : SPRITE_HEIGHT) * SPRITE_SCALE}
    data-mode={mode} data-source={renderedSource} data-pose={pose} data-face={face} data-frame={renderedFrame}
    role="img" aria-label={`穗奈的${mode === "dots" ? "点阵" : "像素"}形象：${SPRITE_POSES.find((item) => item.id === pose)?.name} · ${SPRITE_FACES.find((item) => item.id === face)?.name}；栗棕发、圆框眼镜和麦穗发夹`}
  >穗奈的像素角色</canvas>;
}
