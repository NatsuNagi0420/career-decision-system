/** 青穗集 · 成长摘要回归：空资料、真实完成数、行动关联与成果边界。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
    new URL("../src/services/growth-summary.ts", import.meta.url),
    "utf8",
);
const output = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText;
const { growthSummary } = await import(
    "data:text/javascript;base64," + Buffer.from(output).toString("base64")
);
function view() {
    return {
        profile: {
            goal: "",
            education: "",
            experience: "",
            skills: "",
            preferences: "",
            weekly_hours: "",
            confirmed_at: null,
        },
        jobs: [],
        actions: [],
        proposals: [],
    };
}
function action(id, status, extra = {}) {
    return {
        id,
        title: id,
        status,
        job_id: null,
        result: "",
        why: "",
        learn: "",
        deliverable: "",
        created_at: "2026-11-01",
        updated_at: "2026-11-01",
        ...extra,
    };
}
test("空资料不显示完成或虚构成长进度", () => {
    const result = growthSummary(view());
    assert.equal(result.allDone, false);
    assert.equal(result.completion, 0);
    assert.equal(result.factCount, 0);
    assert.equal(result.next, undefined);
    assert.equal(result.result, undefined);
});
test("优先继续进行中行动，只关联显式绑定的岗位", () => {
    const career = view();
    career.jobs = [
        { id: "j1", title: "岗位一" },
        { id: "j2", title: "岗位二" },
    ];
    career.actions = [
        action("todo", "todo"),
        action("doing", "doing", { job_id: "j2" }),
        action("done", "done"),
    ];
    const result = growthSummary(career);
    assert.equal(result.next.id, "doing");
    assert.equal(result.relatedJob.id, "j2");
    assert.equal(result.doneCount, 1);
    assert.equal(result.completion, 33);
    career.actions[1].job_id = null;
    assert.equal(growthSummary(career).relatedJob, undefined);
});
test("只展示已完成且实际记录了成果的行动，保持原数组顺序", () => {
    const career = view();
    career.actions = [
        action("old", "done", { result: "真实成果", updated_at: "2026-10-01" }),
        action("new", "done", { result: "最新成果", updated_at: "2026-11-01" }),
        action("unfinished", "doing", {
            result: "未完成草稿",
            updated_at: "2026-11-02",
        }),
        action("blank", "done", { result: " " }),
    ];
    const ids = career.actions.map((a) => a.id);
    assert.equal(growthSummary(career).result.id, "new");
    assert.deepEqual(
        career.actions.map((a) => a.id),
        ids,
    );
    assert.equal(growthSummary(career).allDone, false);
    career.actions = career.actions.filter((a) => a.status === "done");
    assert.equal(growthSummary(career).allDone, true);
});
test("目标和时间戳不冒充经历事实，已应用或拒绝的草稿不再提示核对", () => {
    const career = view();
    career.profile = {
        ...career.profile,
        goal: "找实习",
        education: "本科",
        experience: " ",
        confirmed_at: "2026-11-01",
    };
    career.proposals = [
        { id: "pending" },
        { id: "explicit", status: "pending_confirmation" },
        { id: "applied", status: "applied" },
        { id: "rejected", status: "rejected" },
    ];
    const result = growthSummary(career);
    assert.equal(result.factCount, 1);
    assert.equal(result.pendingCount, 2);
});

test("残缺或无效响应在发布前报错，不让模板计算过程中整页崩溃", () => {
    for (const value of [null, {}, { ...view(), actions: null }, { ...view(), profile: null }])
        assert.throws(() => growthSummary(value), /成长资料暂时无法显示/);
    const career = view();
    career.actions = [action("done", "done", { result: null })];
    assert.throws(() => growthSummary(career));
});
