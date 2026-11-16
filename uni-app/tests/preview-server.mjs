/** 青穗集 · 合成数据预览服务：仅监听本机，不连接真实账号、模型和数据库。 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
const now = new Date().toISOString(),
    deviceId = randomUUID(),
    workspaceId = randomUUID();
const user = { id: 1, username: "原型预览用户", external_ai_consent: true };
const device = {
    id: deviceId,
    name: "我的电脑",
    status: "active",
    online: false,
    revision: 1,
    settings: {
        allow_remote: true,
        sync_chats: true,
        workspace_id: workspaceId,
        workspace_access: "workspace-write",
        model_source: "official",
        profile_id: null,
        reasoning_effort: "auto",
    },
    limits: { allow_project_write: true, workspace_ids: [] },
    catalogue: {
        workspaces: [{ id: workspaceId, name: "求职资料" }],
        profiles: [],
    },
};
const resume = {
    revision: 3,
    updated_at: now,
    header: {
        name: "林同学",
        headline: "产品实习生 · 用户研究与数据分析",
        contact: "联系方式待本人填写",
    },
    target: {
        title: "产品实习生",
        company: "示例公司",
        description: "用户研究、需求分析",
    },
    body: {
        summary: { text: "关注用户体验，拥有校园项目与数据分析实践。" },
        sections: [
            {
                kind: "education",
                entries: [
                    {
                        title: "示例大学",
                        subtitle: "信息管理 · 本科",
                        period: "2023—2027",
                        bullets: ["系统学习统计、用户研究与产品设计。"],
                    },
                ],
            },
            {
                kind: "projects",
                entries: [
                    {
                        title: "校园信息服务改进",
                        subtitle: "课程项目",
                        period: "2026.03—2026.06",
                        bullets: [
                            "整理访谈记录并梳理需求清单。",
                            "完成原型并收集同学反馈。",
                        ],
                    },
                ],
            },
        ],
    },
    questions: ["请补充项目中实际承担的职责。"],
};
let career = {
    revision: 1,
    context_version: 1,
    updated_at: now,
    profile: {
        goal: "探索适合自己的产品岗位",
        education: "信息管理专业 · 本科",
        experience: "参与校园信息服务课程项目",
        skills: "访谈整理、基础数据分析",
        preferences: "希望先找一份实习",
        weekly_hours: "每周 6 小时",
        confirmed_at: now,
    },
    skills: [
        {
            name: "用户研究",
            stage: "emerging",
            evidence: [
                {
                    source_id: "source-1",
                    quote: "我参与了访谈记录整理和需求归类。",
                },
            ],
        },
    ],
    jobs: [
        {
            id: randomUUID(),
            title: "产品实习生",
            company: "示例公司",
            url: "",
            description: "需求整理、用户研究、基础数据分析",
            created_at: now,
        },
    ],
    actions: [
        {
            id: randomUUID(),
            title: "整理一份项目复盘",
            why: "把做过的事情转化成可展示的证据。",
            learn: "问题、过程、结果的结构化表达",
            deliverable: "一页项目复盘",
            status: "doing",
            result: "已整理访谈笔记。",
            created_at: now,
            updated_at: now,
        },
        {
            id: randomUUID(),
            title: "阅读一个产品岗位 JD",
            why: "认识岗位要求",
            learn: "区分必需能力和加分项",
            deliverable: "标注后的 JD",
            status: "done",
            result: "已完成",
            created_at: now,
            updated_at: now,
        },
    ],
    comparisons: [],
    proposals: [],
    sources: [
        {
            id: "source-1",
            kind: "conversation",
            text: "我参与了访谈记录整理和需求归类。",
        },
    ],
    saved_jobs: [],
};
career.jobs.push({ id: randomUUID(), title: "用户研究实习生", company: "合成示例团队", url: "", description: "访谈执行、研究报告、需求归纳", created_at: now });
const questionBank = ["如何区分用户需求与解决方案？", "怎样设计一次用户访谈？", "怎样判断一次功能迭代是否有效？"].map((prompt, index) => ({ id: "fixture-q" + index, prompt, topic: ["需求分析", "用户访谈", "效果验证"][index], requirement: career.jobs[0].description, origin: "curated", source_title: "本机合成题", source_url: null, rubric: ["有明确目标", "用具体例子说明"], reference_answer: "先说明目标和实际场景，再用真实过程和结果支持自己的判断。" }));
let learning = { revision: 1, active_path_id: "fixture-path", paths: [{ id: "fixture-path", job_id: career.jobs[0].id, title: "产品岗位入门路线", summary: "把访谈与需求分析转成可展示的项目材料。", created_at: now, updated_at: now, nodes: ["梳理用户问题", "完成一份需求分析"].map((title, index) => ({ key: "node" + index, title, requirement: "需求整理、用户研究", objective: "说明问题、证据与解决思路", estimated_minutes: 45, prerequisites: index ? ["node0"] : [], search_query: title, exercise: "用课程项目整理一份分析", deliverable: "一页分析文档", status: index ? "todo" : "done", notes: "", result: index ? "" : "已整理课程项目材料", resources: [], updated_at: now })) }], proposal: null, updated_at: now };
let preparation = { revision: 1, sessions: [], boards: [{ id: "fixture-board", title: "产品与研究方向的选择", conversation_id: "fixture-native", stale: false, options: career.jobs.map(job => ({ job_id: job.id, attraction: "能运用已有访谈整理经历", preparation_cost: "需要补一份完整研究报告", tradeoff: "产品侧重推动落地，研究侧重证据深度", unknowns: ["实际实习职责需要向招聘方核实"], evidence: [{ source_id: "job." + job.id, quote: job.description }, { source_id: "source-1", quote: career.sources[0].text }] })), next_question: "你更喜欢推动方案，还是深入理解用户？", primary_job_id: null, backup_job_ids: [], reason: "" }] };
function publicPreparation() {
    const value = structuredClone(preparation);
    value.sessions.forEach(session => {
        if (session.status !== "completed") session.questions = session.questions.slice(0, session.answers.length + 1);
        if (session.mode === "exam" && session.status !== "completed") {
            session.questions.forEach(question => { delete question.rubric; delete question.reference_answer; });
            session.answers.forEach(answer => { delete answer.verdict; delete answer.strengths; delete answer.gaps; delete answer.next_exercise; });
        }
    });
    return value;
}
const snapshots = new Map();
for (const [index, title] of [
    "简历优化",
    "整理行业研究资料",
    "整理项目复盘",
    "生成方案初稿",
].entries()) {
    const id = randomUUID(),
        runid = randomUUID(),
        taskid = randomUUID(),
        status = ["completed", "running", "waiting_pc", "awaiting_approval"][
            index
        ];
    const conversation = {
        id,
        title,
        target: index === 2 ? "pc" : "cloud",
        device_id: index === 2 ? deviceId : null,
        workspace_id: index === 2 ? workspaceId : null,
        workspace_name: index === 2 ? "求职资料" : null,
        archived: false,
        created_at: now,
        updated_at: now,
    };
    const task = {
        id: taskid,
        session_id: id,
        target: conversation.target,
        device_id: conversation.device_id,
        status,
        input: title,
        local_run_id: runid,
        cancel_requested: false,
        error: null,
        created_at: now,
        updated_at: now,
    };
    const file = {
        id: randomUUID(),
        session_id: id,
        kind: "output",
        name: index === 0 ? "简历_初稿.md" : "方案_初稿.txt",
        bytes: 612,
        sha256: "preview-only",
        version: 1,
        created_at: now,
    };
    snapshots.set(id, {
        conversation,
        tasks: [task],
        runs: [
            {
                id: runid,
                status,
                error: null,
                steps: 2,
                created_at: now,
                updated_at: now,
            },
        ],
        messages: [
            {
                id: randomUUID(),
                role: "user",
                content: title,
                run_id: runid,
                created_at: now,
            },
            {
                id: randomUUID(),
                role: "assistant",
                content:
                    index === 0
                        ? "## 我们先把经历讲清楚\n\n我已经整理了一版简历：\n- 保留你确认过的项目事实\n- 突出与目标岗位相关的经历\n- **需要你补充**：实际承担的职责\n\n你可以先看文件，再告诉我想改哪里。"
                        : "好的，我会先梳理资料，再把结果交给你。",
                run_id: runid,
                created_at: now,
            },
        ],
        events: [
            {
                id: randomUUID(),
                run_id: runid,
                type: "tool.started",
                data: {
                    name: "files.read",
                    arguments: { command: "read project-notes.md" },
                },
                created_at: now,
            },
        ],
        drafts: {},
        files: index === 0 || index === 3 ? [file] : [],
        approvals:
            index === 3
                ? [
                      {
                          id: randomUUID(),
                          run_id: runid,
                          status: "pending",
                          reason: "即将修改已授权项目中的方案文件，请确认。",
                      },
                  ]
                : [],
        resume: index === 0 ? resume : undefined,
        last_seq: 8,
    });
}
career.proposals = [
    {
        id: randomUUID(),
        title: "补充每周投入时间",
        conversation_id: [...snapshots.keys()][0],
        created_at: now,
        data: {
            kind: "profile",
            profile: {
                ...career.profile,
                confirmed_at: undefined,
                weekly_hours: "每周 8 小时",
            },
        },
    },
];
const requests = [];
// 让待确认任务位于第 13 段以后，验证不会被首页分页遗漏。
for (let index = 0; index < 13; index++) {
    const id = randomUUID(),
        time = new Date(Date.now() - index * 1000).toISOString();
    snapshots.set(id, {
        conversation: {
            id,
            title: "已完成的资料整理 " + (index + 1),
            target: "cloud",
            device_id: null,
            archived: false,
            created_at: time,
            updated_at: time,
        },
        messages: [],
        runs: [],
        tasks: [],
        events: [],
        files: [],
        approvals: [],
        drafts: {},
        last_seq: 0,
    });
}
for (const snapshot of snapshots.values())
    if (snapshot.tasks.some((t) => t.status === "awaiting_approval"))
        snapshot.conversation.updated_at = "2026-01-01T00:00:00.000Z";
const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method === "OPTIONS") {
        res.end();
        return;
    }
    requests.push({ method: req.method, path: url.pathname });
    let raw = "";
    for await (const piece of req) raw += piece;
    let data = {};
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {}
    const send = (value) => res.end(JSON.stringify(value));
    const fail = (status, detail) => {
        res.statusCode = status;
        send({ detail });
    };
    if (url.pathname === "/__requests") return send(requests);
    if (url.pathname === "/api/v1/auth/login")
        return send({ token: "local-prototype-fixture", user });
    if (req.headers.authorization !== "Bearer local-prototype-fixture")
        return fail(401, "本机合成预览需要演示登录。");
    if (url.pathname === "/api/v1/auth/me") return send(user);
    if (url.pathname === "/api/v1/auth/logout") return send({ ok: true });
    if (url.pathname === "/api/v1/auth/ai-consent") {
        user.external_ai_consent = data.granted;
        return send({ external_ai_consent: data.granted });
    }
    if (url.pathname === "/api/v1/hub/config")
        return send({ cloud_enabled: true });
    if (url.pathname === "/api/v1/hub/devices") return send([device]);
    if (url.pathname.endsWith("/settings"))
        return send({
            ...device,
            settings: data.settings,
            revision: ++device.revision,
        });
    if (url.pathname === "/api/v1/hub/career")
        return send({
            sources: [
                { source: "cloud", data: career, updated_at: now },
                { source: deviceId, data: career, updated_at: now },
            ],
        });
    if (url.pathname === "/api/v1/agent/career") return send(career);
    if (url.pathname === "/api/v1/agent/career/learning") return send(learning);
    if (url.pathname === "/api/v1/agent/career/preparation") return send(publicPreparation());
    if (url.pathname === "/api/v1/agent/career/preparation/questions") return send({ questions: questionBank });
    if (url.pathname === "/api/v1/agent/career/learning/videos") return send({ status: "empty", resources: [], message: "本机合成预览不请求外部视频。", search_url: "https://search.bilibili.com/" });
    if (url.pathname === "/api/v1/agent/career/learning/changes") {
        if (data.revision !== learning.revision) return fail(409, "学习资料已更新，请刷新。");
        const change = data.change;
        if (change.type === "path.select") learning.active_path_id = change.id;
        if (change.type === "node.update") {
            const node = learning.paths.find(path => path.id === change.path_id)?.nodes.find(node => node.key === change.key);
            if (!node) return fail(404, "章节不存在");
            Object.assign(node, { status: change.status, notes: change.notes, result: change.result, updated_at: new Date().toISOString() });
        }
        learning.revision++;
        return send(learning);
    }
    if (url.pathname === "/api/v1/agent/career/preparation/changes") {
        if (data.revision !== preparation.revision) return fail(409, "训练资料已更新，请刷新。");
        const change = data.change;
        if (change.type === "decision.select") {
            const board = preparation.boards.find(board => board.id === change.id);
            if (!board) return fail(404, "比较记录不存在");
            Object.assign(board, { primary_job_id: change.primary_job_id, backup_job_ids: change.backup_job_ids, reason: change.reason });
        }
        if (change.type === "session.status") {
            const session = preparation.sessions.find(session => session.id === change.id);
            if (!session) return fail(404, "训练不存在");
            session.status = change.status; session.updated_at = new Date().toISOString();
        }
        preparation.revision++;
        return send(publicPreparation());
    }
    if (url.pathname === "/api/v1/agent/career/changes") {
        if (data.revision !== career.revision)
            return fail(409, "资料已更新，请刷新。");
        const change = data.change;
        if (change.type === "action.update")
            career.actions = career.actions.map((a) =>
                a.id === change.id
                    ? { ...a, status: change.status, result: change.result }
                    : a,
            );
        if (change.type === "proposal.decide") {
            const proposal = career.proposals.find((p) => p.id === change.id);
            if (change.approved && proposal)
                career.profile = {
                    ...proposal.data.profile,
                    confirmed_at: new Date().toISOString(),
                };
            career.proposals = career.proposals.filter(
                (p) => p.id !== change.id,
            );
        }
        career.revision++;
        return send(career);
    }
    if (url.pathname === "/api/v1/agent/resume") return send(resume);
    if (url.pathname === "/api/v1/agent/official/credits")
        return send({
            enabled: true,
            summary: {
                daily_points: 2300,
                remaining_points: 1680,
                used_points: 620,
                reserved_points: 0,
                resets_at: now,
            },
            entries: [
                {
                    id: "usage-1",
                    created_at: now,
                    capability: "简历整理",
                    state: "completed",
                    points: 120,
                    reserved_points: 0,
                },
            ],
            next_cursor: null,
        });
    const catalogueLimit = {
        "/api/v1/agent/career/catalogue/directions": [25, 8],
        "/api/v1/agent/career/catalogue/jobs": [5, 3],
    }[url.pathname];
    if (catalogueLimit) {
        const [maximum, fallback] = catalogueLimit;
        const limit = Number(url.searchParams.get("limit") ?? fallback);
        if (!Number.isInteger(limit) || limit < 1 || limit > maximum)
            return fail(400, "目录请求数量超出接口上限。");
    }
    if (url.pathname === "/api/v1/agent/career/catalogue/directions")
        return send({
            total: 2,
            directions: [
                {
                    code: "product",
                    name: "产品与用户研究",
                    summary: "理解用户问题，梳理需求并协作推进产品。",
                    common_skills: ["用户研究", "需求分析", "沟通协作"],
                    title_rule_sample_count: 4,
                    collected_sample_count: 3,
                },
                {
                    code: "data",
                    name: "数据分析",
                    summary: "从数据中发现问题和机会。",
                    common_skills: ["统计", "SQL", "可视化"],
                    title_rule_sample_count: 3,
                    collected_sample_count: 2,
                },
            ],
        });
    if (url.pathname === "/api/v1/agent/career/catalogue/jobs")
        return send({
            total: 1,
            samples: [
                {
                    id: "sample-1",
                    title: "产品实习生",
                    company: "示例公司",
                    city: "上海",
                    excerpt: "协助梳理用户需求，整理访谈与产品反馈。",
                    source_url: "https://example.com/jobs/demo",
                    data_kind: "historical",
                    captured_at: now,
                    recruitment_status: "unknown",
                    availability: "unverified",
                    reference_notice: "仅作要求对照",
                    direction_codes: ["product"],
                },
            ],
            filter_notes: [],
        });
    if (url.pathname === "/api/v1/hub/sessions") {
        if (req.method === "GET")
            return send(
                [...snapshots.values()]
                    .map((s) => s.conversation)
                    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
            );
        const id = randomUUID(),
            time = new Date().toISOString(),
            conversation = {
                id,
                title: "新的对话",
                target: data.target,
                device_id: data.device_id,
                workspace_id: data.workspace_id,
                workspace_name: data.workspace_id ? "求职资料" : null,
                archived: false,
                created_at: time,
                updated_at: time,
            };
        snapshots.set(id, {
            conversation,
            messages: [],
            runs: [],
            tasks: [],
            files: [],
            events: [],
            drafts: {},
            approvals: [],
            last_seq: 0,
        });
        return send(conversation);
    }
    const sm = url.pathname.match(
        /^\/api\/v1\/hub\/sessions\/([^/]+)(?:\/(tasks|files))?$/,
    );
    if (sm) {
        const snapshot = snapshots.get(sm[1]);
        if (!snapshot) return fail(404, "会话不存在");
        if (sm[2] === "files") {
            const file = {
                id: randomUUID(),
                session_id: sm[1],
                conversation_id: sm[1],
                name: data.name,
                kind: "input",
                path: data.name,
                bytes: Buffer.from(data.base64, "base64").length,
                sha256: "preview-only",
                version: 1,
                created_at: new Date().toISOString(),
            };
            snapshot.files.push(file);
            return send(file);
        }
        if (sm[2] === "tasks") {
            const duplicate = snapshot.tasks.find(
                (t) => t.request_id === data.request_id,
            );
            if (duplicate) return send(duplicate);
            const nativeId = snapshot.conversation.local_id || snapshot.conversation.id;
            if (data.input.includes("start_career_preparation")) {
                const mode = data.input.includes("模拟试卷") ? "exam" : data.input.includes("文字模拟面试") ? "interview" : "practice";
                const selected = career.jobs.find(job => data.input.includes(job.id)) || career.jobs[0];
                const total = Number(data.input.match(/(?:现场出|共 )([358])/u)?.[1] || 3);
                preparation.sessions.unshift({ id: randomUUID(), conversation_id: nativeId, job_id: selected.id, job_title: selected.title, mode, status: "active", focus: ["需求分析"], total, questions: Array.from({ length: total }, (_, index) => ({ ...questionBank[index % 3], id: randomUUID() })), answers: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
                preparation.revision++;
            } else {
                const session = preparation.sessions.find(session => session.conversation_id === nativeId && session.status === "active");
                if (session && session.answers.length < session.total) {
                    session.answers.push({ question_id: session.questions[session.answers.length].id, text: data.input, created_at: new Date().toISOString(), verdict: "partial", strengths: ["表达了自己的思路"], gaps: ["可以补充实际案例"], next_exercise: "用课程项目说明判断依据" });
                    session.updated_at = new Date().toISOString();
                    if (session.answers.length === session.total) session.status = "completed";
                    preparation.revision++;
                }
            }
            const time = new Date().toISOString(),
                rid = randomUUID(),
                task = {
                    id: randomUUID(),
                    session_id: snapshot.conversation.id,
                    status: "completed",
                    input: data.input,
                    target: snapshot.conversation.target,
                    device_id: snapshot.conversation.device_id,
                    local_run_id: rid,
                    error: null,
                    request_id: data.request_id,
                    created_at: time,
                    updated_at: time,
                };
            if (/成长|整理这段对话|简历/.test(data.input))
                career.proposals.push({
                    id: randomUUID(),
                    title: "这段对话整理的技能与偏好",
                    created_at: time,
                    conversation_id: randomUUID(),
                    data: {
                        kind: "profile",
                        profile: {
                            ...career.profile,
                            skills: "需求梳理、访谈记录整理、基础数据分析",
                        },
                    },
                });
            snapshot.tasks.push(task);
            snapshot.messages.push(
                {
                    id: randomUUID(),
                    role: "user",
                    content: data.input,
                    run_id: rid,
                    created_at: time,
                },
                {
                    id: randomUUID(),
                    role: "assistant",
                    content:
                        "收到，我们接着推进。\n\n- 先核对真实信息\n- 再整理下一步行动",
                    run_id: rid,
                    created_at: time,
                },
            );
            snapshot.runs.push({
                id: rid,
                status: "completed",
                steps: 1,
                error: null,
                created_at: time,
                updated_at: time,
            });
            snapshot.conversation.updated_at = time;
            return send(task);
        }
        if (req.method === "POST") {
            snapshot.conversation = { ...snapshot.conversation, ...data };
            return send(snapshot.conversation);
        }
        if (req.method === "DELETE") {
            snapshots.delete(sm[1]);
            return send({ ok: true });
        }
        return send(snapshot);
    }
    const tm = url.pathname.match(
        /^\/api\/v1\/hub\/tasks\/([^/]+)\/(cancel|approve)$/,
    );
    if (tm) {
        for (const snapshot of snapshots.values()) {
            const task = snapshot.tasks.find((t) => t.id === tm[1]);
            if (task) {
                task.status = tm[2] === "cancel" ? "cancelled" : "completed";
                const run = snapshot.runs.find(
                    (r) => r.id === task.local_run_id,
                );
                if (run) run.status = task.status;
                for (const approval of snapshot.approvals)
                    approval.status = "approved";
                return send({ ok: true });
            }
        }
    }
    if (/^\/api\/v1\/hub\/files\/[^/]+\/content$/.test(url.pathname)) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.end(
            "# 原型预览文件\n\n这是合成内容，用于验证鉴权文件预览。\n不会连接真实模型或用户数据库。",
        );
    }
    return fail(404, "合成预览未提供该接口。");
});
server.listen(8196, "127.0.0.1", () =>
    console.log("Synthetic preview API: http://127.0.0.1:8196"),
);
