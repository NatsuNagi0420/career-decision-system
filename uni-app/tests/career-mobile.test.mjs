/** 青穗集 · 职业流程回归：路线只随已确认资料推进，周报只统计有时间戳的记录。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(relative, exportNames) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    const module = await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
    return Object.fromEntries(exportNames.map(name => [name, module[name]]));
}

const { journeyIndex, careerTaskPrompt } = await load("../src/services/career-flow.ts", ["journeyIndex", "careerTaskPrompt"]);
const { weeklyReport, weeklyPosterLines } = await load("../src/services/career-weekly.ts", ["weeklyReport", "weeklyPosterLines"]);
const fixtureCareer = () => ({
    profile: { goal: "产品实习", education: "本科", experience: "校园项目" },
    jobs: [{ id: "job-a", title: "产品实习生", description: "需求分析" }, { id: "job-b", title: "用户研究实习生", description: "访谈" }],
    actions: [],
});

test("职业路线只按已确认岗位和真实学习、练习记录推进", () => {
    const career = fixtureCareer();
    assert.equal(journeyIndex({ ...career, profile: { ...career.profile, education: "", experience: "" } }), 0);
    assert.equal(journeyIndex({ ...career, jobs: [] }), 1);
    assert.equal(journeyIndex(career), 1);
    const focusedCareer = { ...career, jobs: career.jobs.slice(0, 1) };
    const learning = { active_path_id: "path", paths: [{ id: "path", job_id: "job-a", nodes: [{ status: "done" }, { status: "todo" }] }] };
    assert.equal(journeyIndex(focusedCareer, learning, null), 2);
    learning.paths[0].nodes[1].status = "done";
    assert.equal(journeyIndex(focusedCareer, learning, null), 3);
    const preparation = { boards: [{ stale: false, primary_job_id: "job-a" }], sessions: [{ job_id: "job-a", stale: false, status: "active", answers: [] }] };
    assert.equal(journeyIndex(focusedCareer, learning, preparation), 3);
    preparation.sessions[0] = { ...preparation.sessions[0], status: "completed", answers: [{ question_id: "q1" }] };
    assert.equal(journeyIndex(focusedCareer, learning, preparation), 4);
    preparation.boards[0].stale = true;
    preparation.sessions = [];
    assert.equal(journeyIndex(focusedCareer, learning, preparation), 3);
});

test("切换电脑执行位置时，简历任务不带入云端画像目标或外来岗位编号", () => {
    const career = fixtureCareer();
    const text = careerTaskPrompt("resume", career, "job-a", "只引用我确认的项目数字", "旧简历.pdf", false);
    assert.match(text, /重新确认/);
    assert.match(text, /产品实习生/);
    assert.doesNotMatch(text, /job-a/);
    assert.doesNotMatch(text, /当前目标：产品实习/);
    assert.match(text, /旧简历\.pdf/);
    assert.match(careerTaskPrompt("resume", career, "job-a", "", undefined, true), /岗位编号：job-a/);
});

test("周报仅计本周有更新时间的已完成记录，未来、上周和草稿不计", () => {
    const now = new Date(2026, 10, 13, 12, 0, 0);
    const date = (day, hour = 10) => new Date(2026, 10, day, hour).toISOString();
    const career = {
        actions: [
            { title: "已完成", status: "done", updated_at: date(9) },
            { title: "未完成", status: "doing", updated_at: date(10) },
            { title: "上周", status: "done", updated_at: date(8) },
            { title: "未来记录", status: "done", updated_at: date(14) },
            { title: "无日期", status: "done", updated_at: null },
        ],
    };
    const learning = { active_path_id: "p", paths: [{ id: "p", nodes: [
        { title: "一節", status: "done", updated_at: date(12) },
        { title: "没有时间戳", status: "done", updated_at: null },
    ] }] };
    const preparation = { sessions: [
        { job_title: "产品岗", mode: "practice", status: "completed", updated_at: date(13) },
        { job_title: "未结束", mode: "exam", status: "active", updated_at: date(13) },
    ] };
    const files = [
        { id: "f1", name: "成果.pdf", kind: "output", created_at: date(11) },
        { id: "f1", name: "成果.pdf", kind: "output", created_at: date(11) },
        { id: "input", name: "简历.pdf", kind: "input", created_at: date(11) },
    ];
    const report = weeklyReport(career, learning, preparation, files, now);
    assert.deepEqual(report.actions, ["已完成"]);
    assert.deepEqual(report.lessons, ["一節"]);
    assert.deepEqual(report.sessions, ["产品岗 · 练习"]);
    assert.deepEqual(report.files, ["成果.pdf"]);
    assert.match(report.period, /11\.9/);
});

test("成长海报默认仅含数量，电脑来源不假报云端学习和训练", () => {
    const report = { period: "11.9 — 11.15", lessons: ["不公开课程名"], sessions: ["不公开岗位"], actions: ["不公开行动"], files: ["简历.pdf"] };
    const counts = weeklyPosterLines(report);
    assert.ok(!counts.join("\n").includes("简历.pdf"));
    assert.ok(!counts.join("\n").includes("不公开"));
    const privateLines = weeklyPosterLines(report, true);
    assert.ok(privateLines.join("\n").includes("简历.pdf"));
    const pcLines = weeklyPosterLines(report, false, true).join("\n");
    assert.match(pcLines, /电脑来源/);
    assert.doesNotMatch(pcLines, /学习记录|训练结束/);
});

test("五项入口、字号与来源边界都留在小程序页面", async () => {
    const text = await readFile(new URL("../src/pages.json", import.meta.url), "utf8");
    const config = text.slice(text.indexOf("{"));
    const routes = JSON.parse(config).pages.map(page => page.path);
    for (const page of ["learning", "preparation", "compare", "career-task", "weekly"])
        assert.ok(routes.includes("pages/" + page + "/index"));
    const workspace = await readFile(new URL("../src/services/career-workspace.ts", import.meta.url), "utf8");
    assert.match(workspace, /selected === "cloud"/);
    for (const path of ["../src/pages/learning/index.vue", "../src/pages/preparation/index.vue", "../src/pages/compare/index.vue", "../src/pages/career-task/index.vue", "../src/pages/weekly/index.vue"])
        assert.match(await readFile(new URL(path, import.meta.url), "utf8"), /<!-- 青穗集/);
});
