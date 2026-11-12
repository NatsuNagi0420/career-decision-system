/** 青穗集 · 移动协作回归：覆盖旧会话待办、失败可见性、账号隔离、附件边界与草稿衔接。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleURL(relative, aliases = {}) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    let output = ts
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
    for (const [name, url] of Object.entries(aliases))
        output = output.replaceAll('from "' + name + '"', 'from "' + url + '"');
    output = output.replace(
        'import { shallowReactive } from "vue";',
        "const shallowReactive = value => value;",
    );
    return (
        "data:text/javascript;base64," + Buffer.from(output).toString("base64")
    );
}
const apiURL = await moduleURL("../src/services/api.ts");
const workspaceURL = await moduleURL("../src/services/workspace.ts");
const { overview, loadOverview, ensureOverviewAccount, invalidateOverview } =
    await import(
        await moduleURL("../src/services/overview.ts", {
            "./api": apiURL,
            "./workspace": workspaceURL,
        })
    );
const { tasksFromSnapshot } = await import(workspaceURL);
const files = await import(await moduleURL("../src/services/files.ts"));
const records = await import(
    await moduleURL("../src/services/career-records.ts")
);
const context = await import(
    await moduleURL("../src/services/career-context.ts", { "./api": apiURL })
);
let token = "",
    active = 0,
    peak = 0,
    requested = [],
    overviewRequests = 0;
const stamp = "2026-10-31T00:00:00.000Z";
function install(
    count = 19,
    { failIndex = -1, failDevices = false, paused = false } = {},
) {
    token = "account-" + Math.random();
    active = 0;
    peak = 0;
    requested = [];
    overviewRequests = 0;
    const sessions = Array.from({ length: count }, (_, i) => ({
        id: "s" + i,
        title: "对话" + i,
        target: "cloud",
        created_at: stamp,
        updated_at: stamp,
    }));
    const pending = [];
    globalThis.getCurrentPages = () => [];
    globalThis.uni = {
        getStorageSync: () => token,
        setStorageSync: () => {},
        navigateTo: () => {},
        request(options) {
            const pathname = new URL(options.url).pathname;
            overviewRequests++;
            const reply = () => {
                if (pathname.endsWith("/devices"))
                    return options.success({
                        statusCode: failDevices ? 503 : 200,
                        data: failDevices ? { message: "设备未同步" } : [],
                    });
                if (pathname.endsWith("/sessions"))
                    return options.success({ statusCode: 200, data: sessions });
                const id = pathname.split("/").at(-1),
                    index = Number(id.slice(1));
                requested.push(id);
                active++;
                peak = Math.max(peak, active);
                const finish = () => {
                    active--;
                    if (index === failIndex)
                        return options.success({
                            statusCode: 503,
                            data: { message: "暂不可用" },
                        });
                    options.success({
                        statusCode: 200,
                        data: {
                            conversation: sessions[index],
                            messages: [],
                            runs: [],
                            tasks:
                                index === count - 1
                                    ? [
                                          {
                                              id: "old-approval",
                                              input: "旧会话审批",
                                              status: "awaiting_approval",
                                              local_run_id: null,
                                              created_at: stamp,
                                              updated_at: stamp,
                                          },
                                      ]
                                    : [],
                            files: [],
                            last_seq: 0,
                        },
                    });
                };
                if (paused) pending.push(finish);
                else setTimeout(finish, 1);
            };
            queueMicrotask(reply);
        },
    };
    ensureOverviewAccount();
    return { sessions, pending };
}
test("自动扫描超过 12 段会话，发现最后一段的审批，最多三个并发", async () => {
    install();
    await loadOverview();
    assert.equal(overview.complete, true);
    assert.equal(overview.scanned, 19);
    assert.equal(overview.loaded, 19);
    assert.equal(requested.length, 19);
    assert.ok(peak <= 3);
    assert.equal(
        Object.values(overview.snapshots)
            .flatMap(tasksFromSnapshot)
            .find((t) => t.id === "old-approval")?.status,
        "awaiting_approval",
    );
});
test("一段快照失败时保留已读任务，但不宣称扫描完整；重试后恢复", async () => {
    const state = install(17, { failIndex: 4 });
    await loadOverview();
    assert.equal(overview.complete, false);
    assert.equal(overview.loaded, 16);
    assert.match(overview.partialError, /1 段/);
    install(17);
    await loadOverview();
    assert.equal(overview.complete, true);
    assert.equal(overview.partialError, "");
});
test("设备查询失败不影响全部会话的任务聚合", async () => {
    install(16, { failDevices: true });
    await loadOverview();
    assert.equal(overview.complete, true);
    assert.equal(overview.devicesReady, false);
    assert.ok(overview.deviceError);
    assert.equal(overview.loaded, 16);
});
test("同一次扫描复用请求，扫描进行中不报告已完整同步", async () => {
    const state = install(15, { paused: true });
    const first = loadOverview(),
        second = loadOverview();
    assert.equal(first, second);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(overview.complete, false);
    assert.equal(overview.busy, true);
    while (overview.busy) {
        state.pending.splice(0).forEach((f) => f());
        await new Promise((resolve) => setImmediate(resolve));
    }
    await first;
    assert.equal(overview.complete, true);
});
test("切换账号后拒绝旧请求回写到新账号总览", async () => {
    const state = install(14, { paused: true });
    const old = loadOverview();
    await new Promise((resolve) => setImmediate(resolve));
    token = "different-account";
    ensureOverviewAccount();
    state.pending.splice(0).forEach((f) => f());
    await old;
    assert.deepEqual(overview.sessions, []);
    assert.deepEqual(Object.keys(overview.snapshots), []);
    assert.equal(overview.busy, false);
    assert.equal(overview.complete, false);
});
test("快速切换页面复用刚同步的总览，保留列表和快照引用", async () => {
    install(6);
    await loadOverview(true);
    const calls = overviewRequests,
        sessions = overview.sessions,
        snapshots = overview.snapshots;
    assert.equal(overview.ready, true);
    await loadOverview(true);
    assert.equal(overviewRequests, calls);
    assert.equal(overview.sessions, sessions);
    assert.equal(overview.snapshots, snapshots);
    assert.equal(overview.complete, true);
    // 常规同步未取得新快照时，也不重建列表和整个快照集合。
    await loadOverview();
    assert.equal(overview.sessions, sessions);
    assert.equal(overview.snapshots, snapshots);
});
test("手动刷新绕过短时缓存，聊天更新能单独使会话快照失效", async () => {
    install(5);
    await loadOverview(true);
    const first = overviewRequests;
    await loadOverview(true, true);
    assert.ok(overviewRequests > first);
    const read = requested.length;
    invalidateOverview("s2");
    await loadOverview(true);
    assert.deepEqual(requested.slice(read), ["s2"]);
});
test("部分同步和设备失败不会被缓存成一次成功切页", async () => {
    install(5, { failIndex: 2 });
    await loadOverview(true);
    const calls = overviewRequests;
    await loadOverview(true);
    assert.ok(overviewRequests > calls);
    assert.equal(overview.complete, false);
    install(5, { failDevices: true });
    await loadOverview(true);
    const deviceCalls = overviewRequests;
    await loadOverview(true);
    assert.ok(overviewRequests > deviceCalls);
});
test("同步中发生变更，旧扫描不能重新启用短时缓存", async () => {
    const state = install(4, { paused: true });
    const first = loadOverview(true);
    await new Promise((resolve) => setImmediate(resolve));
    invalidateOverview("s0");
    while (overview.busy) {
        state.pending.splice(0).forEach((finish) => finish());
        await new Promise((resolve) => setImmediate(resolve));
    }
    await first;
    const calls = overviewRequests;
    const second = loadOverview(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(overviewRequests > calls);
    while (overview.busy) {
        state.pending.splice(0).forEach((finish) => finish());
        await new Promise((resolve) => setImmediate(resolve));
    }
    await second;
});
test("PDF、DOCX 接受 4 MB，文本仍限 1 MB，大小不受报告值误导", () => {
    const large = Buffer.alloc(2 * 1024 * 1024, 65).toString("base64");
    assert.equal(
        files.validateAttachment("简历.PDF", large).bytes,
        2 * 1024 * 1024,
    );
    assert.equal(
        files.validateAttachment("简历.docx", large).bytes,
        2 * 1024 * 1024,
    );
    assert.throws(() => files.validateAttachment("经历.txt", large), /1 MB/);
    assert.throws(
        () =>
            files.validateAttachment(
                "简历.pdf",
                Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64"),
            ),
        /4 MB/,
    );
    assert.throws(() => files.attachmentLimit("简历.doc"), /另存为 DOCX/);
    assert.throws(() => files.validateAttachment("a.pdf", ""), /为空/);
    assert.throws(() => files.validateAttachment("a.pdf", "QQ="), /不完整/);
    assert.equal(files.validateAttachment("one.md", "QQ==").bytes, 1);
});
test("同一来源续用原会话，附件不自动发送且切换账号后清空", () => {
    token = "career-user";
    let destination = "";
    globalThis.uni.navigateTo = (o) => (destination = o.url);
    context.rememberCareerConversation("hub-cloud-session", "cloud");
    context.openCareerChat("核对经历", "cloud", {
        name: "简历.pdf",
        base64: "QQ==",
        bytes: 1,
    });
    assert.match(destination, /id=hub-cloud-session/);
    assert.equal(context.consumeCareerDraft(), "核对经历");
    assert.equal(context.consumeCareerAttachment().name, "简历.pdf");
    assert.equal(context.consumeCareerDraft(), "");
    context.openCareerChat("电脑草稿", "pc-id");
    assert.match(destination, /new=1&source=pc-id/);
    token = "another-career-user";
    assert.equal(context.consumeCareerDraft(), "");
    assert.equal(context.consumeCareerAttachment(), null);
    context.openCareerChat("新账号", "cloud");
    assert.match(destination, /new=1/);
});
test("核对卡保留行动的学习要求和产物，已应用的建议不再待确认", () => {
    const rows = records.proposalRows({
        data: {
            kind: "actions",
            actions: [
                {
                    title: "复盘项目",
                    why: "补充证据",
                    learn: "STAR",
                    deliverable: "一页复盘",
                },
            ],
        },
    });
    assert.ok(rows.some((r) => r.label === "需要学习" && r.value === "STAR"));
    assert.ok(
        rows.some((r) => r.label === "交付成果" && r.value === "一页复盘"),
    );
    assert.equal(
        records.pendingProposals({
            proposals: [
                { status: "applied" },
                { status: "pending_confirmation" },
                { status: "rejected" },
            ],
        }).length,
        1,
    );
});

test("微信选择器读取 PDF 和 DOCX 后只返回待发送资料，支持取消", async () => {
    for (const name of ["resume.pdf", "resume.docx"]) {
        let accepted = [];
        globalThis.wx = {
            chooseMessageFile(options) {
                accepted = options.extension;
                options.success({
                    tempFiles: [{ name, path: "wxfile://test", size: 5 }],
                });
            },
            getFileSystemManager() {
                return {
                    readFile(options) {
                        options.success({
                            data: Buffer.from("hello").toString("base64"),
                        });
                    },
                };
            },
        };
        const selected = await files.chooseAttachment();
        assert.equal(selected.name, name);
        assert.equal(selected.bytes, 5);
        assert.ok(accepted.includes("pdf") && accepted.includes("docx"));
    }
    globalThis.wx = {
        chooseMessageFile(options) {
            options.fail({ errMsg: "chooseMessageFile:fail cancel" });
        },
    };
    await assert.rejects(files.chooseAttachment(), /cancel/);
});
