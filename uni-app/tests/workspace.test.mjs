/** 青穗集 · 任务聚合与快照回归：核对同步来源、幂等消息和云端资料隔离。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleFrom(relative) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    const output = ts
        .transpileModule(source, {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ES2022,
            },
        })
        .outputText.replace(
            /import\.meta\.env\.VITE_AGENT_API_ORIGIN/g,
            "undefined",
        );
    return import(
        "data:text/javascript;base64," + Buffer.from(output).toString("base64")
    );
}
const workspace = await moduleFrom("../src/services/workspace.ts");
const api = await moduleFrom("../src/services/api.ts");
const stamp = "2026-10-31T00:00:00.000Z";
const session = {
    id: "session",
    title: "同步会话",
    target: "pc",
    device_id: "pc-1",
    workspace_name: "求职资料",
    created_at: stamp,
    updated_at: stamp,
};
const run = {
    id: "run-1",
    status: "running",
    steps: 2,
    error: null,
    created_at: stamp,
    updated_at: stamp,
};
const task = {
    id: "task-1",
    session_id: "session",
    input: "整理资料",
    status: "running",
    local_run_id: "run-1",
    target: "pc",
    device_id: "pc-1",
    created_at: stamp,
    updated_at: stamp,
    error: null,
};
const snapshot = {
    conversation: session,
    messages: [
        {
            id: "message-1",
            role: "user",
            content: "整理资料",
            run_id: "run-1",
            created_at: stamp,
        },
    ],
    runs: [run],
    tasks: [task],
    files: [],
    drafts: {},
    last_seq: 1,
};
function serve(data) {
    globalThis.uni = {
        getStorageSync: () => "fixture",
        request: (options) => options.success({ statusCode: 200, data }),
    };
    globalThis.getCurrentPages = () => [];
}
test("同一电脑运行和 Hub 任务只显示一次", () => {
    const result = workspace.tasksFromSnapshot(snapshot);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "task-1");
    assert.equal(result[0].controllable, true);
});
test("电脑主动发起的镜像任务保留且不能伪装为远程可控", () => {
    const result = workspace.tasksFromSnapshot({ ...snapshot, tasks: [] });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "run-1");
    assert.equal(result[0].controllable, false);
});
test("有本机消息时不再补一条相同用户输入", async () => {
    serve(snapshot);
    const result = await api.agentApi.snapshot("session");
    assert.equal(result.messages.length, 1);
    assert.equal(result.runs[0].id, "run-1");
    assert.equal(result.tasks[0].id, "task-1");
});
test("离线等待中的任务能显示用户原始输入", async () => {
    serve({
        ...snapshot,
        messages: [],
        runs: [],
        tasks: [{ ...task, local_run_id: null, status: "waiting_pc" }],
    });
    const result = await api.agentApi.snapshot("session");
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].content, "整理资料");
    assert.equal(result.messages[0].id, "task-task-1");
});
test("云端和电脑来源说明保持清楚", () => {
    assert.equal(
        workspace.sourceLabel(session, [{ id: "pc-1", name: "我的电脑" }]),
        "我的电脑 · 求职资料",
    );
    assert.equal(
        workspace.sourceLabel({ ...session, target: "cloud" }),
        "云端",
    );
});
test("等待电脑与等待授权属于执行态，待补充单独归类", () => {
    assert.equal(workspace.activeStatus("waiting_pc"), true);
    assert.equal(workspace.activeStatus("awaiting_approval"), true);
    assert.equal(workspace.attentionStatus("waiting_input"), true);
    assert.equal(workspace.activeStatus("completed"), false);
});
test("未同步的电脑画像返回空资料，不回落到另一端", async () => {
    serve({
        sources: [{ source: "cloud", data: { profile: { goal: "云端目标" } } }],
    });
    const result = await api.careerApi.view("pc-not-synced");
    assert.equal(result.profile.goal, "");
});
test("云端画像从实时接口读取，避免使用旧同步副本", async () => {
    let path = "";
    globalThis.uni = {
        getStorageSync: () => "fixture",
        request: (options) => {
            path = options.url;
            options.success({
                statusCode: 200,
                data: { profile: { goal: "最新目标" } },
            });
        },
    };
    const result = await api.careerApi.view("cloud");
    assert.match(path, /\/api\/v1\/agent\/career$/);
    assert.equal(result.profile.goal, "最新目标");
});
