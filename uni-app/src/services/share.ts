/** 青穗集 · 分享卡片文案：统一维护三条分享路径的标题、封面与参数。 */
export interface SharePayload {
  title: string;
  path: string;
  imageUrl?: string;
}

export function homeShare(): SharePayload {
  return {
    title: "青穗集 · 把迷茫，变成下一步",
    path: "/pages/home/index",
    imageUrl: "/static/assets/characters/desk-computer-scene.png",
  };
}

export function growthShare(
  progress: number,
  actionCount: number,
): SharePayload {
  return {
    title: `穗奈陪我把下一步整理清楚，一起推进 ${actionCount} 件事`,
    path: "/pages/growth/index",
    imageUrl: "/static/assets/characters/growth-route-illustration.png",
  };
}

export function chatShare(nextStep: string): SharePayload {
  const clipped = nextStep.length > 24 ? `${nextStep.slice(0, 24)}…` : nextStep;
  return {
    title: `穗奈帮我整理出了下一步：${clipped}`,
    path: "/pages/home/index",
    imageUrl: "/static/assets/characters/suinai-wave.png",
  };
}
