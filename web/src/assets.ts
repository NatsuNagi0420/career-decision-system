/** 青穗集 · 网页素材统一地址：品牌、头像、启动画面和角色资源均由本机后端只读提供。 */
export const WEB_ASSET_BASE = "/api/assets";
export function assetUrl(path: string) {
  if (!path || path.split("/").some(part => !part || part.startsWith(".") || /[\\:\0?#]/.test(part))) {
    throw new Error("网页素材必须使用统一目录下的相对路径。");
  }
  return WEB_ASSET_BASE + "/" + path;
}
export const SUINAI_SPEECH_BUBBLE_URL = assetUrl("brand/career-pixel/suinai-speech-bubble.webp");
export const SUINAI_AVATAR_URL = assetUrl("brand/suinai-avatar/suinai-avatar.png");
