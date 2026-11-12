/** 青穗集 · 资料选择器：支持 PDF、DOCX 和文本，按执行端限制校验后暂存待发送。 */

const TEXT_EXTENSIONS = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".log",
  ".yaml",
  ".yml",
];
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ...TEXT_EXTENSIONS];
export type SelectedAttachment = {
  name: string;
  base64: string;
  bytes: number;
};

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
    // #ifdef MP-WEIXIN
    const wxApi = (
      globalThis as unknown as {
        wx: { chooseMessageFile(options: Record<string, unknown>): void };
      }
    ).wx;
    wxApi.chooseMessageFile({
      count: 1,
      type: "file",
      extension: SUPPORTED_EXTENSIONS.map((ext) => ext.slice(1)),
      success: (result: {
        tempFiles: Array<{ name: string; path: string; size: number }>;
      }) => resolve(result.tempFiles[0]),
      fail: (error: { errMsg: string }) =>
        reject(new Error(error.errMsg || "已取消选择资料")),
    });
    return;
    // #endif
    // #ifndef MP-WEIXIN
    uni.chooseFile({
      count: 1,
      type: "all",
      extension: SUPPORTED_EXTENSIONS,
      success: (result) => {
        const raw = Array.isArray(result.tempFiles)
          ? result.tempFiles[0]
          : result.tempFiles;
        const rawRecord =
          typeof raw === "object" && raw !== null
            ? (raw as unknown as Record<string, unknown>)
            : {};
        const path =
          typeof rawRecord.path === "string"
            ? rawRecord.path
            : String(result.tempFilePaths);
        const name =
          typeof rawRecord.name === "string"
            ? rawRecord.name
            : path.split(/[\\/]/).pop() || "import.txt";
        const size =
          typeof rawRecord.size === "number" ? rawRecord.size : undefined;
        const rawFile =
          typeof File !== "undefined" && (raw as unknown) instanceof File
            ? (raw as unknown as File)
            : undefined;
        resolve({ name, path, size, raw: rawFile });
      },
      fail: (error) => reject(new Error(error?.errMsg || "已取消选择资料")),
    });
    // #endif
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

  const wxApi = (
    globalThis as {
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
    }
  ).wx;
  const manager = wxApi?.getFileSystemManager?.();
  if (!manager)
    return Promise.reject(new Error("当前环境暂不支持读取本地资料"));
  return new Promise((resolve, reject) => {
    manager.readFile({
      filePath: file.path,
      encoding: "base64",
      success: (result) => resolve(result.data),
      fail: (error) => reject(new Error(error.errMsg || "资料读取失败")),
    });
  });
}

export function attachmentLimit(name: string): number {
  const extension = "." + extensionOf(name);
  if (extension === ".doc")
    throw new Error("请先将旧版 DOC 简历另存为 DOCX 或 PDF 后导入");
  if (!SUPPORTED_EXTENSIONS.includes(extension))
    throw new Error("支持 PDF、DOCX、TXT、Markdown、CSV、JSON、LOG 和 YAML");
  return TEXT_EXTENSIONS.includes(extension) ? 1024 * 1024 : 4 * 1024 * 1024;
}
export function validateAttachment(
  name: string,
  base64: string,
): SelectedAttachment {
  const limit = attachmentLimit(name);
  if (
    !base64 ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw new Error("文件内容为空或读取不完整，请重新选择");
  const bytes =
    (base64.length / 4) * 3 -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes <= 0) throw new Error("无法导入空文件");
  if (bytes > limit)
    throw new Error(
      limit > 1048576 ? "PDF、DOCX 不能超过 4 MB" : "文本资料不能超过 1 MB",
    );
  return { name, base64, bytes };
}
export async function chooseAttachment(): Promise<SelectedAttachment> {
  const file = await selectFile();
  const limit = attachmentLimit(file.name);
  if (file.size && file.size > limit)
    throw new Error(
      limit > 1048576 ? "PDF、DOCX 不能超过 4 MB" : "文本资料不能超过 1 MB",
    );
  return validateAttachment(file.name, await readAsBase64(file));
}
