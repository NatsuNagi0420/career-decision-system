/** 青穗集 · 小程序文本资料选择器：把用户主动选择的 UTF-8 文本转成受限导入接口需要的 base64。 */

const SUPPORTED_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".log", ".yaml", ".yml"];
const MAX_FILE_BYTES = 1024 * 1024;

type PickedFile = {
  name: string;
  path: string;
  size?: number;
  raw?: File;
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function selectFile(): Promise<PickedFile> {
  return new Promise((resolve, reject) => {
    uni.chooseFile({
      count: 1,
      type: "all",
      extension: SUPPORTED_EXTENSIONS,
      success: result => {
        const raw = Array.isArray(result.tempFiles) ? result.tempFiles[0] : result.tempFiles;
        const rawRecord = typeof raw === "object" && raw !== null ? raw as unknown as Record<string, unknown> : {};
        const path = typeof rawRecord.path === "string" ? rawRecord.path : String(result.tempFilePaths);
        const name = typeof rawRecord.name === "string"
          ? rawRecord.name
          : path.split(/[\\/]/).pop() || "import.txt";
        const size = typeof rawRecord.size === "number" ? rawRecord.size : undefined;
        const rawFile = typeof File !== "undefined" && (raw as unknown) instanceof File ? raw as unknown as File : undefined;
        resolve({ name, path, size, raw: rawFile });
      },
      fail: error => reject(new Error(error?.errMsg || "已取消选择资料")),
    });
  });
}

function readAsBase64(file: PickedFile): Promise<string> {
  if (file.raw) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        resolve(comma >= 0 ? value.slice(comma + 1) : value);
      };
      reader.onerror = () => reject(new Error("资料读取失败"));
      reader.readAsDataURL(file.raw as File);
    });
  }

  const wxApi = (globalThis as {
    wx?: {
      getFileSystemManager?: () => {
        readFile: (options: {
          filePath: string;
          encoding: "base64";
          success: (result: { data: string }) => void;
          fail: (error: { errMsg?: string }) => void;
        }) => void;
      };
    };
  }).wx;
  const manager = wxApi?.getFileSystemManager?.();
  if (!manager) return Promise.reject(new Error("当前环境暂不支持读取本地资料"));
  return new Promise((resolve, reject) => {
    manager.readFile({
      filePath: file.path,
      encoding: "base64",
      success: result => resolve(result.data),
      fail: error => reject(new Error(error.errMsg || "资料读取失败")),
    });
  });
}

export async function chooseTextFile(): Promise<{ name: string; base64: string; bytes: number }> {
  const file = await selectFile();
  const extension = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.includes(`.${extension}`)) {
    throw new Error("目前支持 TXT、Markdown、CSV、JSON、LOG 和 YAML 资料");
  }
  if (file.size && file.size > MAX_FILE_BYTES) {
    throw new Error("资料不能超过 1 MB");
  }
  const base64 = await readAsBase64(file);
  const bytes = file.size ?? Math.floor(base64.length * 0.75);
  if (bytes > MAX_FILE_BYTES) throw new Error("资料不能超过 1 MB");
  return { name: file.name, base64, bytes };
}
