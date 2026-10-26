/** 青穗集 · 最小工具集：结构化文件处理、显式计划、追问和沙箱命令，参数逐项校验。 */
import { z } from "zod";
import { directionSearchInput, jobSearchInput, jobReadInput } from "./job-catalogue.js";
import { Workspace } from "./files.js";
import type {
  Sandbox,
  ToolDefinition,
  ToolCall,
  Run,
  Artifact,
} from "./types.js";
import { AppError, invariant } from "./errors.js";
import { careerProposalInput, type CareerWorkspace } from "./career.js";
import { resumeProposalInput, resumeCaptureInput, resumePrepareInput, type ResumeWorkspace } from "./resume.js";
import type { ResumeTaskKind } from "./resume-contract.js";
const path = z.string().min(1).max(240);
const schemas = {
  read_resume_context: z.object({}).strict(),
  capture_resume_material: resumeCaptureInput,
  prepare_resume_step: resumePrepareInput,
  propose_resume_update: resumeProposalInput,
  list_career_directions: directionSearchInput,
  search_job_samples: jobSearchInput,
  read_job_sample: jobReadInput,
  read_career_context: z.object({}).strict(),
  propose_career_update: careerProposalInput,
  list_files: z.object({}).strict(),
  read_file: z
    .object({
      path,
      offset: z.number().int().min(0).max(2_000_000).default(0),
      limit: z.number().int().min(1).max(16000).default(16000),
    })
    .strict(),
  write_file: z.object({ path, content: z.string().max(1_000_000) }).strict(),
  publish_file: z.object({ path }).strict(),
  search_files: z.object({ query: z.string().min(1).max(200) }).strict(),
  plan_tasks: z
    .object({
      steps: z
        .array(
          z
            .object({
              title: z.string().min(1).max(120),
              status: z.enum(["pending", "working", "done"]),
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict(),
  ask_user: z.object({ question: z.string().min(1).max(2000) }).strict(),
  request_export: z.object({ artifact_id: z.string().uuid() }).strict(),
  run_command: z.object({ command: z.string().min(1).max(16000) }).strict(),
};
const descriptions: Record<keyof typeof schemas, string> = {
  read_resume_context: "读取简历对话已记录的原句、确认状态、可选目标 JD 和待处理请求。先读后记录，避免重复提问。",
  capture_resume_material: "按当前 context_version 增量保留用户原句：experience 为经历，direction 为方向，target 为招聘要求。quote 必须来自本轮消息或指定 inputs/ 文本文件，title/company 必须是 quote 的子串。只收集不确认，不保存模型猜测。",
  prepare_resume_step: "资料足够或用户希望整理时发起 facts/selection/rewrite 请求，返回 pending.id。无需 JD 也可整理经历和方向版简历，但必须等用户亲自确认事实及取舍后再写正文。",
  propose_resume_update: "只提交 pending 对应步骤的简历草稿。先读取 request_id；事实必须引用原文，要求必须引用 JD。不会替用户确认或进入下一步，成功后等待用户核对。",
  list_career_directions: "从离线库读取职业方向、技能、成长路径及样本数量。旧库数量是标题线索，新批次数量是待审核分类；均不是市场统计或当前在招数量。可按 query 搜索，limit 最多 25。",
  search_job_samples: "从清洗合并的离线岗位库检索参考。可按关键词、direction_code、城市及实习/应届线索筛选；scope 可选 collected/legacy/all。默认排除明确关闭或截止日已过的记录，其余仍不保证在招。仅用户需要历史研究时使用 availability=all_references。相关性不是适合度，零结果不代表市场不存在，不得偷偷放宽用户约束。比较前用 read_job_sample 读完整原文。",
  read_job_sample: "按 search_job_samples 返回的 id 读取完整岗位原文、日期、来源证据及审核提示。采集时间是采集方报告，不证明当前在招；方向和来源未完成人工逐条审核。用户希望保留参考时，读取职业 context_version，再以 catalogue_job 提出待确认建议。",
  read_career_context: "读取当前用户已保存的职业档案、岗位原文、行动结果、来源 ID 和 pending_proposals 的完整待确认草稿；普通闲聊不必调用。先读取 context_version，再根据这些材料生成草稿。用户要求修改已有建议时，必须读取对应 pending_proposals.data，不能只依赖标题或历史对话。",
  propose_career_update: "提出职业档案、岗位参考样本、岗位对照或学习行动草稿，展示在工作台等待用户确认；不会直接更改已确认内容。skills 用于有引文的实践阶段记录（contact/project/independent），必须引用 read_career_context 返回的非岗位 sources，用户确认不是能力认证；catalogue_job 只提交已检索的 catalogue_id，原文由服务端固定，不需要复制或改写。context_version 来自刚读取的资料；comparison 的 requirement 与 evidence.quote 必须逐字来自对应原文。修改已有建议时提交完整替代草稿，同类型同岗位的旧草稿会被替换。",
  list_files:
    "列出本段对话已导入的 inputs 与可修改的 outputs。不能访问本机其他路径。",
  read_file: "读取资料区 UTF-8 文本，支持分段读取。只能使用列出的相对路径。",
  write_file:
    "真实创建或修改 outputs/ 下的文本成果，自动保存不可变版本。不能覆盖 inputs/。",
  publish_file: "将沙箱生成的 outputs/ 文件登记为可预览的真实成果版本。",
  search_files: "在本对话文本文件中搜索字面关键词，返回有限命中。",
  plan_tasks: "向用户展示可调整的简短任务步骤，不等于已经执行。",
  ask_user: "缺少关键资料时向用户追问并结束当前轮次，等待补充。",
  request_export:
    "请求用户确认导出指定成果版本。未经用户确认不允许下载，不填写任意本机目标路径。",
  run_command:
    "仅在当前已选择的受限命令环境执行。先遵循环境给出的终端语法和输入输出路径，不得假设 Linux 或已安装 Python。环境未就绪时如实报告，不能改用无限制宿主终端。生成的成果须用 publish_file 登记。",
};
export const toolDefinitions: ToolDefinition[] = Object.entries(schemas).map(
  ([name, schema]) => ({
    name,
    description: descriptions[name as keyof typeof schemas],
    parameters: z.toJSONSchema(schema) as Record<string, unknown>,
  }),
);
export function toolDefinitionsFor(sandbox: Sandbox, workspace: string, resumeKind?: ResumeTaskKind, legacyResumeTask = false): ToolDefinition[] {
  const context = sandbox.commandContext?.(workspace);
  return toolDefinitions.filter(tool => !legacyResumeTask || ["read_resume_context", "propose_resume_update", "plan_tasks", "ask_user"].includes(tool.name)).map(tool => {
    if (tool.name === "run_command" && context) return { ...tool, description: context };
    if (tool.name === "propose_resume_update" && resumeKind) {
      const index = { facts: 0, selection: 1, rewrite: 2 }[resumeKind];
      const schema = z.object({ request_id: resumeProposalInput.shape.request_id, data: resumeProposalInput.shape.data.options[index] }).strict();
      return { ...tool, parameters: z.toJSONSchema(schema) as Record<string, unknown> };
    }
    return tool;
  });
}
export interface ToolResult {
  value: unknown;
  complete?: string;
  artifact?: Artifact;
  pause?: "input" | "approval";
  question?: string;
  artifactId?: string;
}
export async function executeTool(
  call: ToolCall,
  run: Run,
  workspace: Workspace,
  sandbox: Sandbox,
  signal: AbortSignal,
  career?: CareerWorkspace,
  resume?: ResumeWorkspace,
): Promise<ToolResult> {
  signal.throwIfAborted();
  const schema = schemas[call.name as keyof typeof schemas];
  invariant(schema, 400, "未开放这个工具，不能调用任意程序。");
  let raw: unknown;
  try {
    raw = JSON.parse(call.arguments);
  } catch {
    throw new AppError(400, "工具参数不是合法 JSON。");
  }
  const parsed = schema.safeParse(raw);
  invariant(parsed.success, 400, "工具参数不符合约定，请根据工具定义修正。");
  const args = parsed.data as Record<string, unknown>;
  switch (call.name) {
    case "read_resume_context":
      invariant(resume, 503, "简历资料尚未就绪。");
      return { value: run.input.startsWith("[简历工坊]") ? resume.context(run.user_id) : resume.coachingContext(run.user_id, run.conversation_id) };
    case "capture_resume_material": {
      invariant(resume, 503, "简历资料尚未就绪。");
      const data = resumeCaptureInput.parse(raw);
      let evidence = run.input, name = "与穗奈的对话原文";
      if (data.source.kind === "message" && data.source.message_id) {
        resume.store.conversation(run.user_id, run.conversation_id);
        const messageId = data.source.message_id;
        const selected = resume.store.messages(run.conversation_id).find(message => message.id === messageId && message.role === "user");
        invariant(selected, 400, "只能引用当前对话中真实的用户消息，不能引用助手消息或其他对话。");
        evidence = selected.content;
      }
      if (data.source.kind === "input_file") {
        const source = data.source;
        const input = (await workspace.list(run.conversation_id)).find(file => file.path === source.path && file.path.startsWith("inputs/"));
        invariant(input && /\.(txt|md)$/i.test(input.path), 400, "仅从当前对话导入的 TXT / Markdown 收集原文；PDF / Word 请复制文字。");
        evidence = (await workspace.read(run.conversation_id, input.path, source.offset, 16000)).text;
        name = input.path.split("/").at(-1) || "导入的文本材料";
      }
      return { value: resume.capture(run.user_id, run.conversation_id, data, evidence, name) };
    }
    case "prepare_resume_step":
      invariant(resume, 503, "简历资料尚未就绪。");
      return { value: resume.prepare(run.user_id, run.conversation_id, raw) };
    case "propose_resume_update": {
      invariant(resume, 503, "简历资料尚未就绪。");
      const value = resume.propose(run.user_id, run.conversation_id, parsed.data);
      return !run.input.startsWith("[简历工坊]") ? { value } : { value, complete: "这一步的草稿已经整理好，请检查并确认。未自动推进下一步，也未写入正式职业档案。" };
    }
    case "list_career_directions":
      invariant(career, 503, "职业工作台尚未就绪。");
      return { value: career.catalogue.listCareerDirections(parsed.data) };
    case "search_job_samples":
      invariant(career, 503, "职业工作台尚未就绪。");
      return { value: career.catalogue.searchJobSamples(parsed.data) };
    case "read_job_sample":
      invariant(career, 503, "职业工作台尚未就绪。");
      return { value: career.catalogue.readJobSample(parsed.data) };
    case "read_career_context":
      invariant(career, 503, "职业工作台尚未就绪。");
      return { value: career.context(run.user_id) };
    case "propose_career_update":
      invariant(career, 503, "职业工作台尚未就绪。");
      return { value: career.propose(run.user_id, run.conversation_id, parsed.data) };
    case "list_files":
      return { value: await workspace.list(run.conversation_id) };
    case "read_file":
      return {
        value: await workspace.read(
          run.conversation_id,
          String(args.path),
          Number(args.offset),
          Number(args.limit),
        ),
      };
    case "write_file": {
      const artifact = await workspace.write(
        run.conversation_id,
        run.id,
        String(args.path),
        String(args.content),
      );
      return { value: { created: true, artifact, link: "artifact:" + artifact.id }, artifact };
    }
    case "publish_file": {
      const artifact = await workspace.publish(
        run.conversation_id,
        run.id,
        String(args.path),
      );
      return { value: { published: true, artifact, link: "artifact:" + artifact.id }, artifact };
    }
    case "search_files": {
      const matches: Array<{ path: string; excerpt: string }> = [];
      for (const file of (await workspace.list(run.conversation_id)).slice(
        0,
        60,
      )) {
        if (file.bytes > 128000) continue;
        try {
          const result = await workspace.read(
            run.conversation_id,
            file.path,
            0,
            128000,
          );
          const index = result.text.indexOf(String(args.query));
          if (index >= 0)
            matches.push({
              path: file.path,
              excerpt: result.text.slice(Math.max(0, index - 100), index + 300),
            });
        } catch {}
        if (matches.length >= 20) break;
      }
      return { value: matches };
    }
    case "plan_tasks":
      return { value: { steps: args.steps } };
    case "ask_user":
      return {
        value: { waiting_for_user: true, question: args.question },
        pause: "input",
        question: String(args.question),
      };
    case "request_export":
      return {
        value: { waiting_for_approval: true },
        pause: "approval",
        artifactId: String(args.artifact_id),
      };
    case "run_command":
      return {
        value: await sandbox.execute(
          String(args.command),
          await workspace.root(run.conversation_id),
          signal,
        ),
      };
    default:
      throw new AppError(400, "未开放这个工具。");
  }
}
