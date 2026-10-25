/** 青穗集 · 新 Agent 工作区：保留穗奈与桌面主题，接通真实模型、连续任务和可检查文件。 */
import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    type FormEvent,
} from "react";
import { Login } from "../components/Login";
import { SuinaiMotionCharacter } from "../components/SuinaiMotionCharacter";
import { useReducedMotion } from "../character/preferences";
import { tokenStore } from "../api/client";
import { agentApi, streamEvents, AgentApiError } from "./api";
import { ModelSettings } from "./ModelSettings";
import { AgentIcon } from "./AgentIcon";
import { ConversationHistory, ConversationActions, RenameConversationDialog } from "./ConversationHistory";
import { ChatComposer } from "./ChatComposer";
import { ExecutionToggle, RunActivity } from "./RunActivity";
import { RunFailure } from "./RunFailure";
import { AsciiArt, UiMotionToggle } from "./AsciiArt";
import { useUiMotion } from "./uiMotion";
import { ExecutionPanel } from "./ExecutionPanel";
import { executionRecords, type ExecutionRecord } from "./execution";
import { CareerIcon } from "./CareerVisuals";
import { GuidedTaskBar } from "./GuidedTaskBar";
import { SuinaiBubble } from "./SuinaiBubble";
import { ConversationMemory } from "./ConversationMemory";
import { ComposerMenu } from "./ComposerMenu";
import { useConversationInsights } from "./useConversationInsights";
import { useCompanionNudge } from "./useCompanionNudge";
import { acceptGuidance, activeTask, composerDraftReducer, EMPTY_COMPOSER_DRAFT, TASK_LABELS, TASK_PROMPTS } from "./companion-state";
import type { GuidanceView, TaskKind } from "../../../agent/src/guidance-contract";
import { CareerWelcome } from "./CareerWelcome";
import { CareerWorkbench } from "./CareerWorkbench";
import { useCareerWorkspace } from "./career-workspace";
import { jobsByRun } from "./job-cards";
import { JobRecommendationCard, JobDetailPanel, GrowthSummary, ProfileUpdateStrip, NextActionRow } from "./CareerComponents";
import { DesktopWindow } from "./DesktopWindow";
import { ResumeCheckpoint } from "./ResumeCheckpoint";
import { ResumeConversationBar, ResumeConversationDemo } from "./ResumeConversation";
import { useResumeWorkspace } from "./resume-workspace";
import type { CareerTab } from "./career";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import { SUINAI_AVATAR_URL } from "../assets";
import { MessageContent } from "./MessageContent";
import { useMessageEntrance } from "./messageEntrance";
import { MessageActions, MessageEditor } from "./MessageActions";
import { StreamingContent } from "./StreamingContent";
import { FileActionProvider, FileDirectory, MessageFileLinks } from "./FileLinks";
import { FilePreviewPanel } from "./FilePreviewPanel";
import { latestFiles, unlinkedFiles } from "./artifactLinks";
import { applyEvent, initialView, type ViewState } from "./state";
import {
    isActive,
    type ChatMessage,
    type AgentFile,
    type AgentInfo,
    type AgentUser,
    type Conversation,
    type ModelProfile,
    type AgentApproval,
    type PermissionMode,
    type ReasoningEffort,
} from "./types";
import "./agent.css";
import "./career-theme.css";
import "./file-workspace.css";
import "./execution.css";
import "./ascii-interactions.css";
import "./career-workbench.css";
import "./desktop-window.css";
import "./companion-guidance.css";
import "./message-interactions.css";
import "./career-components.css";
import "./profile-dossier.css";
function companionPreference(userId: number, key: string) { try { return localStorage.getItem("suinai." + key + "." + userId) !== "0"; } catch { return true; } }
function remember(id: string) {
    try {
        localStorage.setItem("agent.selectedModel", id);
    } catch {}
}
function preferred() {
    try {
        return localStorage.getItem("agent.selectedModel") ?? "";
    } catch {
        return "";
    }
}
export function AgentApp() {
    const [user, setUser] = useState<AgentUser | null>(null),
        [checking, setChecking] = useState(true),
        [authError, setAuthError] = useState(""),
        [epoch, setEpoch] = useState(0);
    useEffect(() => {
        let alive = true;
        setChecking(true);
        if (!tokenStore.get()) {
            setUser(null);
            setChecking(false);
            return;
        }
        agentApi
            .me()
            .then((value) => {
                if (alive) setUser(value);
            })
            .catch((error) => {
                if (alive) {
                    setUser(null);
                    setAuthError(error.message);
                }
            })
            .finally(() => {
                if (alive) setChecking(false);
            });
        return () => {
            alive = false;
        };
    }, [epoch]);
    useEffect(() => {
        const expired = () => {
            setUser(null);
            setChecking(false);
        };
        window.addEventListener("agent:unauthorized", expired);
        return () => window.removeEventListener("agent:unauthorized", expired);
    }, []);
    if (checking)
        return (
            <main className="agent-loading" role="status">
                正在连接本机工作区…
            </main>
        );
    if (!user)
        return (
            <>
                <Login
                    variant="agent"
                    onSuccess={() => {
                        setAuthError("");
                        setEpoch((value) => value + 1);
                    }}
                />
                <div className="agent-login-note">
                    新版 Agent 使用独立本地账号；首次使用请注册，密码至少 8
                    位。旧版账号资料没有被删除。
                    {authError ? <span role="alert">{authError}</span> : null}
                </div>
            </>
        );
    return (
        <Workspace
            user={user}
            onUser={setUser}
            onLogout={() => {
                tokenStore.clear();
                setUser(null);
            }}
        />
    );
}
function Workspace({
    user,
    onUser,
    onLogout,
}: {
    user: AgentUser;
    onUser: (user: AgentUser) => void;
    onLogout: () => void;
}) {
    const { confirm, cancel: cancelConfirmation, dialog: confirmationDialog } = usePixelConfirm();
    const [info, setInfo] = useState<AgentInfo | null>(null),
        [profiles, setProfiles] = useState<ModelProfile[]>([]),
        [conversations, setConversations] = useState<Conversation[]>([]),
        [conversationId, setConversationId] = useState<string | null>(() => {
            try {
                return localStorage.getItem("agent.conversation." + user.id);
            } catch {
                return null;
            }
        }),
        [selected, setSelected] = useState(preferred),
        [view, setView] = useState<ViewState | null>(null),
        [notice, setNotice] = useState(""),
        [settings, setSettings] = useState(false),
        [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 1180),
        [workbenchStatus, setWorkbenchStatus] = useState<"closed" | "open" | "minimized">("closed"),
        [careerTab, setCareerTab] = useState<CareerTab>("profile"),
        [resumeOpen, setResumeOpen] = useState(false),
        [resumeDemo, setResumeDemo] = useState(false),
        [pendingCareerCount, setPendingCareerCount] = useState(0),
        [showArchived, setShowArchived] = useState(false),
        [historyBusy, setHistoryBusy] = useState(false),
        [renaming, setRenaming] = useState<Conversation | null>(null),
        [resumeBarDismissed, setResumeBarDismissed] = useState(false),
        [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null),
        [sentRunId, setSentRunId] = useState<string | null>(null),
        [changingTask, setChangingTask] = useState(false),
        [permission, setPermission] = useState<PermissionMode>("default"),
        [effort, setEffort] = useState<ReasoningEffort>("auto"),
        [working, setWorking] = useState(false),
        [connected, setConnected] = useState(true),
        [reconnect, setReconnect] = useState(0),
        [jobDetailId, setJobDetailId] = useState<string | null>(null),
        [preview, setPreview] = useState<AgentFile | null>(null),
        [execution, setExecution] = useState<{ runId: string; recordKey?: string; selectionId: number } | null>(null),
        [fileBusy, setFileBusy] = useState(false),
        [motion, setMotion] = useState(
            () => localStorage.getItem("career.motion") !== "0",
        );
    const [draft, dispatchDraft] = useReducer(composerDraftReducer, EMPTY_COMPOSER_DRAFT);
    const text = draft.text;
    function editText(value: string) { dispatchDraft({ type: "edit", text: value }); }
    const [smartSuggestions, setSmartSuggestions] = useState(() => companionPreference(user.id, "smartSuggestions"));
    const [idleChat, setIdleChat] = useState(() => companionPreference(user.id, "idleChat"));
    const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>(() => { try { const stored: unknown = JSON.parse(localStorage.getItem("suinai.dismissed." + user.id) || "[]"); return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string").slice(-100) : []; } catch { return []; } });
    const reduced = useReducedMotion();
    const { playing: uiMotion } = useUiMotion();
    const fileInput = useRef<HTMLInputElement>(null),
        composer = useRef<HTMLTextAreaElement>(null),
        messageFlow = useRef<HTMLDivElement>(null);
    const followBottom = useRef(true);
    useEffect(() => {
        const narrow = window.matchMedia("(max-width: 1180px)");
        const resized = () => { if (narrow.matches) setInspectorOpen(false); };
        narrow.addEventListener("change", resized);
        return () => narrow.removeEventListener("change", resized);
    }, []);
    const creation = useRef<Promise<string> | null>(null);
    const pendingRequest = useRef<{ key: string; id: string } | null>(null);
    const pendingRetry = useRef<{ runId: string; id: string } | null>(null);
    const deletedConversations = useRef(new Set<string>());
    const deletingConversation = useRef<string | null>(null);
    const mounted = useRef(true);
    const currentConversation = useRef(conversationId);
    currentConversation.current = conversationId;
    function chooseConversation(id: string | null) { if (id !== null && currentConversation.current === id) return; currentConversation.current = id; setEditingMessage(null); pendingRequest.current = null; setSentRunId(null); setView(null); setRenaming(null); setResumeBarDismissed(false); setResumeDemo(false); setPreview(null); setExecution(null); setJobDetailId(null); cancelConfirmation(); setPermission("default"); setConversationId(id); dispatchDraft({ type: "reset" }); setNotice(""); }
    useEffect(() => {
        try {
            const key = "agent.conversation." + user.id;
            if (conversationId) localStorage.setItem(key, conversationId);
            else localStorage.removeItem(key);
        } catch {}
    }, [conversationId, user.id]);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const load = useCallback(async (id?: string) => {
        const [nextInfo, nextProfiles, nextConversations] = await Promise.all([
            agentApi.info(),
            agentApi.profiles(),
            agentApi.conversations(),
        ]);
        if (!mounted.current) return;
        setInfo(nextInfo);
        setProfiles(nextProfiles);
        setConversations(nextConversations.filter(item => !deletedConversations.current.has(item.id)));
        setSelected((current) => {
            const next =
                id ??
                (nextProfiles.some((p) => p.id === current)
                    ? current
                    : (nextProfiles[0]?.id ?? ""));
            remember(next);
            return next;
        });
    }, []);
    useEffect(() => {
        void load().catch((error) => setNotice(error.message));
    }, [load]);
    useEffect(() => {
        if (!conversationId) {
            setView(null);
            setConnected(true);
            return;
        }
        const controller = new AbortController();
        setView(null);
        setConnected(true);
        void agentApi
            .snapshot(conversationId)
            .then((snapshot) => {
                if (controller.signal.aborted) return;
                setView(initialView(snapshot));
                if (snapshot.conversation.profile_id)
                    setSelected(snapshot.conversation.profile_id);
                return streamEvents(
                    conversationId,
                    snapshot.last_seq,
                    controller.signal,
                    (event) => {
                        if (controller.signal.aborted || currentConversation.current !== conversationId) return;
                        if (event.kind === "conversation.deleted") {
                            deletedConversations.current.add(conversationId);
                            setConversations(items => items.filter(item => item.id !== conversationId));
                            if (currentConversation.current === conversationId) { chooseConversation(null); setNotice(deletingConversation.current === conversationId ? "对话及其资料、成果已永久删除。" : "这段对话已在另一处被删除。"); }
                            controller.abort(); return;
                        }
                        setView((state) => state ? applyEvent(state, event) : state);
                        if (event.kind === "model.notice") setNotice(String(event.data.message ?? "模型参数提示"));
                        if (event.kind === "run.status")
                            void agentApi
                                .conversations()
                                .then(items => setConversations(items.filter(item => !deletedConversations.current.has(item.id))))
                                .catch(() => {});
                    },
                    setConnected,
                );
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    if (error instanceof AgentApiError && error.status === 404) {
                        deletedConversations.current.add(conversationId);
                        setConversations(items => items.filter(item => item.id !== conversationId));
                        if (currentConversation.current === conversationId) { chooseConversation(null); setNotice("这段对话已不存在，已回到空白对话。"); }
                        return;
                    }
                    setConnected(false);
                    setNotice(error.message);
                }
            });
        return () => controller.abort();
    }, [conversationId, reconnect]);
    const snapshot = view?.snapshot;
    const run = snapshot?.runs.at(-1);
    const busy = isActive(run);
    const profile = profiles.find((item) => item.id === selected);
    const messages =
        snapshot?.messages.filter(
            (message) => message.role !== "tool" && message.content,
        ) ?? [];
    const drafts = Object.entries(view?.drafts ?? {});
    const displayMessages: (ChatMessage & { streaming?: boolean })[] = [...messages, ...drafts.filter(([key]) => !messages.some(message => message.id === key)).map(([key, content]) => ({ id: key, role: "assistant" as const, content, created_at: run?.created_at ?? "", run_id: run?.id ?? null, streaming: true }))];
    const arrivingMessages = useMessageEntrance(conversationId, Boolean(snapshot), displayMessages.map(message => message.id), uiMotion);
    const files = useMemo(() => [...(snapshot?.artifacts ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), [snapshot?.artifacts]);
    const lastReply = new Map<string, string>(), replyText = new Map<string, string>();
    for (const message of messages) if (message.role === "assistant" && message.run_id) {
        lastReply.set(message.run_id, message.id);
        replyText.set(message.run_id, (replyText.get(message.run_id) ?? "") + "\n" + message.content);
    }
    const deliveries = new Map<string, AgentFile[]>();
    for (const [id, messageId] of lastReply) deliveries.set(messageId, unlinkedFiles(replyText.get(id) ?? "", files.filter(file => file.kind === "output" && file.run_id === id)));
    const unassignedFiles = latestFiles(files.filter(file => file.kind === "output" && (!file.run_id || !lastReply.has(file.run_id))));
    const pendingApprovals = (snapshot?.approvals ?? []).filter(
        (approval) => approval.status === "pending",
    );
    const records = useMemo(() => executionRecords(snapshot?.messages ?? [], view?.events ?? [], snapshot?.runs ?? []), [snapshot?.messages, view?.events, snapshot?.runs]);
    const recordsByRun = useMemo(() => {
        const values = new Map<string, ExecutionRecord[]>();
        for (const record of records) {
            const group = values.get(record.runId);
            if (group) group.push(record);
            else values.set(record.runId, [record]);
        }
        return values;
    }, [records]);
    const runsById = new Map((snapshot?.runs ?? []).map(item => [item.id, item]));
    const executionRun = execution ? runsById.get(execution.runId) : undefined;
    const careerPulse = [run?.id, run?.status, ...(view?.events ?? []).filter(event => event.kind === "tool.finished").map(event => event.seq)].join(":");
    const careerWorkspace = useCareerWorkspace(user.id, careerPulse);
    const recommendedJobs = useMemo(() => jobsByRun(snapshot?.messages ?? []), [snapshot?.messages]);
    const careerState = careerWorkspace.state;
    const cardDisabled = busy || working || fileBusy || Boolean(snapshot?.conversation.archived);
    function openJob(id: string) { setPreview(null); setExecution(null); setJobDetailId(id); setInspectorOpen(true); }
    function saveJob(id: string, saved: boolean) { void careerWorkspace.change({ type: "catalogue.save", catalogue_id: id, saved }, saved ? "已收藏岗位。" : "已取消收藏。"); }
    function renderJobCards(runId: string) {
        const items = recommendedJobs.get(runId);
        return items?.length ? <section className="conversation-job-cards" aria-label="本次检索的岗位参考">{items.map(job => <JobRecommendationCard key={job.id} job={job} saved={Boolean(careerState?.saved_jobs?.some(item => item.catalogue_id === job.id))} saving={careerWorkspace.saving || !careerState} disabled={cardDisabled} onOpen={() => openJob(job.id)} onSave={() => saveJob(job.id, !careerState?.saved_jobs?.some(item => item.catalogue_id === job.id))} onPrompt={fillPrompt} />)}</section> : null;
    }
    const resumeTools = ["read_resume_context", "capture_resume_material", "prepare_resume_step", "propose_resume_update"];
    const guidance = snapshot?.guidance;
    const task = activeTask(guidance);
    const resumeActive = Boolean(task?.kind === "resume" || (!guidance?.tasks.length && (snapshot?.conversation.mode === "resume"
        || snapshot?.messages.some(message => message.tool_calls?.some(call => resumeTools.includes(call.name)))
        || view?.events.some(event => event.kind === "tool.started" && resumeTools.includes(String((event.data.call as { name?: string } | undefined)?.name))))));
    const resumeWorkspace = useResumeWorkspace(user.id, careerPulse + ":" + conversationId + ":" + guidance?.revision, resumeActive || resumeOpen, conversationId);
    const insightReady = Boolean(user.external_ai_consent && profile?.has_key && profile.capabilities.chat);
    function updateGuidance(cid: string, value: GuidanceView) {
        if (currentConversation.current !== cid) return;
        setView(state => state && state.snapshot.conversation.id === cid ? { ...state, snapshot: { ...state.snapshot, guidance: acceptGuidance(state.snapshot.guidance, value) } } : state);
    }
    const insights = useConversationInsights({ conversationId, snapshot, profileId: selected, sentRunId, enabled: smartSuggestions && insightReady, blocked: busy || working || fileBusy || Boolean(snapshot?.conversation.archived) || settings, onUpdate: updateGuidance });
    const companionHidden = Boolean(snapshot?.conversation.archived) || busy || working || fileBusy || settings || resumeDemo || Boolean(preview || executionRun) || workbenchStatus === "open";
    const suggestion = smartSuggestions && guidance?.suggestion && !dismissedSuggestions.includes(guidance.suggestion.id) ? guidance.suggestion : null;
    const idle = useCompanionNudge({ userId: user.id, scope: conversationId ?? "draft", enabled: idleChat, blocked: companionHidden || Boolean(suggestion), hasDraft: Boolean(text.trim()), guidance });
    const bubble = companionHidden ? null : suggestion ? { message: suggestion.message, kind: "intent" as const, actionLabel: TASK_LABELS[suggestion.kind] } : idle.nudge ? { message: idle.nudge, kind: "idle" as const, actionLabel: "继续聊聊" } : null;
    function dismissBubble() {
        if (suggestion) setDismissedSuggestions(values => { const next = [...values, suggestion.id].slice(-100); try { localStorage.setItem("suinai.dismissed." + user.id, JSON.stringify(next)); } catch {} return next; });
        idle.dismiss();
    }
    function acceptBubble() { if (suggestion) void selectTask(suggestion.kind); else { idle.dismiss(); fillPrompt(task ? TASK_PROMPTS[task.kind] : "我们接着聊聊吧。从最近做过的一件小事开始，一次只问我一个问题就好。"); } }
    function setCompanionPreference(key: "smartSuggestions" | "idleChat", value: boolean) {
        if (key === "smartSuggestions") setSmartSuggestions(value); else setIdleChat(value);
        try { localStorage.setItem("suinai." + key + "." + user.id, value ? "1" : "0"); } catch {}
    }
    async function selectTask(kind: TaskKind | null) {
        if (busy || working || fileBusy || snapshot?.conversation.archived || task?.kind === kind || (!task && kind === null)) return;
        setChangingTask(true); setWorking(true); setNotice("");
        try {
            const cid = await ensureConversation();
            const latest = await agentApi.snapshot(cid);
            let value: GuidanceView;
            try { value = await agentApi.changeTask(cid, latest.guidance?.revision ?? 0, kind); }
            catch (cause) {
                if (!(cause instanceof AgentApiError) || cause.code !== "resume_reuse_required") throw cause;
                const accepted = await confirm({ title: "继续使用已有简历草稿？", confirmLabel: "复用并继续", cancelLabel: "先不切换", description: <><p>当前账号的简历草稿是共享的，不是每段对话各有一份。</p><p>继续会在这段对话里使用已有经历和草稿；不会清空内容，也不会创建另一份独立简历。后续修改会更新共享草稿。</p></> });
                if (!accepted) return;
                value = await agentApi.changeTask(cid, latest.guidance?.revision ?? 0, kind, true);
            }
            if (currentConversation.current !== cid) return;
            setView(state => { const base = state?.snapshot.conversation.id === cid ? state : initialView(latest); return { ...base, snapshot: { ...base.snapshot, guidance: acceptGuidance(base.snapshot.guidance, value) } }; });
            idle.dismiss();
            dispatchDraft({ type: "task", kind });
            // 切换结果由任务按钮选中态与输入草稿表达，不额外占用横幅；异常仍在 catch 中提示。
            requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
        } catch (cause) { setNotice((cause as Error).message); }
        finally { setChangingTask(false); setWorking(false); }
    }
    function openResumePreview() { setResumeOpen(true); setCareerTab("files"); setWorkbenchStatus("open"); }
    async function continueResumeConversation(input: string) {
        try { await runResumeTask(input); }
        catch (cause) { setNotice("确认已保存，但后续对话未能发送。你可以在输入框继续：" + (cause as Error).message); throw cause; }
    }
    function minimizeWorkbench() { setWorkbenchStatus("minimized"); requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }
    function closeWorkbench() {
        setWorkbenchStatus("closed");
        requestAnimationFrame(() => {
            const launcher = window.innerWidth <= 760
                ? document.querySelector<HTMLButtonElement>(".career-mobile-workbench")
                : document.getElementById("career-workbench-launcher");
            launcher?.focus({ preventScroll: true });
        });
    }
    useEffect(() => {
        const flow = messageFlow.current, viewport = flow?.parentElement;
        if (!flow || !viewport) return;
        followBottom.current = true;
        let frame = 0;
        const scroll = () => { followBottom.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100; };
        const resize = () => { cancelAnimationFrame(frame); if (followBottom.current) frame = requestAnimationFrame(() => { viewport.scrollTop = viewport.scrollHeight; }); };
        const observer = new ResizeObserver(resize); observer.observe(flow);
        viewport.addEventListener("scroll", scroll, { passive: true }); resize();
        return () => { cancelAnimationFrame(frame); observer.disconnect(); viewport.removeEventListener("scroll", scroll); };
    }, [conversationId]);
    async function ensureConversation() {
        if (conversationId) return conversationId;
        if (creation.current) return creation.current;
        creation.current = agentApi
            .createConversation(selected || null)
            .then((conversation) => {
                if (mounted.current) {
                    setConversations((values) => [conversation, ...values]);
                    currentConversation.current = conversation.id;
                    setConversationId(conversation.id);
                }
                return conversation.id;
            })
            .finally(() => {
                creation.current = null;
            });
        return creation.current;
    }
    async function retryReply() {
        if (!run?.can_retry || working || busy || fileBusy || !conversationId || snapshot?.conversation.archived) return;
        if (run.permission_mode === "full-access" && permission !== "full-access") { setNotice("请先在权限设置中重新确认完全访问，再继续本次回复。"); return; }
        const cid = conversationId;
        setWorking(true); setNotice("");
        if (pendingRetry.current?.runId !== run.id) pendingRetry.current = { runId: run.id, id: crypto.randomUUID() };
        try {
            await agentApi.retry(run.id, pendingRetry.current.id, permission === "full-access");
            pendingRetry.current = null;
            const next = await agentApi.snapshot(cid);
            if (currentConversation.current !== cid) return;
            setSentRunId(run.id);
            setView(state => state && state.snapshot.last_seq > next.last_seq ? state : initialView(next));
        } catch (error) { setNotice((error as Error).message); }
        finally { setWorking(false); }
    }
    async function send(event?: FormEvent) {
        event?.preventDefault();
        await submitMessage(text);
    }
    async function submitMessage(value: string, replacesMessageId?: string) {
        if (working || busy || fileBusy || snapshot?.conversation.archived || !value.trim()) return;
        if (!profile?.capabilities.chat || !profile.has_key) {
            setSettings(true);
            setNotice("请先保存并测试一个可用模型连接。");
            return;
        }
        setWorking(true);
        setNotice("");
        try {
            const cid = await ensureConversation();
            const input = value.trim();
            const key = [cid, selected, input, permission, effort, replacesMessageId ?? ""].join("|");
            if (pendingRequest.current?.key !== key)
                pendingRequest.current = { key, id: crypto.randomUUID() };
            const submittedRun = await agentApi.send(
                cid,
                selected,
                input,
                pendingRequest.current.id,
                { ...(replacesMessageId ? { replaces_message_id: replacesMessageId } : {}), permission_mode: permission, reasoning_effort: effort, full_access_confirmed: permission === "full-access" },
            );
            if (currentConversation.current !== cid) return;
            setSentRunId(submittedRun.id);
            pendingRequest.current = null;
            if (replacesMessageId) { setEditingMessage(null); setPreview(null); setExecution(null); setJobDetailId(null); }
            else dispatchDraft({ type: "reset" });
            followBottom.current = true;
            const next = await agentApi.snapshot(cid);
            if (currentConversation.current !== cid) return;
            setView((state) =>
                state && state.snapshot.last_seq > next.last_seq
                    ? state
                    : initialView(next),
            );
            await load();
        } catch (error) {
            setNotice((error as Error).message);
        } finally {
            setWorking(false);
        }
    }
    async function runResumeTask(input: string) {
        if (working || busy || fileBusy) throw new Error("当前对话还有任务运行，请结束后重试。");
        if (snapshot?.conversation.archived) throw new Error("当前对话已归档，请先恢复或创建新的对话。");
        if (!profile?.has_key || !profile.capabilities.tools || !user.external_ai_consent) {
            setSettings(true); throw new Error("请先连接并测试支持工具的模型，并确认模型服务授权。");
        }
        setWorking(true);
        try {
            const cid = await ensureConversation();
            const submittedRun = await agentApi.send(cid, selected, input, crypto.randomUUID(), { permission_mode: "default", reasoning_effort: effort, full_access_confirmed: false });
            setSentRunId(submittedRun.id);
            const next = await agentApi.snapshot(cid);
            if (currentConversation.current === cid) setView(previous => previous && previous.snapshot.last_seq > next.last_seq ? previous : initialView(next));
            await load();
        } finally { setWorking(false); }
    }
    async function exportResume(revision: number) {
        if (fileBusy) throw new Error("正在处理文件，请稍后再试。");
        if (snapshot?.conversation.archived) throw new Error("请先恢复当前对话或新建对话，再保存简历文件。");
        setFileBusy(true);
        try {
            const cid = await ensureConversation();
            return (await agentApi.exportResume(revision, cid)).artifacts;
        } finally { setFileBusy(false); }
    }
    async function archiveConversation(conversation: Conversation) {
        if (historyBusy || working || fileBusy) return;
        setHistoryBusy(true);
        try {
            const value = await agentApi.archiveConversation(conversation.id, !conversation.archived);
            setConversations(values => values.map(item => item.id === value.id ? value : item));
            if (conversation.id === currentConversation.current) {
                if (value.archived) chooseConversation(null);
                else setView(state => state ? { ...state, snapshot: { ...state.snapshot, conversation: value } } : state);
            }
            setNotice(value.archived ? "对话已归档，资料和成果都保留。可以在“已归档”中恢复。" : "对话已恢复，可以继续聊天。");
        } catch (error) { setNotice((error as Error).message); }
        finally { setHistoryBusy(false); }
    }
    async function renameConversation(conversation: Conversation, title: string) {
        if (historyBusy) throw new Error("正在更新对话，请稍后再试。");
        setHistoryBusy(true);
        try {
            const value = await agentApi.renameConversation(conversation.id, title);
            setConversations(items => items.map(item => item.id === value.id ? value : item));
            if (currentConversation.current === value.id) setView(state => state ? { ...state, snapshot: { ...state.snapshot, conversation: value } } : state);
        } finally { setHistoryBusy(false); }
    }
    async function deleteConversation(conversation: Conversation) {
        if (historyBusy || working || fileBusy) return;
        const accepted = await confirm({ title: "永久删除这段对话？", confirmLabel: "永久删除", description: <><p>将删除「{conversation.title}」的聊天内容、执行记录、导出授权，以及本对话导入的文件、生成文件和应用内版本副本。删除后无法从应用恢复。</p><p>独立保存的职业档案和简历草稿会保留；你已下载、复制到其他位置的文件及外部备份不会随之删除。</p><p>只是暂时不想看到？可以取消后选择“归档对话”。</p></> });
        if (!accepted || historyBusy || working || fileBusy) return;
        setHistoryBusy(true); deletingConversation.current = conversation.id;
        try {
            await agentApi.deleteConversation(conversation.id);
            deletedConversations.current.add(conversation.id);
            setConversations(items => items.filter(item => item.id !== conversation.id));
            if (currentConversation.current === conversation.id) chooseConversation(null);
            setNotice("对话及其资料、成果已永久删除。独立保存的职业档案和简历草稿未删除。");
        } catch (error) { setNotice((error as Error).message); }
        finally { deletingConversation.current = null; setHistoryBusy(false); }
    }
    async function upload(items: FileList | null) {
        if (!items?.length) return;
        if (busy) {
            setNotice("请等当前任务结束后再导入资料。");
            return;
        }
        setFileBusy(true);
        setNotice("");
        try {
            if (items.length > 5) throw new Error("每次最多导入 5 个文件。");
            const cid = await ensureConversation();
            for (const file of Array.from(items)) {
                if (file.size > 1024 * 1024)
                    throw new Error("每份资料不能超过 1 MB。");
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                        resolve(String(reader.result).split(",")[1] ?? "");
                    reader.onerror = () =>
                        reject(new Error("读取选取文件失败。"));
                    reader.readAsDataURL(file);
                });
                await agentApi.upload(cid, file.name, base64);
            }
            const next = await agentApi.snapshot(cid);
            if (currentConversation.current !== cid) return;
            setView(initialView(next));
            setNotice("资料已导入当前对话。你可以告诉穗奈怎样处理。");
        } catch (error) {
            setNotice((error as Error).message);
        } finally {
            setFileBusy(false);
            if (fileInput.current) fileInput.current.value = "";
        }
    }
    async function decide(approval: AgentApproval, approved: boolean) {
        setNotice("");
        try {
            const value = await agentApi.decide(approval.id, approved);
            if (value.status === "expired")
                setNotice("确认已过期，文件没有导出。");
        } catch (error) {
            setNotice((error as Error).message);
        }
    }
    async function exportFile(file: AgentFile) {
        setFileBusy(true);
        setNotice("");
        try {
            const approval = await agentApi.export(file.id);
            const accepted = await confirm({
                title: "下载这个文件？", confirmLabel: "确认下载",
                description: <><p>即将下载 <strong>{file.name}</strong> 的 <strong>v{file.version}</strong> 版本。</p><p>浏览器将按你的下载设置保存文件。取消不会删除对话或文件。</p></>,
            });
            const value = await agentApi.decide(approval.id, accepted);
            if (value.status === "approved") {
                await agentApi.download(file, value.id);
                setNotice("下载已发起，请检查浏览器保存位置。");
            }
        } catch (error) {
            setNotice((error as Error).message);
        } finally {
            setFileBusy(false);
        }
    }
    function previewFile(file: AgentFile) {
        setJobDetailId(null); setExecution(null); setPreview(file); setInspectorOpen(true);
        if (workbenchStatus === "open") setWorkbenchStatus("minimized");
    }
    function showExecution(runId: string, recordKey?: string) {
        setJobDetailId(null); setPreview(null); setExecution(previous => ({ runId, recordKey, selectionId: (previous?.selectionId ?? 0) + 1 }));
        setInspectorOpen(true);
        if (workbenchStatus === "open") setWorkbenchStatus("minimized");
    }
    function closeDetail() {
        setPreview(null); setExecution(null); setJobDetailId(null);
        if (window.innerWidth <= 1180) setInspectorOpen(false);
        composer.current?.focus({ preventScroll: true });
    }
    async function openLocalFile(file: AgentFile, action: "open" | "reveal") {
        if (fileBusy) return;
        const owner = currentConversation.current;
        setFileBusy(true); setNotice("");
        try {
            const result = await agentApi.openLocal(file.id, action);
            if (mounted.current && currentConversation.current === owner) setNotice(result.message);
        } catch (error) {
            if (mounted.current && currentConversation.current === owner) setNotice((error as Error).message);
        } finally { if (mounted.current) setFileBusy(false); }
    }
    function fillPrompt(value: string) { editText(value); if (workbenchStatus === "open") setWorkbenchStatus("minimized"); requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }
    function newConversation() { chooseConversation(null); setView(null); setShowArchived(false); requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }
    function toggleMotion() { const next = !motion; setMotion(next); localStorage.setItem("career.motion", next ? "1" : "0"); }
    async function logout() {
        if (!await confirm({ title: "退出当前账号？", confirmLabel: "确认退出", description: <><p>退出将停止该账号未完成的任务，并清除临时密钥。</p><p>已保存的对话与成果仍会保留。</p></> })) return;
        try { await agentApi.logout(); onLogout(); } catch (error) { setNotice((error as Error).message); }
    }
    const action =
        run?.status === "awaiting_approval"
            ? "A22"
            : busy
              ? "A22"
              : text
                ? "A03"
                : "A02";
    return (
        <FileActionProvider scope={conversationId} local={Boolean(info?.local_file_actions)} busy={fileBusy} preview={previewFile} download={file => void exportFile(file)} open={(file, action) => void openLocalFile(file, action)}>
        <main className="agent-app career-workspace career-desktop-shell" data-ui-motion={uiMotion ? "on" : "off"} data-inspector-open={inspectorOpen} data-detail-open={Boolean(preview || executionRun || jobDetailId)}>
            <header className="agent-top career-masthead">
                <div className="career-masthead__identity"><CareerIcon name="history" size={34} /><div><div className="career-masthead__title"><h1>穗奈的陪伴桌面</h1><span className="career-presence" data-connected={Boolean(info && connected)}><i />{info && connected ? "服务已连接" : "正在连接"}</span></div><p>聊聊现在，一起找到下一步</p></div></div>
                <div className="career-night-note" aria-hidden="true"><span>☾</span><p>慢一点也没关系，<br />我们一直在向前。</p></div>
                <div className="career-masthead__actions">
                    <UiMotionToggle />
                    <button className="agent-icon-button" type="button" title="模型设置" aria-label="模型设置" onClick={() => setSettings(true)}><CareerIcon name="settings" size={23} /></button>
                    <button className="agent-icon-button career-mobile-workbench" type="button" title="打开职业工作台" aria-label="打开职业工作台" aria-expanded={workbenchStatus === "open"} aria-controls="career-workbench-window" onClick={() => { setResumeOpen(false); setWorkbenchStatus("open"); }}><CareerIcon name="folder" size={23} /></button>
                    <button className="agent-icon-button" type="button" title={inspectorOpen ? "收起穗奈小窗" : "打开穗奈小窗"} aria-label={inspectorOpen ? "收起穗奈小窗" : "打开穗奈小窗"} aria-expanded={inspectorOpen} aria-controls="career-context" onClick={() => { if (preview || execution || jobDetailId) { setPreview(null); setExecution(null); setJobDetailId(null); } setInspectorOpen(value => !value); }}><AgentIcon name="panel" size={20} /></button>
                </div>
            </header>
            <div className="agent-layout">
                <aside className="agent-sidebar">
                    <div className="career-brand"><CareerIcon name="sprout" size={48} /><div><strong>青穗集</strong><p>更清晰的你<br />更喜欢的生活</p></div><span className="career-brand__spark" aria-hidden="true">✧</span></div>
                    <nav className="career-desktop-apps" aria-label="桌面应用"><button id="career-workbench-launcher" type="button" aria-label="打开职业工作台" aria-expanded={workbenchStatus === "open"} aria-controls="career-workbench-window" onClick={() => { setResumeOpen(false); setWorkbenchStatus("open"); }}><CareerIcon name="folder" size={29} /><span>职业工作台<small>档案 · 岗位 · 成长行动</small></span>{pendingCareerCount ? <span className="career-app-badge" aria-label={pendingCareerCount + "份待确认建议"}>{pendingCareerCount}</span> : <span aria-hidden="true">↗</span>}</button></nav>
                    <button className="btn btn--primary agent-new" disabled={working || fileBusy || historyBusy} type="button" onClick={newConversation}><CareerIcon name="newChat" size={23} /><span>新建对话</span><span className="career-new-plus" aria-hidden="true">＋</span></button>
                    <ConversationHistory conversations={conversations} selectedId={conversationId} disabled={working || fileBusy || historyBusy} activeId={busy ? conversationId : null} archived={showArchived} onArchived={setShowArchived} onChoose={chooseConversation} onRename={setRenaming} onArchive={conversation => void archiveConversation(conversation)} onDelete={conversation => void deleteConversation(conversation)} />
                    <div className="career-sidebar-bottom">
                        <div className="career-sidebar-scene" aria-hidden="true"><span>在成长的路上，<br />你并不孤单。</span><AsciiArt variant="cat" className="ascii-sidebar-cat" /><i>✦</i></div>
                        <div className="career-account"><span className="career-account__mark"><CareerIcon name="seedling" size={25} /></span><div><strong>{user.username}</strong><small>本机工作区</small></div><button className="agent-icon-button" type="button" aria-label="退出本地账号" title="退出本地账号" onClick={() => void logout()}><AgentIcon name="exit" size={17} /></button></div>
                        <button className="career-sidebar-setting" type="button" onClick={() => setSettings(true)}><CareerIcon name="settings" size={21} />模型与连接设置<span>↗</span></button>
                        <p className="career-privacy">资料保存在本机。调用外部模型时，相关内容仍会发送给所选服务。</p>
                    </div>
                </aside>
                <section className="agent-chat" id="suinai-chat" aria-label="穗奈对话工作区">
                    <div className="desktop-titlebar career-chat-titlebar">
                        <span className="career-chat-title"><CareerIcon name="history" size={21} /><span>{snapshot?.conversation.title ?? "穗奈消息"}</span></span>
                        <div className="career-chat-titlebar__actions">
                            <button className="career-chat-connection" type="button" data-ready={Boolean(profile?.capabilities.chat && profile.has_key)} aria-label={profile?.has_key ? profile.capabilities.chat ? "模型已连接" : "模型连接待测试" : "连接模型"} title={profile?.has_key ? profile.capabilities.chat ? "模型已连接" : "模型连接待测试" : "连接模型"} onClick={() => setSettings(true)}><i /></button>
                            {run && <ExecutionToggle open={Boolean(executionRun)} active={busy} onClick={() => executionRun ? closeDetail() : showExecution(run.id)} />}
                            {snapshot?.conversation && <ConversationActions conversation={snapshot.conversation} disabled={historyBusy || working || fileBusy} active={busy} onRename={setRenaming} onArchive={conversation => void archiveConversation(conversation)} onDelete={conversation => void deleteConversation(conversation)} />}
                            {snapshot?.conversation.archived && <button className="agent-link" type="button" onClick={() => void archiveConversation(snapshot.conversation)}>恢复对话</button>}
                        </div>
                    </div>
                    <div className="agent-conversation-strip career-mobile-conversations">
                        <select className="agent-mobile-history" disabled={working || fileBusy || historyBusy} aria-label="选择历史对话" value={conversationId ?? ""} onChange={event => chooseConversation(event.target.value || null)}>
                            <option value="">＋ 新的对话</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.archived ? "[归档] " : ""}{item.title}</option>)}
                        </select>
                    </div>
                    {resumeActive && !resumeBarDismissed && <ResumeConversationBar state={resumeWorkspace.state} busy={busy || working} onPreview={openResumePreview} onDemo={() => setResumeDemo(true)} onHide={() => setResumeBarDismissed(true)} />}
                    {!connected ? (
                        <div className="agent-connection" role="status">
                            进度连接中断；不会把它当作任务完成。
                            <button
                                type="button"
                                onClick={() =>
                                    setReconnect((value) => value + 1)
                                }
                            >
                                重新连接
                            </button>
                        </div>
                    ) : null}
                    <div className="agent-messages" aria-live="polite"><div className="agent-message-flow" ref={messageFlow}>
                        {resumeDemo ? <ResumeConversationDemo onClose={() => setResumeDemo(false)} /> : <>
                        {conversationId && !snapshot && <div className="conversation-loading" role="status" aria-label="加载对话"><i /><i /><i /></div>}
                        {(!conversationId || snapshot) && !snapshot?.messages.length && !drafts.length ? (
                            <CareerWelcome onPrompt={fillPrompt} connected={Boolean(profile?.capabilities.chat && profile.has_key)} onConnect={() => setSettings(true)} />
                        ) : null}
                        {displayMessages.map((message) => (
                            <Fragment key={message.id}>
                            {message.role === "assistant" && message.run_id && lastReply.get(message.run_id) === message.id && !isActive(runsById.get(message.run_id)) && <RunActivity run={runsById.get(message.run_id)} records={recordsByRun.get(message.run_id) ?? []} drafting={message.run_id === run?.id && drafts.length > 0} onOpen={showExecution} />}
                            <article
                                className={
                                    "agent-message agent-message--" +
                                    message.role + (message.streaming ? " agent-message--draft" : "") + (editingMessage?.id === message.id ? " agent-message--editing" : "")
                                }
                                data-entering={arrivingMessages.has(message.id) || undefined}
                                aria-busy={message.streaming || undefined}
                            >
                                {message.role === "assistant" ? <img className="agent-message-avatar" src={SUINAI_AVATAR_URL} alt="穗奈" width={36} height={36} /> : null}
                                <header>
                                    {message.role === "user" ? "你" : "穗奈"}
                                    <small>
                                        {message.streaming ? "正在回复" : new Date(
                                            message.created_at,
                                        ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </small>
                                </header>
                                {editingMessage?.id === message.id ? <MessageEditor key={message.id} content={message.content} disabled={working || busy || fileBusy} onCancel={() => setEditingMessage(null)} onSend={value => void submitMessage(value, message.id)} /> : message.role === "assistant" ? <StreamingContent content={message.content} streaming={Boolean(message.streaming)} files={files} runId={message.run_id} /> : <MessageContent content={message.content} />}
                                {!message.streaming && editingMessage?.id !== message.id && <MessageActions content={message.content} disabled={working || busy || fileBusy || Boolean(snapshot?.conversation.archived)} onEdit={message.role === "user" ? () => setEditingMessage(message) : undefined} onError={setNotice} />}
                                {message.role === "assistant" && <MessageFileLinks files={deliveries.get(message.id) ?? []} />}
                            </article>
                            {message.role === "assistant" && message.run_id && lastReply.get(message.run_id) === message.id && renderJobCards(message.run_id)}
                            {message.role === "user" && message.run_id && !lastReply.has(message.run_id) && renderJobCards(message.run_id)}
                            {message.role === "user" && message.run_id && !lastReply.has(message.run_id) && !isActive(runsById.get(message.run_id)) && <RunActivity run={runsById.get(message.run_id)} records={recordsByRun.get(message.run_id) ?? []} onOpen={showExecution} />}
                            </Fragment>
                        ))}
                        <MessageFileLinks files={unassignedFiles} />
                        {careerState?.proposals.filter(proposal => proposal.conversation_id === conversationId).map(proposal => <ProfileUpdateStrip key={proposal.id} proposal={proposal} state={careerState} saving={careerWorkspace.saving} disabled={cardDisabled} onChange={careerWorkspace.change} onPrompt={fillPrompt} />)}
                        {careerWorkspace.error && <p className="agent-error" role="alert">{careerWorkspace.error}<button type="button" className="component-text-button" onClick={() => void careerWorkspace.refresh()}>刷新资料</button></p>}
                        {run && busy && <RunActivity key={run.id} run={run} records={recordsByRun.get(run.id) ?? []} drafting={drafts.length > 0} onOpen={showExecution} />}
                        {working && !busy && (changingTask ? <p className="guided-task-saving" role="status">正在保存任务选择…</p> : <RunActivity records={[]} submitting onOpen={showExecution} />)}
                        {pendingApprovals.map((approval) => {
                            const file = files.find(
                                (item) => item.id === approval.artifact_id,
                            );
                            return (
                                <section
                                    className="agent-approval"
                                    key={approval.id}
                                >
                                    <strong>导出前，想请你确认一下</strong>
                                    <p>
                                        {file
                                            ? file.name + " · v" + file.version
                                            : "指定成果版本"}
                                        。允许后只准备这个版本的下载，不授予其他本机文件权限。
                                    </p>
                                    <div>
                                        <button
                                            className="btn btn--primary"
                                            type="button"
                                            onClick={() =>
                                                void decide(approval, true)
                                            }
                                        >
                                            允许导出此版本
                                        </button>
                                        <button
                                            className="btn btn--outline"
                                            type="button"
                                            onClick={() =>
                                                void decide(approval, false)
                                            }
                                        >
                                            不导出
                                        </button>
                                    </div>
                                </section>
                            );
                        })}
                        {run?.error && <RunFailure run={run} disabled={working || busy || fileBusy || Boolean(snapshot?.conversation.archived)} onRetry={() => void retryReply()} onDetails={() => showExecution(run.id)} />}
                        {resumeActive && resumeWorkspace.state?.pending && !busy && !working && <aside className="resume-recovery" role="status"><span>这次整理还在等待补充或重试。你可以直接继续回答，不需要重新填资料。</span><button className="resume-link" type="button" disabled={resumeWorkspace.saving} onClick={() => fillPrompt("我们接着刚才的简历整理，请从已经记录的材料继续；如果缺信息，一次只问我一个问题。")}>继续和穗奈聊</button><button className="resume-link" type="button" disabled={resumeWorkspace.saving} onClick={() => void resumeWorkspace.apply({ type: "task.cancel" })}>结束本次整理</button></aside>}
                        {resumeActive && resumeWorkspace.state && <ResumeCheckpoint state={resumeWorkspace.state} disabled={busy || working || resumeWorkspace.saving || Boolean(resumeWorkspace.state.pending) || Boolean(snapshot?.conversation.archived)} apply={resumeWorkspace.apply} onContinue={continueResumeConversation} onCorrect={fillPrompt} onPreview={openResumePreview} />}
                        {resumeActive && resumeWorkspace.error && <p className="agent-error" role="alert">{resumeWorkspace.error}<button type="button" className="resume-link" onClick={() => void resumeWorkspace.refresh()}>重新读取草稿</button></p>}
                        </>}
                    </div></div>
                    {notice ? (
                        <div className="agent-notice" role="status">
                            <span>{notice}</span>
                            <button
                                type="button"
                                aria-label="关闭提示"
                                onClick={() => setNotice("")}
                            >
                                ×
                            </button>
                        </div>
                    ) : null}
                    {!snapshot?.conversation.archived && <GuidedTaskBar guidance={guidance} disabled={busy || working || fileBusy || historyBusy} onChange={kind => void selectTask(kind)} />}
                    {bubble && !inspectorOpen && <SuinaiBubble {...bubble} compact disabled={busy || working || fileBusy} onAccept={acceptBubble} onDismiss={dismissBubble} />}
                    {resumeActive && !resumeDemo && !busy && !working && messages.filter(message => message.role === "user").length === 0 && <div className="resume-conversation-starters" aria-label="不知道怎么开始时"><span>从最像你的情况开始</span>{["我还是学生，没什么经历", "我已经工作，想换个机会", "我有旧简历，想一起改改"].map(value => <button type="button" key={value} onClick={() => fillPrompt(value)}>{value}</button>)}</div>}
                    {!resumeDemo && <ChatComposer environment={info?.sandbox} key={conversationId ?? "draft"} text={text} onText={editText} composer={composer} fileInput={fileInput} onSubmit={event => void send(event)} onUpload={items => void upload(items)} onCancel={() => { if (run) void agentApi.cancel(run.id).catch(error => setNotice(error.message)); }} onModelSettings={() => setSettings(true)} busy={busy} working={working || Boolean(conversationId && !snapshot)} fileBusy={fileBusy} waiting={run?.status === "waiting_input"} archived={Boolean(snapshot?.conversation.archived)} profiles={profiles} selected={selected} onSelect={value => { setSelected(value); remember(value); }} permission={permission} onPermission={setPermission} effort={effort} onEffort={setEffort} />}

                </section>

                {(preview || executionRun || jobDetailId) && <button className="workspace-detail-backdrop" type="button" aria-label={jobDetailId ? "收起岗位详情" : preview ? "收起文件预览" : "收起执行记录"} onClick={closeDetail} />}
                {jobDetailId ? <JobDetailPanel id={jobDetailId} state={careerState} saving={careerWorkspace.saving} disabled={cardDisabled} onSave={saveJob} onClose={closeDetail} onPrompt={fillPrompt} /> : preview ? <FilePreviewPanel file={preview} files={files} local={Boolean(info?.local_file_actions)} busy={fileBusy} onSelect={previewFile} onClose={closeDetail} onDownload={file => void exportFile(file)} onOpen={(file, action) => void openLocalFile(file, action)} /> : executionRun ? <ExecutionPanel run={executionRun} runs={snapshot?.runs ?? []} messages={snapshot?.messages ?? []} records={records} events={view?.events ?? []} selectedKey={execution?.recordKey} selectionId={execution?.selectionId} files={files} onSelect={showExecution} onClose={closeDetail} onPreview={previewFile} /> : <aside className="agent-inspector" id="career-context" aria-label="穗奈陪伴与资料">
                    <section className="agent-companion-card">
                        <div className="career-companion-heading"><h2><CareerIcon name="heart" size={20} />穗奈的小窗</h2><span className="career-presence" data-connected="true"><i />{busy ? "陪你处理中" : "待机中"}</span><button className="agent-icon-button" type="button" title={motion ? "暂停动画" : "播放动画"} aria-label={motion ? "暂停动画" : "播放动画"} onClick={toggleMotion}><AgentIcon name={motion ? "pause" : "play"} size={15} /></button><ComposerMenu className="companion-settings" panelClassName="companion-settings-panel" label="陪伴互动设置" title="陪伴互动设置" trigger={<AgentIcon name="more" size={16} />} disabled={false} align="end">{() => <><strong>穗奈的陪伴方式</strong><label><input type="checkbox" checked={smartSuggestions} onChange={event => setCompanionPreference("smartSuggestions", event.target.checked)} />意图建议与会话小结</label><p>基于已发送消息，回复结束后最多额外调用一次所选模型，可能产生少量用量；猜测不自动启动任务，不发送输入框草稿。</p><label><input type="checkbox" checked={idleChat} onChange={event => setCompanionPreference("idleChat", event.target.checked)} />闲置时轻轻打个招呼</label><p>页面可见且约两分钟未操作时提醒；输入、执行中不打扰，十分钟内不重复，每次打开页面最多两次。不额外调用模型，不写入聊天记录。</p></>}</ComposerMenu></div>
                        <div className="agent-character">
                            <SuinaiMotionCharacter
                                action={action}
                                view="full"
                                playing={motion && inspectorOpen}
                                autoBlink
                                eyeOpen={1}
                                blinkNonce={0}
                                reducedMotion={reduced}
                                ariaLabel={
                                    busy
                                        ? "穗奈正在陪你处理任务"
                                        : "穗奈在这里等你"
                                }
                            />
                            {bubble && <SuinaiBubble {...bubble} disabled={busy || working || fileBusy} onAccept={acceptBubble} onDismiss={dismissBubble} />}
                        </div>
                        <strong className="career-companion-quote"><span aria-hidden="true">“</span>
                            {run?.status === "awaiting_approval"
                                ? "等你决定，再继续。"
                                : busy
                                  ? "我正在看，进度会告诉你。"
                                  : "不急，我们一步一步来。"}
                        </strong>
                    </section>

                    <GrowthSummary state={careerState} loading={careerWorkspace.loading} error={careerWorkspace.error} onOpen={() => { setResumeOpen(false); setCareerTab("profile"); setWorkbenchStatus("open"); }} onPrompt={fillPrompt}>
                        <details className="growth-conversation-memory"><summary>这段对话的小结</summary><ConversationMemory guidance={guidance} analyzing={insights.analyzing} error={insights.error} enabled={smartSuggestions} canRefresh={insightReady && !busy && !working && ["completed", "waiting_input"].includes(run?.status ?? "") && Boolean(snapshot?.messages.some(message => message.role === "user"))} onRefresh={insights.refresh} /></details>
                    </GrowthSummary>
                    {careerState?.actions.find(action => action.status !== "done") && <NextActionRow action={careerState.actions.find(action => action.status !== "done")!} disabled={cardDisabled} onPrompt={fillPrompt} />}

                    <FileDirectory files={files} />
                </aside>}
            </div>
            <footer className="agent-footer career-desktop-taskbar" aria-label="桌面任务栏">
                <div className="career-desktop-taskbar__apps">
                    <button type="button" className="career-taskbar-app" aria-pressed={workbenchStatus !== "open"} onClick={() => { if (workbenchStatus === "open") minimizeWorkbench(); else composer.current?.focus({ preventScroll: true }); }}><img src={SUINAI_AVATAR_URL} alt="" width={22} height={22} /><span>穗奈对话</span></button>
                    {workbenchStatus !== "closed" && <button type="button" className="career-taskbar-app" aria-pressed={workbenchStatus === "open"} aria-label={workbenchStatus === "open" ? "最小化职业工作台" : "恢复职业工作台"} onClick={() => workbenchStatus === "open" ? minimizeWorkbench() : setWorkbenchStatus("open")}><CareerIcon name="folder" size={22} /><span>{resumeOpen ? "简历与经历" : "职业工作台"}</span>{pendingCareerCount > 0 && <small>{pendingCareerCount}</small>}</button>}
                </div>
                <span className="career-taskbar-status">{busy ? "穗奈正在处理任务…" : "青穗集 · 你的成长桌面"}</span>
            </footer>
            <DesktopWindow open={workbenchStatus === "open"} onClose={closeWorkbench} onMinimize={minimizeWorkbench} title={resumeOpen ? "简历与经历" : "职业工作台"}>
                <CareerWorkbench workspace={careerWorkspace} onJob={id => { minimizeWorkbench(); openJob(id); }} tab={careerTab} onTab={setCareerTab} files={files} hidden={workbenchStatus !== "open"} resumeOpen={resumeOpen} onResumeOpen={setResumeOpen} resume={{ workspace: resumeWorkspace, busy: busy || working || fileBusy || Boolean(snapshot?.conversation.archived), onChat: message => { minimizeWorkbench(); if (message) fillPrompt(message); else composer.current?.focus({ preventScroll: true }); }, onContinue: continueResumeConversation, onExport: exportResume }} onPrompt={fillPrompt} onImport={() => { minimizeWorkbench(); fileInput.current?.click(); }} onPending={setPendingCareerCount} uploadDisabled={busy || working || fileBusy || Boolean(snapshot?.conversation.archived)} />
            </DesktopWindow>
            {settings ? (
                <ModelSettings
                    profiles={profiles}
                    info={info}
                    user={user}
                    selected={selected}
                    onClose={() => setSettings(false)}
                    onSaved={load}
                    onConsent={async (value) => {
                        const result = await agentApi.consent(value);
                        onUser({
                            ...user,
                            external_ai_consent: result.external_ai_consent,
                        });
                    }}
                />
            ) : null}
        </main>
        {renaming && <RenameConversationDialog key={renaming.id} conversation={renaming} onSave={title => renameConversation(renaming, title)} onClose={() => setRenaming(null)} />}
        {confirmationDialog}
        </FileActionProvider>
    );
}
