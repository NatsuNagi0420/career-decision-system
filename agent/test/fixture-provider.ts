/** 青穗集 · 本地协议测试夹具：固定脚本返回，不连接真实模型，不得用作生产模型服务。 */
import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
export async function createFixtureProvider(port = 0) {
  let requests = 0;
  const server = createServer(async (req, res) => {
    if (req.url === "/healthz") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ fixture: true, real_llm: false, requests }));
      return;
    }
    if (req.method === "GET" && req.url === "/v1/models") {
      if (
        req.headers.authorization !==
        "Bearer fixture-only-key-not-a-real-credential"
      ) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "fixture-only", object: "model" }],
        }),
      );
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (
      req.headers.authorization !==
      "Bearer fixture-only-key-not-a-real-credential"
    ) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: { message: "仅接受测试假密钥" } }));
      return;
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 200000) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    try {
      const body = JSON.parse(raw);
      requests++;
      const messages = body.messages ?? [];
      const probe = body.tools?.some(
        (value: any) => value.function?.name === "connection_probe",
      );
      if (probe) {
        send(
          res,
          body,
          messages.some((m: any) => m.role === "tool") ? "pong" : "",
          messages.some((m: any) => m.role === "tool")
            ? []
            : [call("connection_probe", { value: "pong" })],
        );
        return;
      }
      const lastUserIndex = messages.findLastIndex(
        (m: any) => m.role === "user",
      );
      const input = String(messages[lastUserIndex]?.content ?? "");
      const current = messages.slice(lastUserIndex + 1);
      if (input.includes("连接测试")) {
        send(res, body, "OK", []);
        return;
      }
      if (/延迟|停止测试/.test(input)) {
        const timer = setTimeout(() => {
          if (!res.destroyed) send(res, body, "测试延迟结束。", []);
        }, 15000);
        res.once("close", () => clearTimeout(timer));
        return;
      }
      if (!body.tools?.length) {
        send(
          res,
          body,
          "这是明确标注的本地协议测试夹具，不是真实模型回答。",
          [],
        );
        return;
      }
      const calls = current.flatMap((m: any) => m.tool_calls ?? []);
      const results = current
        .filter((m: any) => m.role === "tool")
        .map((m: any) => ({
          name: calls.find((c: any) => c.id === m.tool_call_id)?.function?.name,
          value: JSON.parse(m.content),
        }));
      const result = (name: string) =>
        results.find((item: any) => item.name === name)?.value;
      if (!result("list_files")) {
        send(res, body, "先检查已导入的资料。", [
          call("plan_tasks", {
            steps: [
              { title: "阅读资料", status: "working" },
              { title: "保存并确认结果", status: "pending" },
            ],
          }),
          call("list_files", {}),
        ]);
        return;
      }
      const files = result("list_files").result ?? [];
      const shorter = input.includes("精简");
      const source = files.find((file: any) =>
        shorter
          ? file.path.startsWith("outputs/")
          : file.path.startsWith("inputs/"),
      );
      if (!source) {
        send(res, body, "", [
          call("ask_user", {
            question:
              "请先导入一份 UTF-8 文本资料；这是本地协议测试，不是真实模型。",
          }),
        ]);
        return;
      }
      if (!result("read_file")) {
        send(res, body, "", [call("read_file", { path: source.path })]);
        return;
      }
      if (!result("write_file")) {
        const text = result("read_file").result.text;
        const content = shorter
          ? "计算机专业；参与校园网站项目。\n\n[本地协议测试夹具生成]"
          : "# 求职材料整理（本地协议测试）\n\n" +
            text +
            "\n\n## 还需要补充\n- 目标岗位\n- 可量化的项目成果\n";
        send(res, body, "", [
          call("write_file", { path: "outputs/求职材料整理.md", content }),
        ]);
        return;
      }
      if (!result("request_export")) {
        send(res, body, "文件已经真实保存，导出前请确认。", [
          call("request_export", {
            artifact_id: result("write_file").result.artifact.id,
          }),
        ]);
        return;
      }
      send(
        res,
        body,
        result("request_export").export_ready
          ? "这个版本已获批准，可在右侧下载。以上是本地协议测试，不是真实模型。"
          : "未导出。文件仍保留在本段对话。以上是本地协议测试，不是真实模型。",
        [],
      );
    } catch {
      if (!res.headersSent) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { message: "测试夹具请求不合法" } }));
      } else res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/v1",
    get requests() {
      return requests;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
function call(name: string, args: unknown) {
  return {
    id: "call_" + randomUUID(),
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}
function send(res: ServerResponse, body: any, text: string, calls: any[]) {
  const value = {
    id: "fixture_" + randomUUID(),
    model: "fixture-only",
    choices: [
      {
        message: { role: "assistant", content: text, tool_calls: calls },
        finish_reason: calls.length ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 30, completion_tokens: 20 },
  };
  if (!body.stream) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  const chunks = [
    {
      choices: [
        {
          delta: {
            content: text,
            tool_calls: calls.map((call, index) => ({ ...call, index })),
          },
        },
      ],
    },
    {
      choices: [
        { delta: {}, finish_reason: calls.length ? "tool_calls" : "stop" },
      ],
      usage: value.usage,
    },
  ];
  for (const chunk of chunks)
    res.write("data: " + JSON.stringify(chunk) + "\r\n\r\n");
  res.end("data: [DONE]\r\n\r\n");
}
