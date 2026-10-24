/** 青穗集 · 对外错误与校验：不回显供应商原始错误体和请求凭据。 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}
export function invariant(
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition {
  if (!condition) throw new AppError(status, message, code);
}
export function publicError(error: unknown): string {
  return error instanceof AppError
    ? error.message
    : error instanceof Error && error.name === "AbortError"
      ? "操作已停止。"
      : "操作未完成，请查看连接状态后重试。";
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
