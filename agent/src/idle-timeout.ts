/** 青穗集 · 流式空闲看门狗：收到真实字节才续期，外部取消和整轮预算仍可立即中止。 */
export async function fetchWithIdleTimeout(
  url: string,
  init: RequestInit,
  idleMs: number,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const signal = AbortSignal.any([...(init.signal ? [init.signal] : []), controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const touch = () => {
    dispose();
    if (!signal.aborted) timer = setTimeout(() => controller.abort(new DOMException("模型数据长时间未继续返回。", "TimeoutError")), idleMs);
  };
  touch();
  try {
    const response = await abortable(fetcher(url, { ...init, signal }), signal);
    touch();
    if (!response.body) { dispose(); return response; }
    const reader = response.body.getReader();
    let finished = false;
    const close = () => { finished = true; dispose(); signal.removeEventListener("abort", aborted); };
    const cancel = (reason?: unknown) => { void reader.cancel(reason).catch(() => {}); };
    let sink: ReadableStreamDefaultController<Uint8Array>;
    const aborted = () => {
      if (finished) return;
      close();
      sink.error(signal.reason);
      cancel(signal.reason);
    };
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        sink = value;
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) aborted();
      },
      async pull(value) {
        if (finished) return;
        try {
          const chunk = await abortable(reader.read(), signal);
          if (finished) return;
          if (chunk.done) { close(); value.close(); }
          else { if (chunk.value.byteLength) touch(); value.enqueue(chunk.value); }
        } catch (error) {
          if (finished) return;
          close(); value.error(error); cancel(error);
        }
      },
      cancel(reason) { if (!finished) close(); cancel(reason); controller.abort(reason); },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) { dispose(); throw error; }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stopped = () => reject(signal.reason ?? new DOMException("已停止", "AbortError"));
    signal.addEventListener("abort", stopped, { once: true });
    if (signal.aborted) stopped();
    promise.then(
      value => { signal.removeEventListener("abort", stopped); resolve(value); },
      error => { signal.removeEventListener("abort", stopped); reject(error); },
    );
  });
}
