/** 青穗集 · 鉴权文件读取与交付：预览和下载分开，文件令牌不写入 URL。 */
import { apiUrl, getToken, clearToken, goToAuth } from "./api";
export interface HubFileContent {
  url: string;
  text?: string;
  localPath?: string;
  release: () => void;
}
export function fileType(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}
export function fileMime(name: string) {
  const ext = fileType(name);
  return (
    (
      {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        txt: "text/plain",
        md: "text/plain",
        json: "text/plain",
        csv: "text/plain",
        html: "text/plain",
      } as Record<string, string>
    )[ext] || "application/octet-stream"
  );
}
export function imageFile(name: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}
export function textFile(name: string) {
  return /\.(txt|md|csv|json|log|ya?ml|html|css|js|ts)$/i.test(name);
}
export async function readHubFile(
  id: string,
  name: string,
): Promise<HubFileContent> {
  const url = apiUrl(
    "/api/v1/hub/files/" + encodeURIComponent(id) + "/content",
  );
  const token = getToken();
  if (!token) throw new Error("请先登录。");
  // #ifdef H5
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });
  if (response.status === 401) {
    clearToken();
    goToAuth();
  }
  if (!response.ok) throw new Error("文件暂时无法读取，请重试。");
  const bytes = await response.arrayBuffer();
  const blob = new Blob([bytes], { type: fileMime(name) });
  const objectUrl = URL.createObjectURL(blob);
  return {
    url: objectUrl,
    text: textFile(name)
      ? new TextDecoder().decode(bytes.slice(0, 256 * 1024)) +
        (bytes.byteLength > 256 * 1024
          ? "\n\n[仅预览前 256 KB，完整内容请下载]"
          : "")
      : undefined,
    release: () => URL.revokeObjectURL(objectUrl),
  };
  // #endif
  // #ifndef H5
  const result = await new Promise<UniApp.DownloadSuccessData>(
    (resolve, reject) =>
      uni.downloadFile({
        url,
        header: { Authorization: "Bearer " + token },
        success: resolve,
        fail: reject,
      }),
  );
  if (result.statusCode === 401) {
    clearToken();
    goToAuth();
  }
  if (result.statusCode !== 200) throw new Error("文件暂时无法读取，请重试。");
  let text: string | undefined;
  if (textFile(name)) {
    const fs = wx.getFileSystemManager();
    text = await new Promise<string>((resolve, reject) =>
      fs.readFile({
        filePath: result.tempFilePath,
        encoding: "utf8",
        success: (r) => resolve(String(r.data).slice(0, 256 * 1024)),
        fail: reject,
      }),
    );
  }
  return {
    url: result.tempFilePath,
    localPath: result.tempFilePath,
    text,
    release: () => undefined,
  };
  // #endif
}
export async function downloadHubFile(id: string, name: string) {
  const file = await readHubFile(id, name);
  // #ifdef H5
  const link = document.createElement("a");
  link.href = file.url;
  link.download = name;
  link.click();
  setTimeout(file.release, 30000);
  return;
  // #endif
  // #ifndef H5
  try {
    if (imageFile(name)) {
      await new Promise<void>((resolve, reject) =>
        uni.saveImageToPhotosAlbum({
          filePath: file.localPath!,
          success: () => resolve(),
          fail: reject,
        }),
      );
      uni.showToast({ title: "已保存到相册", icon: "none" });
      return;
    }
    if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(name)) {
      await openLocalDocument(file.localPath!, name);
      return;
    }
    await new Promise<void>((resolve, reject) =>
      uni.saveFile({
        tempFilePath: file.localPath!,
        success: () => resolve(),
        fail: reject,
      }),
    );
    uni.showToast({ title: "文件已保存到小程序", icon: "none" });
  } finally {
    file.release();
  }
  // #endif
}
export async function openLocalDocument(path: string, name: string) {
  await new Promise<void>((resolve, reject) =>
    uni.openDocument({
      filePath: path,
      fileType: fileType(name) as "pdf",
      showMenu: true,
      success: () => resolve(),
      fail: reject,
    }),
  );
}
