/** 青穗集 · 新 Agent 工作区：保留穗奈与桌面主题，接通真实模型、连续任务和可检查文件。 */
import {
    Fragment,
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    type FormEvent,
} from "react";
import { Login } from "../components/Login";
import { accountDisplay, canResumeWorkspace } from "./entry-state";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
import { AgentEntry } from "./AgentEntry";
import { SuinaiMotionCharacter } from "../components/SuinaiMotionCharacter";
import { useReducedMotion } from "../character/preferences";
import { tokenStore } from "../api/client";
import { agentApi, streamEvents, AgentApiError } from "./api";
import { ModelSettings } from "./ModelSettings";
import { resolveDeploymentUi } from "./deployment-ui";
import { OnboardingTour } from "./OnboardingTour";
import { useOnboarding } from "./useOnboarding";
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
import { WorkspacePicker } from "./WorkspacePicker";
import { useCareerWorkspace } from "./career-workspace";
import { useLearningWorkspace } from "./learning-workspace";
import { jobsByRun } from "./job-cards";
import { JobRecommendationCard, JobDetailPanel, GrowthSummary, ProfileUpdateStrip, NextActionRow } from "./CareerComponents";
import { ComponentIcon } from "./ComponentAssets";
import { CareerEvidencePanel, DecisionActivity, DecisionFollowUp } from "./CareerEvidence";
import { conversationEvidence } from "./career-evidence";
import { OfficialPoints } from "./OfficialPoints";
import { RemoteConnections } from "./RemoteConnections";
import { DesktopWindow } from "./DesktopWindow";
import { DesktopExit } from "./DesktopExit";
const MemorySea = lazy(() => import("./MemorySea").then(module => ({ default: module.MemorySea })));
import { ResumeCheckpoint } from "./ResumeCheckpoint";
import { ResumeConversationBar } from "./ResumeConversation";
import { useResumeWorkspace } from "./resume-workspace";
import type { CareerTab } from "./career";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import { SUINAI_AVATAR_URL } from "../assets";
import { MessageContent } from "./MessageContent";
import { useMessageEntrance } from "./messageEntrance";
import { MessageActions, MessageEditor } from "./MessageActions";
import { StreamingContent } from "./StreamingContent";
import { FileActionProvider, FileDirectory, FileLink, MessageFileLinks } from "./FileLinks";
import { FilePreviewPanel } from "./FilePreviewPanel";
import { loadTemplateId } from "../state/resumeTemplates";
import type { ResumeEditRequest } from "../../../agent/src/resume-fields";
import { currentResumeDraft } from "./resume-preview";
import { ResumePreviewPanel } from "./ResumePreviewPanel";
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
    type OfficialSession,
    type AgentApproval,
    type PermissionMode,
    type ReasoningEffort,
    type LocalWorkspace,
    type WorkspaceAccess,
} from "./types";
import "./agent.css";
import "./career-theme.css";
import "./file-workspace.css";
import "./resume-live-preview.css";
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
        [epoch, setEpoch] = useState(0),
        [deploymentMode, setDeploymentMode] = useState<"local" | "server">("server"),
        [localEntryBusy, setLocalEntryBusy] = useState(false),
        [localSetup, setLocalSetup] = useState<{ user: AgentUser; info: AgentInfo; profiles: ModelProfile[] } | null>(null);
    useEffect(() => {
        let alive = true;
        setChecking(true);
        void (async () => {
            try {
                const config = await agentApi.authConfig();
                if (alive) setDeploymentMode(config.mode);
                let current: AgentUser | null = null;
                if (tokenStore.get()) {
                    try { current = await agentApi.me(); }
                    catch (error) { if (!(error instanceof AgentApiError) || error.status !== 401) throw error; }
                }
                if (current && config.mode === "local") {
                    const savedProfiles = await agentApi.profiles();
                    if (!canResumeWorkspace(current, savedProfiles, config.mode)) {
                        const info = await agentApi.info();
                        if (alive) setLocalSetup({ user: current, info, profiles: savedProfiles });
                        current = null;
                    }
                }
                if (alive) { setUser(current); setAuthError(""); }
            } catch (error) { if (alive) { setUser(null); setAuthError((error as Error).message); } }
            finally { if (alive) setChecking(false); }
        })();
        return () => {
            alive = false;
        };
    }, [epoch]);
    useEffect(() => {
        const expired = () => {
            setLocalSetup(null);
            setUser(null);
            setEpoch(value => value + 1);
        };
        window.addEventListener("agent:unauthorized", expired);
        return () => window.removeEventListener("agent:unauthorized", expired);
    }, []);
    if (checking)
        return (
            <main className="agent-loading" role="status">
                正在连接青穗集…
            </main>
        );
    if (!user) {
        if (deploymentMode === "server") {
            return (
                <>
                    <Login
                        variant="agent"
                        showModelConsent={false}
                        onSuccess={() => {
                            setAuthError("");
                            setEpoch((value) => value + 1);
                        }}
                    />
                </>
            );
        }
        return (
            <AgentEntry
                busy={localEntryBusy}
                error={authError}
                localContent={localSetup ? <ModelSettings
                    presentation="entry" profiles={localSetup.profiles} info={localSetup.info} user={localSetup.user}
                    selected={preferred()} onClose={() => {}} onConnected={id => { remember(id); setLocalSetup(null); setEpoch(value => value + 1); }}
                    onSaved={async () => { const profiles = await agentApi.profiles(); setLocalSetup(current => current ? { ...current, profiles } : current); }}
                    onConsent={async granted => { const result = await agentApi.consent(granted); setLocalSetup(current => current ? { ...current, user: { ...current.user, external_ai_consent: result.external_ai_consent } } : current); }}
                /> : undefined}
                onOfficialSuccess={() => {
                    setAuthError("");
                    setLocalSetup(null);
                    setEpoch((value) => value + 1);
                }}
                onLocalMode={async () => {
                    if (localEntryBusy || localSetup) return;
                    setLocalEntryBusy(true);
                    setAuthError("");
                    try {
                        const current = await agentApi.bootstrap();
                        const [info, profiles] = await Promise.all([agentApi.info(), agentApi.profiles()]);
                        setLocalSetup({ user: current, info, profiles });
                    } catch (error) {
                        setAuthError((error as Error).message);
                    } finally {
                        setLocalEntryBusy(false);
                    }
                }}
            />
        );
    }
    return (
        <Workspace
            key={user.id}
            user={user}
            deploymentMode={deploymentMode}
            onUser={setUser}
            onLogout={() => {
                tokenStore.clear();
                setLocalSetup(null);
                setUser(null);
                setEpoch(value => value + 1);
            }}
        />
    );
}
function Workspace({
    user,
    deploymentMode,
    onUser,
    onLogout,
}: {
    user: AgentUser;
    deploymentMode: "local" | "server";
    onUser: (user: AgentUser) => void;
    onLogout: () => void;
}) {
    const { confirm, cancel: cancelConfirmation, dialog: confirmationDialog } = usePixelConfirm();
    const [info, setInfo] = useState<AgentInfo | null>(null),
        [profiles, setProfiles] = useState<ModelProfile[]>([]),
        [officialSession, setOfficialSession] = useState<OfficialSession>({ connected: false, account: null }),
        [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([]),
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
        [remoteOpen, setRemoteOpen] = useState(false),
        [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 1180),
        [workbenchStatus, setWorkbenchStatus] = useState<"closed" | "open" | "minimized">("closed"),
        [memoryStatus, setMemoryStatus] = useState<"closed" | "open" | "minimized">("closed"),
        [memoryView, setMemoryView] = useState<import("../../../agent/src/memory-contract").MemorySeaView | null>(null),
        [memoryLoading, setMemoryLoading] = useState(false),
        [memoryError, setMemoryError] = useState(""),
        [careerTab, setCareerTab] = useState<CareerTab>("profile"),
        [resumeOpen, setResumeOpen] = useState(false),
        [resumePreviewOpen, setResumePreviewOpen] = useState(false),
        [pendingCareerCount, setPendingCareerCount] = useState(0),
        [showArchived, setShowArchived] = useState(false),
        [historyBusy, setHistoryBusy] = useState(false),
        [renaming, setRenaming] = useState<Conversation | null>(null),
        [resumeBarDismissed, setResumeBarDismissed] = useState(false),
        [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null),
        [changingTask, setChangingTask] = useState(false),
        [permission, setPermission] = useState<PermissionMode>("default"),
        [effort, setEffort] = useState<ReasoningEffort>("auto"),
        [pendingObligationId, setPendingObligationId] = useState<string | undefined>(undefined),
        [working, setWorking] = useState(false),
        [connected, setConnected] = useState(true),
        [reconnect, setReconnect] = useState(0),
        [jobDetailId, setJobDetailId] = useState<string | null>(null),
        [preview, setPreview] = useState<AgentFile | null>(null),
        [execution, setExecution] = useState<{ runId: string; recordKey?: string; selectionId: number } | null>(null),
        [fileBusy, setFileBusy] = useState(false),
        [pendingAttachments, setPendingAttachments] = useState<AgentFile[]>([]),
        [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({}),
        [workspacePickerOpen, setWorkspacePickerOpen] = useState(false),
        [motion, setMotion] = useState(
            () => localStorage.getItem("career.motion") !== "0",
        );
    const ui = resolveDeploymentUi(info, deploymentMode);
    const cloud = deploymentMode === "server";
    const account = accountDisplay(user, deploymentMode, officialSession);
    function openModelSettings() {
        if (ui.model_connections) setSettings(true);
        else setNotice("官方服务暂时未就绪，请稍后重试。");
    }
    async function ensureModelConsent() {
        if (user.external_ai_consent) return true;
        if (!cloud) { openModelSettings(); return false; }
        const accepted = await confirm({
            title: "让穗奈开始帮你？", confirmLabel: "同意并继续", cancelLabel: "暂不使用",
            description: <p>本次任务所需的对话和选取资料会交由官方模型服务处理。不会读取你的电脑目录。</p>,
        });
        if (!accepted) return false;
        const result = await agentApi.consent(true);
        onUser({ ...user, external_ai_consent: result.external_ai_consent });
        return true;
    }
    async function readyModel(requireTools = false) {
        if (!await ensureModelConsent()) return null;
        let active = profiles.find(item => item.id === selected);
        if (cloud && active?.has_key && (!active.capabilities.tested_at || !active.capabilities.chat || (requireTools && !active.capabilities.tools))) {
            setNotice("正在连接穗奈…");
            active = await agentApi.testProfile(active.id);
            const ready = active;
            setProfiles(values => values.map(item => item.id === ready.id ? ready : item));
        }
        if (!active?.has_key || !active.capabilities.chat || (requireTools && !active.capabilities.tools)) {
            openModelSettings();
            if (!cloud) setNotice("请先连接并测试可用模型。");
            return null;
        }
        setNotice("");
        return active;
    }
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
    function clearAttachmentPreviews() { setAttachmentPreviews(values => { Object.values(values).forEach(url => URL.revokeObjectURL(url)); return {}; }); }
    function chooseConversation(id: string | null) { if (id !== null && currentConversation.current === id) return; currentConversation.current = id; setWorkspacePickerOpen(false); setMemoryStatus("closed"); setEditingMessage(null); setPendingAttachments([]); clearAttachmentPreviews(); pendingRequest.current = null; setPendingObligationId(undefined); setView(null); setRenaming(null); setResumeBarDismissed(false); setResumePreviewOpen(false); setPreview(null); setExecution(null); setJobDetailId(null); cancelConfirmation(); setPermission("default"); setConversationId(id); dispatchDraft({ type: "reset" }); setNotice(""); }
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
    const memoryRequest = useRef(0);
    const loadMemory = useCallback(async () => {
        const requestId = ++memoryRequest.current, cid = conversationId;
        setMemoryLoading(true); setMemoryError("");
        try { const value = await agentApi.memory(cid); if (mounted.current && requestId === memoryRequest.current && currentConversation.current === cid) setMemoryView(value); }
        catch (error) { if (mounted.current && requestId === memoryRequest.current) setMemoryError((error as Error).message); }
        finally { if (mounted.current && requestId === memoryRequest.current) setMemoryLoading(false); }
    }, [conversationId]);
    useEffect(() => { setMemoryView(null); void loadMemory(); }, [loadMemory]);
    useEffect(() => {
        if (memoryStatus !== "open") return;
        const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadMemory(); }, 15000);
        return () => window.clearInterval(timer);
    }, [memoryStatus, loadMemory]);
    function openMemory() { setWorkbenchStatus(status => status === "open" ? "minimized" : status); setMemoryStatus("open"); void loadMemory(); }
    function minimizeMemory() { setMemoryStatus("minimized"); }
    function closeMemory() { setMemoryStatus("closed"); }
    useEffect(() => { if (workbenchStatus === "open") setMemoryStatus(status => status === "open" ? "minimized" : status); }, [workbenchStatus]);
    const load = useCallback(async (id?: string) => {
        const nextInfo = await agentApi.info();
        const actions = resolveDeploymentUi(nextInfo, deploymentMode);
        const [allProfiles, nextOfficialSession, nextConversations, nextWorkspaces] = await Promise.all([
            agentApi.profiles(),
            agentApi.officialSession(),
            agentApi.conversations(),
            actions.local_projects ? agentApi.workspaces() : Promise.resolve([]),
        ]);
        const nextProfiles = actions.model_connections ? allProfiles.filter(profile => profile.mode === "custom" || user.identity === "official") : allProfiles.filter(profile => profile.mode === "official");
        if (!mounted.current) return;
        setInfo(nextInfo);
        setProfiles(nextProfiles);
        setOfficialSession(nextOfficialSession);
        setConversations(nextConversations.filter(item => !deletedConversations.current.has(item.id)));
        setWorkspaces(nextWorkspaces);
        setSelected((current) => {
            const next =
                id ??
                (nextProfiles.some((p) => p.id === current)
                    ? current
                    : (nextProfiles[0]?.id ?? ""));
            remember(next);
            return next;
        });
    }, [deploymentMode, user.identity]);
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
                        if (event.kind === "memory.recalled" || event.kind === "memory.updated") void loadMemory();
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
    const latestAssistantId = displayMessages.filter(message => message.role === "assistant").at(-1)?.id;
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
    const careerPulse = [run?.id, run?.status, ...(view?.events ?? []).filter(event => ["tool.finished","career.updated","career.decision","career.judged","resume.review"].includes(event.kind)).map(event => event.seq)].join(":");
    const learningWorkspace = useLearningWorkspace(user.id, careerPulse);
    const careerWorkspace = useCareerWorkspace(user.id, careerPulse + ":learning:" + (learningWorkspace.state?.revision ?? 0), conversationId);
    const recommendedJobs = useMemo(() => jobsByRun(snapshot?.messages ?? []), [snapshot?.messages]);
    const careerState = careerWorkspace.state;
    const conversationInsights = conversationEvidence(careerState?.insights, conversationId, snapshot?.messages.filter(message => message.role === "user").at(-1)?.created_at);
    const cardDisabled = busy || working || fileBusy || Boolean(snapshot?.conversation.archived);
    function openJob(id: string) { setResumePreviewOpen(false); setPreview(null); setExecution(null); setJobDetailId(id); setInspectorOpen(true); }
    function saveJob(id: string, saved: boolean) { void careerWorkspace.change({ type: "catalogue.save", catalogue_id: id, saved }, saved ? "已收藏岗位。" : "已取消收藏。"); }
    function renderJobCards(runId: string) {
        const items = recommendedJobs.get(runId);
        return items?.length ? <section className="conversation-job-cards" aria-label="本次检索的岗位参考">{items.map(job => <JobRecommendationCard key={job.id} job={careerState?.insights?.jobs.find(item => item.id === job.id) ? { ...job, assessment: careerState.insights.jobs.find(item => item.id === job.id) } : job} saved={Boolean(careerState?.saved_jobs?.some(item => item.catalogue_id === job.id))} saving={careerWorkspace.saving || !careerState} disabled={cardDisabled} onOpen={() => openJob(job.id)} onSave={() => saveJob(job.id, !careerState?.saved_jobs?.some(item => item.catalogue_id === job.id))} onPrompt={fillPrompt} />)}</section> : null;
    }
    const resumeTools = ["read_resume_context", "capture_resume_material", "prepare_resume_step", "propose_resume_update"];
    const guidance = snapshot?.guidance;
    const task = activeTask(guidance);
    const resumeActive = Boolean(task?.kind === "resume" || (!guidance?.tasks.length && (snapshot?.conversation.mode === "resume"
        || snapshot?.messages.some(message => message.tool_calls?.some(call => resumeTools.includes(call.name)))
        || view?.events.some(event => event.kind === "tool.started" && resumeTools.includes(String((event.data.call as { name?: string } | undefined)?.name))))));
    const resumeWorkspace = useResumeWorkspace(user.id, careerPulse + ":" + conversationId + ":" + guidance?.revision, resumeActive || resumeOpen || resumePreviewOpen, conversationId, snapshot?.resume);
    const liveResumeDraft = currentResumeDraft(view?.events ?? [], run, resumeWorkspace.state);
    useEffect(() => {
        if (!liveResumeDraft?.request_id) return;
        setResumePreviewOpen(true); setInspectorOpen(true);
    }, [liveResumeDraft?.request_id]);
    const previousResumeActive = useRef(false);
    useEffect(() => {
        if (resumeActive && !previousResumeActive.current) {
            setResumePreviewOpen(true);
            setInspectorOpen(true);
        }
        previousResumeActive.current = resumeActive;
    }, [resumeActive]);
    const onboarding = useOnboarding({ userId: user.id, mode: deploymentMode, ready: Boolean(info), blocked: busy || working || fileBusy || settings || remoteOpen || workspacePickerOpen || Boolean(renaming) || workbenchStatus === "open" || memoryStatus === "open" || Boolean(preview || executionRun || jobDetailId || resumePreviewOpen), hasDraft: Boolean(text.trim()) });
    useEffect(() => { if (onboarding.error) setNotice(onboarding.error); }, [onboarding.error]);
    const insightReady = Boolean(user.external_ai_consent && profile?.has_key && profile.capabilities.chat);
    function updateGuidance(cid: string, value: GuidanceView) {
        if (currentConversation.current !== cid) return;
        setView(state => state && state.snapshot.conversation.id === cid ? { ...state, snapshot: { ...state.snapshot, guidance: acceptGuidance(state.snapshot.guidance, value) } } : state);
    }
    const insights = useConversationInsights({ conversationId, snapshot, profileId: selected, enabled: smartSuggestions && insightReady, blocked: busy || working || fileBusy || Boolean(snapshot?.conversation.archived) || settings || Boolean(onboarding.active), onUpdate: updateGuidance });
    const companionHidden = Boolean(onboarding.active) || Boolean(snapshot?.conversation.archived) || busy || working || fileBusy || settings || resumePreviewOpen || Boolean(preview || executionRun) || workbenchStatus === "open" || memoryStatus === "open";
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
    async function selectTask(kind: TaskKind | null): Promise<boolean> {
        if (busy || working || fileBusy || snapshot?.conversation.archived || task?.kind === kind || (!task && kind === null)) return false;
        setChangingTask(true); setWorking(true); setNotice("");
        try {
            const cid = await ensureConversation();
            const latest = await agentApi.snapshot(cid);
            let value: GuidanceView;
            try { value = await agentApi.changeTask(cid, latest.guidance?.revision ?? 0, kind); }
            catch (cause) {
                if (!(cause instanceof AgentApiError) || cause.code !== "resume_reuse_required") throw cause;
                const accepted = await confirm({ title: "继续使用已有简历草稿？", confirmLabel: "复用并继续", cancelLabel: "先不切换", description: <><p>当前账号的简历草稿是共享的，不是每段对话各有一份。</p><p>继续会在这段对话里使用已有经历和草稿；不会清空内容，也不会创建另一份独立简历。后续修改会更新共享草稿。</p></> });
                if (!accepted) return false;
                value = await agentApi.changeTask(cid, latest.guidance?.revision ?? 0, kind, true);
            }
            if (currentConversation.current !== cid) return false;
            setView(state => { const base = state?.snapshot.conversation.id === cid ? state : initialView(latest); return { ...base, snapshot: { ...base.snapshot, guidance: acceptGuidance(base.snapshot.guidance, value) } }; });
            idle.dismiss();
            dispatchDraft({ type: "task", kind });
            // 切换结果由任务按钮选中态与输入草稿表达，不额外占用横幅；异常仍在 catch 中提示。
            requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
            return true;
        } catch (cause) { setNotice((cause as Error).message); return false; }
        finally { setChangingTask(false); setWorking(false); }
    }
    async function openResumeChat(message?: string) {
        if (!message) { minimizeWorkbench(); return; }
        const ready = task?.kind === "resume" || await selectTask("resume");
        if (ready) { minimizeWorkbench(); fillPrompt(message); }
    }
    function openResumePreview() { setResumePreviewOpen(true); setPreview(null); setExecution(null); setJobDetailId(null); setInspectorOpen(true); if (workbenchStatus === "open") setWorkbenchStatus("minimized"); }
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
    async function openWorkspace() {
        setWorkspacePickerOpen(true);
        try { setWorkspaces(await agentApi.workspaces()); }
        catch (error) { setNotice((error as Error).message); }
    }
    async function pickWorkspace() {
        if (working || busy || fileBusy) return;
        // 原生目录选择器属于 Agent 进程，不属于网页层；先收起网页面板，避免它挡住系统窗口。
        setWorkspacePickerOpen(false);
        setFileBusy(true); setNotice("");
        try {
            const result = await agentApi.pickWorkspace();
            if (result.cancelled || !result.workspace) { setWorkspacePickerOpen(true); return; }
            setWorkspaces(values => [result.workspace!, ...values.filter(item => item.id !== result.workspace!.id)]);
            const cid = await ensureConversation();
            const value = await agentApi.bindWorkspace(cid, result.workspace.id, "read-only");
            setConversations(values => values.map(item => item.id === value.id ? value : item));
            setView(state => state && state.snapshot.conversation.id === value.id ? { ...state, snapshot: { ...state.snapshot, conversation: value } } : state);
            setNotice("项目已绑定为只读工作区；穗奈会实时读取项目中的必要文件。");
        } catch (error) { setWorkspacePickerOpen(true); setNotice((error as Error).message); }
        finally { setFileBusy(false); }
    }
    async function bindWorkspace(workspaceId: string, access: WorkspaceAccess) {
        if (working || busy || fileBusy) return;
        if (access === "workspace-write" && !await confirm({ title: "允许穗奈修改这个项目？", confirmLabel: "允许修改", description: <><p>只会把当前绑定的项目目录加入受限写入范围，命令仍通过当前沙箱执行。</p><p>穗奈可能创建、修改或删除项目文件。重要删除、覆盖和安装操作仍需在对话中再次确认。</p></> })) return;
        setFileBusy(true); setNotice("");
        try {
            const cid = await ensureConversation();
            const value = await agentApi.bindWorkspace(cid, workspaceId, access);
            setConversations(values => values.map(item => item.id === value.id ? value : item));
            setView(state => state && state.snapshot.conversation.id === value.id ? { ...state, snapshot: { ...state.snapshot, conversation: value } } : state);
            setWorkspacePickerOpen(false);
            setNotice(access === "workspace-write" ? "项目可写权限已开启，仅对当前对话生效。" : "项目已切换为只读分析。" );
        } catch (error) { setNotice((error as Error).message); }
        finally { setFileBusy(false); }
    }
    async function unbindWorkspace() {
        if (!conversationId || working || busy || fileBusy) return;
        setFileBusy(true);
        try {
            const value = await agentApi.bindWorkspace(conversationId, null);
            setConversations(values => values.map(item => item.id === value.id ? value : item));
            setView(state => state && state.snapshot.conversation.id === value.id ? { ...state, snapshot: { ...state.snapshot, conversation: value } } : state);
            setWorkspacePickerOpen(false);
            setNotice("已解除工作区绑定；项目原目录没有被删除或复制。");
        } catch (error) { setNotice((error as Error).message); }
        finally { setFileBusy(false); }
    }
    async function deleteWorkspace(value: LocalWorkspace) {
        if (working || busy || fileBusy) return;
        try {
            if (!await confirm({ title: "从列表移除这个工作区？", confirmLabel: "移除登记", description: <p>只会移除青穗集的登记记录，不会删除项目文件。</p> })) return;
            await agentApi.deleteWorkspace(value.id);
            setWorkspaces(items => items.filter(item => item.id !== value.id));
        } catch (error) { setNotice((error as Error).message); }
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
            setView(state => state && state.snapshot.last_seq > next.last_seq ? state : initialView(next));
        } catch (error) { setNotice((error as Error).message); }
        finally { setWorking(false); }
    }
    async function send(event?: FormEvent) {
        event?.preventDefault();
        await submitMessage(text);
    }
    async function submitMessage(value: string, replacesMessageId?: string) {
        if (working || busy || fileBusy || snapshot?.conversation.archived || (!value.trim() && !pendingAttachments.length)) return;
        setWorking(true);
        setNotice("");
        try {
            const activeProfile = await readyModel();
            if (!activeProfile) return;
            const cid = await ensureConversation();
            const editedAttachments = replacesMessageId
                ? (snapshot?.messages.find(message => message.id === replacesMessageId)?.attachments ?? []).map(attachment => attachment.artifact_id)
                : [];
            const attachmentIds = [...new Set([...editedAttachments, ...pendingAttachments.map(file => file.id)])].sort();
            const input = value.trim() || "请查看我附加的图片并回答。";
            const key = [cid, selected, input, permission, effort, replacesMessageId ?? "", pendingObligationId ?? "", attachmentIds.join(",")].join("|");
            if (pendingRequest.current?.key !== key)
                pendingRequest.current = { key, id: crypto.randomUUID() };
            await agentApi.send(
                cid,
                activeProfile.id,
                input,
                pendingRequest.current.id,
                { ...(replacesMessageId ? { replaces_message_id: replacesMessageId } : {}), ...(pendingObligationId ? { obligation_id: pendingObligationId } : {}), ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}), permission_mode: ui.host_permissions ? permission : "default", reasoning_effort: effort, full_access_confirmed: ui.host_permissions && permission === "full-access" },
            );
            if (currentConversation.current !== cid) return;
            pendingRequest.current = null;
            setPendingAttachments([]);
            clearAttachmentPreviews();
            setPendingObligationId(undefined);
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
    async function runResumeTask(input: string, resumeEdit?: ResumeEditRequest) {
        if (working || busy || fileBusy) throw new Error("当前对话还有任务运行，请结束后重试。");
        if (snapshot?.conversation.archived) throw new Error("当前对话已归档，请先恢复或创建新的对话。");
        setWorking(true);
        try {
            const activeProfile = await readyModel(true);
            if (!activeProfile) return;
            const cid = await ensureConversation();
            await agentApi.send(cid, activeProfile.id, input, crypto.randomUUID(), { ...(resumeEdit ? { resume_edit: resumeEdit } : {}), permission_mode: "default", reasoning_effort: effort, full_access_confirmed: false });
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
            return (await agentApi.exportResume(revision, cid, loadTemplateId())).artifacts;
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
    async function upload(items: FileList | File[] | null) {
        if (!items?.length) return;
        if (busy) {
            setNotice("请等当前任务结束后再导入资料。");
            return;
        }
        setFileBusy(true);
        setNotice("");
        try {
            const selectedFiles = Array.from(items);
            const relativePath = (file: File) => String((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, "/");
            const isProject = selectedFiles.some(file => relativePath(file).includes("/"));
            const supported = new Set((info?.file_workspace.supported_extensions ?? ["pdf", "docx", "txt", "md", "csv", "json", "yaml", "yml", "log", "ts", "tsx", "js", "jsx", "mjs", "cjs", "java", "py", "go", "rs", "cs", "c", "h", "cpp", "hpp", "kt", "kts", "dart", "php", "rb", "swift", "proto", "csproj", "vue", "svelte", "html", "css", "scss", "sass", "less", "sql", "sh", "ps1", "xml", "gradle", "properties", "toml", "ini", "conf", "graphql", "gql", "png", "jpg", "jpeg", "gif", "webp"]).map(value => value.toLowerCase()));
            const secret = /(^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|jks|keystore))$/i;
            const ignoredDirectory = /(^|\/)(?:node_modules|\.git|dist|build|coverage|\.next|target|out|vendor)(\/|$)/i;
            const accepted = selectedFiles.filter(file => {
                const name = relativePath(file);
                const leaf = name.split("/").at(-1)?.toLowerCase() ?? "";
                const ext = leaf.includes(".") ? leaf.slice(leaf.lastIndexOf(".") + 1) : "";
                const image = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
                const extensionless = ["readme", "license", "dockerfile", ".gitignore", ".dockerignore"].includes(leaf);
                return !ignoredDirectory.test(name) && !secret.test(name) && (supported.has(ext) || extensionless) && (!isProject || !image);
            });
            if (!accepted.length) throw new Error(isProject ? "没有找到可分析的源码或项目文档；密钥文件、依赖目录和构建产物已自动跳过。" : "没有找到支持的文件类型。");
            if (accepted.length > (isProject ? 200 : 5)) throw new Error(isProject ? "过滤掉依赖和构建产物后，仍有超过 200 个项目文件；请先选择更小的项目子目录。" : "每次最多导入 5 个文件。");
            const cid = await ensureConversation();
            let imported = 0;
            const imageAttachments: AgentFile[] = [];
            const imagePreviewUrls: Record<string, string> = {};
            for (const file of accepted) {
                const name = relativePath(file);
                const isImage = /\.(png|jpe?g|gif|webp)$/i.test(name);
                const document = /\.(pdf|docx)$/i.test(name);
                const maxBytes = isImage || document ? (info?.file_workspace.max_binary_file_bytes ?? 4 * 1024 * 1024) : (info?.file_workspace.max_file_bytes ?? 1024 * 1024);
                if (file.size > maxBytes) throw new Error(isImage || document ? "图片或文档不能超过 4 MB。" : "每份文本资料不能超过 1 MB。");
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                        resolve(String(reader.result).split(",")[1] ?? "");
                    reader.onerror = () =>
                        reject(new Error("读取选取文件失败。"));
                    reader.readAsDataURL(file);
                });
                const artifact = await agentApi.upload(cid, name, base64);
                imported++;
                if (isImage && !isProject) {
                    imageAttachments.push(artifact);
                    imagePreviewUrls[artifact.id] = URL.createObjectURL(file);
                }
            }
            const next = await agentApi.snapshot(cid);
            if (currentConversation.current !== cid) return;
            setView(initialView(next));
            if (imageAttachments.length) {
                setPendingAttachments(values => [...values, ...imageAttachments]);
                setAttachmentPreviews(values => ({ ...values, ...imagePreviewUrls }));
            }
            if (isProject) {
                editText("请分析刚导入的项目资料，先读取 README、依赖文件和目录结构，再提取我亲自完成的功能、技术栈、关键实现和可写入简历的项目经历；不确定的内容先列为待确认，不要直接虚构或写入画像。");
                setNotice(`已导入 ${imported} 个项目文件。发送这条消息后，穗奈会先整理可确认的项目经历。`);
            } else setNotice(imageAttachments.length ? "图片已放入输入框，补充问题后发送即可。" : "资料已导入当前对话。你可以告诉穗奈怎样处理。");
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
        setResumePreviewOpen(false); setJobDetailId(null); setExecution(null); setPreview(file); setInspectorOpen(true);
        if (workbenchStatus === "open") setWorkbenchStatus("minimized");
    }
    function showExecution(runId: string, recordKey?: string) {
        setResumePreviewOpen(false); setJobDetailId(null); setPreview(null); setExecution(previous => ({ runId, recordKey, selectionId: (previous?.selectionId ?? 0) + 1 }));
        setInspectorOpen(true);
        if (workbenchStatus === "open") setWorkbenchStatus("minimized");
    }
    function closeDetail() {
        setResumePreviewOpen(false); setPreview(null); setExecution(null); setJobDetailId(null);
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
    function fillPrompt(value: string) { editText(value); if (memoryStatus === "open") setMemoryStatus("minimized"); if (workbenchStatus === "open") setWorkbenchStatus("minimized"); requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }
    async function continueObligation(value: string, obligationId?: string) {
        if (!obligationId) { fillPrompt(value); return; }
        try {
            await agentApi.claimObligation(obligationId);
            setPendingObligationId(obligationId);
            fillPrompt(value);
        } catch (error) { setNotice((error as Error).message); }
    }
    async function abandonObligation(obligationId: string) {
        try {
            await agentApi.abandonObligation(obligationId);
            if (pendingObligationId === obligationId) setPendingObligationId(undefined);
        } catch (error) { setNotice((error as Error).message); }
    }
    function newConversation() { chooseConversation(null); setView(null); setShowArchived(false); requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }
    function toggleMotion() { const next = !motion; setMotion(next); localStorage.setItem("career.motion", next ? "1" : "0"); }
    async function logout() {
        if (!await confirm({ title: account.official ? "退出当前账号？" : "切换登录方式？", confirmLabel: "退出并返回登录", description: <><p>退出将停止该账号未完成的任务，并清除临时密钥。</p><p>已保存的对话与成果仍会保留。</p></> })) return;
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
        <FileActionProvider scope={conversationId} local={ui.local_file_actions} busy={fileBusy} preview={previewFile} download={file => void exportFile(file)} open={(file, action) => void openLocalFile(file, action)}>
        <main className="agent-app career-workspace career-desktop-shell" data-ui-motion={uiMotion ? "on" : "off"} data-inspector-open={inspectorOpen} data-detail-open={Boolean(resumePreviewOpen || preview || executionRun || jobDetailId)}>
            <header className="agent-top career-masthead">
                <div className="career-masthead__identity"><CareerIcon name="history" size={34} /><div><div className="career-masthead__title"><h1>穗奈的陪伴桌面</h1><span className="career-presence" data-connected={Boolean(info && connected)}><i />{info && connected ? "服务已连接" : "正在连接"}</span></div><p>聊聊现在，一起找到下一步</p></div></div>
                <div className="career-night-note" aria-hidden="true"><span>☾</span><p>慢一点也没关系，<br />我们一直在向前。</p></div>
                <div className="career-masthead__actions">
                    <button className="agent-icon-button onboarding-help" type="button" title="使用引导" aria-label="重新查看使用引导" disabled={!info || busy || working || fileBusy || settings || remoteOpen || workspacePickerOpen || Boolean(renaming)} onClick={() => { setWorkbenchStatus(status => status === "open" ? "minimized" : status); setMemoryStatus(status => status === "open" ? "minimized" : status); closeDetail(); onboarding.start(); }}><AgentIcon name="help" size={21} /></button>
                    <UiMotionToggle />
                    {ui.model_connections && <button className="agent-icon-button" type="button" title="模型设置" aria-label="模型设置" onClick={openModelSettings}><CareerIcon name="settings" size={23} /></button>}
                    <button className="agent-icon-button career-mobile-workbench" data-onboarding="workbench" type="button" title="打开职业工作台" aria-label="打开职业工作台" aria-expanded={workbenchStatus === "open"} aria-controls="career-workbench-window" onClick={() => { setResumePreviewOpen(false); setResumeOpen(false); setWorkbenchStatus("open"); }}><CareerIcon name="folder" size={23} /></button>
                    <button className="agent-icon-button" type="button" title={inspectorOpen ? "收起穗奈小窗" : "打开穗奈小窗"} aria-label={inspectorOpen ? "收起穗奈小窗" : "打开穗奈小窗"} aria-expanded={inspectorOpen} aria-controls="career-context" onClick={() => { if (resumePreviewOpen || preview || execution || jobDetailId) { setResumePreviewOpen(false); setPreview(null); setExecution(null); setJobDetailId(null); setInspectorOpen(false); } else setInspectorOpen(value => !value); }}><AgentIcon name="panel" size={20} /></button>
                </div>
            </header>
            <div className="agent-layout">
                <aside className="agent-sidebar">
                    <div className="career-brand"><CareerIcon name="sprout" size={48} /><div><strong>青穗集</strong><p>更清晰的你<br />更喜欢的生活</p></div><span className="career-brand__spark" aria-hidden="true">✧</span></div>
                    <nav className="career-desktop-apps" aria-label="桌面应用"><button data-onboarding="workbench" id="career-workbench-launcher" type="button" aria-label="打开职业工作台" aria-expanded={workbenchStatus === "open"} aria-controls="career-workbench-window" onClick={() => { setResumePreviewOpen(false); setResumeOpen(false); setWorkbenchStatus("open"); }}><CareerIcon name="folder" size={29} /><span className="career-desktop-app__title">职业工作台<small>档案 · 岗位 · 成长行动</small></span>{pendingCareerCount ? <span className="career-app-badge" aria-label={pendingCareerCount + "份待确认建议"}>{pendingCareerCount}</span> : <span aria-hidden="true">↗</span>}</button><button data-onboarding="memory" type="button" className="career-memory-launcher" aria-label="打开穗奈·忆迹场" aria-expanded={memoryStatus === "open"} aria-controls="suinai-memory-window" onClick={openMemory}><CareerIcon name="memory" size={34} className="career-memory-launcher__icon" /><span className="career-desktop-app__title">穗奈·忆迹场</span><span className="career-desktop-app__open" aria-hidden="true">↗</span></button></nav>
                    <button className="btn btn--primary agent-new" disabled={working || fileBusy || historyBusy} type="button" onClick={newConversation}><CareerIcon name="newChat" size={23} /><span>新建对话</span><span className="career-new-plus" aria-hidden="true">＋</span></button>
                    <ConversationHistory conversations={conversations} selectedId={conversationId} disabled={working || fileBusy || historyBusy} activeId={busy ? conversationId : null} archived={showArchived} onArchived={setShowArchived} onChoose={chooseConversation} onRename={setRenaming} onArchive={conversation => void archiveConversation(conversation)} onDelete={conversation => void deleteConversation(conversation)} />
                    <div className="career-sidebar-bottom">
                        <div className="career-sidebar-scene" aria-hidden="true"><span>在成长的路上，<br />你并不孤单。</span><AsciiArt variant="cat" className="ascii-sidebar-cat" /><i>✦</i></div>
                        <div className="career-account"><span className="career-account__mark"><CareerIcon name="seedling" size={25} /></span><div><strong>{account.name}</strong>{account.official && <small>官方账号</small>}</div><button className="agent-icon-button" type="button" aria-label="切换登录方式" title="切换登录方式" onClick={() => void logout()}><AgentIcon name="exit" size={17} /></button></div>
                        {account.official && <OfficialPoints key={user.id} refreshKey={(view?.snapshot.runs.at(-1)?.id ?? "") + ":" + (view?.snapshot.runs.at(-1)?.status ?? "")} />}
                        <button className="career-sidebar-setting" type="button" onClick={() => setRemoteOpen(true)}><AgentIcon name="computer" size={21} />设备与同步<span>↗</span></button>
                        {ui.model_connections && <button className="career-sidebar-setting" type="button" onClick={openModelSettings}><CareerIcon name="settings" size={21} />AI 连接<span>↗</span></button>}
                        {ui.desktop_exit && <DesktopExit />}
                        {!cloud && <p className="career-privacy">资料保存在本机。调用外部模型时，相关内容仍会发送给所选服务。</p>}
                    </div>
                </aside>
                <section className="agent-chat" id="suinai-chat" aria-label="穗奈对话工作区">
                    <div className="desktop-titlebar career-chat-titlebar">
                        <span className="career-chat-title"><CareerIcon name="history" size={21} /><span>{snapshot?.conversation.title ?? "穗奈消息"}</span></span>
                        <div className="career-chat-titlebar__actions">
                            {ui.model_connections ? <button className="career-chat-connection" type="button" data-ready={Boolean(profile?.capabilities.chat && profile.has_key)} aria-label={profile?.has_key ? profile.capabilities.chat ? "模型已连接" : "模型连接待测试" : "连接模型"} title={profile?.has_key ? profile.capabilities.chat ? "模型已连接" : "模型连接待测试" : "连接模型"} onClick={openModelSettings}><i /></button> : <span className="career-chat-connection" role="status" data-ready={Boolean(profile?.capabilities.chat && profile.has_key)} aria-label={profile?.capabilities.chat && profile.has_key ? "官方服务已连接" : "官方服务连接中"}><i /></span>}
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
                    {resumeActive && !resumeBarDismissed && <ResumeConversationBar state={resumeWorkspace.state} busy={busy || working} onPreview={openResumePreview} onHide={() => setResumeBarDismissed(true)} />}
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
                        {conversationId && !snapshot && <div className="conversation-loading" role="status" aria-label="加载对话"><i /><i /><i /></div>}
                        {(!conversationId || snapshot) && !snapshot?.messages.length && !drafts.length ? (
                            <CareerWelcome onPrompt={fillPrompt} connected={Boolean(profile?.capabilities.chat && profile.has_key)} onConnect={openModelSettings} canConfigure={ui.model_connections} />
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
                                    {message.role === "assistant" && message.id === latestAssistantId && <DecisionActivity activity={conversationInsights?.activity} inline />}
                                </header>
                                {message.role === "user" && message.attachments?.length ? <div className="agent-message-attachments" aria-label="本次消息的图片">
                                    {message.attachments.map(attachment => {
                                        const file = files.find(item => item.id === attachment.artifact_id);
                                        return file ? <FileLink key={attachment.artifact_id} file={file}><AgentIcon name="image" size={14} />{attachment.name}</FileLink> : <span className="agent-message-attachment-missing" key={attachment.artifact_id}><AgentIcon name="image" size={14} />{attachment.name}</span>;
                                    })}
                                </div> : null}
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
                        {learningWorkspace.state?.proposal?.conversation_id === conversationId && <button className="learning-notice" type="button" onClick={() => { setResumeOpen(false); setCareerTab("learning"); setWorkbenchStatus("open"); }}><CareerIcon name="growth" size={24} /><span>学习路线已整理好，打开看看</span><AgentIcon name="chevron" size={16} /></button>}
                        {careerState?.proposals.filter(proposal => proposal.conversation_id === conversationId).map(proposal => <ProfileUpdateStrip key={proposal.id} proposal={proposal} state={careerState} saving={careerWorkspace.saving} disabled={cardDisabled} onChange={careerWorkspace.change} onPrompt={fillPrompt} />)}
                        {careerState && <CareerEvidencePanel state={{ ...careerState, insights: conversationInsights }} compact conversation showActivity={false} saving={careerWorkspace.saving || cardDisabled} onResolve={careerWorkspace.resolveFact} onPrompt={fillPrompt} />}
                        {careerWorkspace.notice && <div className="career-evidence-saved" role="status"><ComponentIcon name="confirm-check" size={16}/><span>{careerWorkspace.notice}</span><button type="button" className="component-icon-button" title="关闭提示" aria-label="关闭档案提示" onClick={careerWorkspace.dismissNotice}><ComponentIcon name="close" size={14}/></button></div>}
                        {!busy && !working && <DecisionFollowUp followUp={conversationInsights?.follow_up ?? null} onPrompt={fillPrompt} disabled={cardDisabled} />}
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
                    {resumeActive && !busy && !working && messages.filter(message => message.role === "user").length === 0 && <div className="resume-conversation-starters" aria-label="不知道怎么开始时"><span>从最像你的情况开始</span>{["我还是学生，没什么经历", "我已经工作，想换个机会", "我有旧简历，想一起改改"].map(value => <button type="button" key={value} onClick={() => fillPrompt(value)}>{value}</button>)}</div>}
                    <ChatComposer ui={ui} supportedExtensions={info?.file_workspace.supported_extensions} environment={info?.sandbox} key={conversationId ?? "draft"} text={text} onText={editText} composer={composer} fileInput={fileInput} onSubmit={event => void send(event)} onUpload={items => void upload(items)} onUploadProject={items => void upload(items)} onOpenWorkspace={() => void openWorkspace()} pendingAttachments={pendingAttachments} attachmentPreviews={attachmentPreviews} onRemoveAttachment={id => { setPendingAttachments(values => values.filter(file => file.id !== id)); setAttachmentPreviews(values => { const url = values[id]; if (url) URL.revokeObjectURL(url); const next = { ...values }; delete next[id]; return next; }); }} onCancel={() => { if (run) void agentApi.cancel(run.id).catch(error => setNotice(error.message)); }} onModelSettings={ui.model_connections ? openModelSettings : undefined} busy={busy} working={working || Boolean(conversationId && !snapshot)} fileBusy={fileBusy} waiting={run?.status === "waiting_input"} archived={Boolean(snapshot?.conversation.archived)} profiles={profiles} selected={selected} onSelect={value => { setSelected(value); remember(value); }} permission={ui.host_permissions ? permission : "default"} onPermission={setPermission} effort={effort} onEffort={setEffort} />

                </section>

                {(resumePreviewOpen || preview || executionRun || jobDetailId) && <button className="workspace-detail-backdrop" type="button" aria-label={resumePreviewOpen ? "收起简历预览" : jobDetailId ? "收起岗位详情" : preview ? "收起文件预览" : "收起执行记录"} onClick={closeDetail} />}
                {resumePreviewOpen ? <ResumePreviewPanel onPrompt={fillPrompt} onEdit={async (request, instruction) => { await runResumeTask("请只修改简历中框选的部分：" + instruction, request); }} onCancelPending={async () => { await resumeWorkspace.apply({ type: "task.cancel" }); }} editDisabled={fileBusy || Boolean(snapshot?.conversation.archived)} state={resumeWorkspace.state} liveDraft={liveResumeDraft} error={resumeWorkspace.error} busy={busy || working} saving={resumeWorkspace.saving} onClose={closeDetail} onOpenStudio={() => { setResumeOpen(true); setCareerTab("files"); setWorkbenchStatus("open"); }} /> : jobDetailId ? <JobDetailPanel id={jobDetailId} state={careerState} saving={careerWorkspace.saving} disabled={cardDisabled} onSave={saveJob} onClose={closeDetail} onPrompt={fillPrompt} /> : preview ? <FilePreviewPanel file={preview} files={files} local={ui.local_file_actions} busy={fileBusy} onSelect={previewFile} onClose={closeDetail} onDownload={file => void exportFile(file)} onOpen={(file, action) => void openLocalFile(file, action)} /> : executionRun ? <ExecutionPanel run={executionRun} runs={snapshot?.runs ?? []} messages={snapshot?.messages ?? []} records={records} events={view?.events ?? []} selectedKey={execution?.recordKey} selectionId={execution?.selectionId} files={files} onSelect={showExecution} onClose={closeDetail} onPreview={previewFile} /> : <aside className="agent-inspector" id="career-context" aria-label="穗奈陪伴与资料">
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
                        <AnimatedDisclosure className="growth-conversation-memory" summary="这段对话的小结"><ConversationMemory plan={snapshot?.plan} obligations={snapshot?.obligations} onContinue={continueObligation} onAbandon={abandonObligation} guidance={guidance} analyzing={insights.analyzing} error={insights.error} enabled={smartSuggestions} canRefresh={insightReady && !busy && !working && ["completed", "waiting_input"].includes(run?.status ?? "") && Boolean(snapshot?.messages.some(message => message.role === "user"))} onRefresh={insights.refresh} /></AnimatedDisclosure>
                    </GrowthSummary>
                    {careerState?.actions.find(action => action.status !== "done") && <NextActionRow action={careerState.actions.find(action => action.status !== "done")!} disabled={cardDisabled} onPrompt={fillPrompt} />}

                    <FileDirectory files={files} />
                </aside>}
            </div>
            <footer className="agent-footer career-desktop-taskbar" aria-label="桌面任务栏">
                <div className="career-desktop-taskbar__apps">
                    <button type="button" className="career-taskbar-app" aria-pressed={workbenchStatus !== "open" && memoryStatus !== "open"} onClick={() => { if (memoryStatus === "open") minimizeMemory(); if (workbenchStatus === "open") minimizeWorkbench(); else composer.current?.focus({ preventScroll: true }); }}><img src={SUINAI_AVATAR_URL} alt="" width={22} height={22} /><span>穗奈对话</span></button>
                    {workbenchStatus !== "closed" && <button type="button" className="career-taskbar-app" aria-pressed={workbenchStatus === "open"} aria-label={workbenchStatus === "open" ? "最小化职业工作台" : "恢复职业工作台"} onClick={() => workbenchStatus === "open" ? minimizeWorkbench() : setWorkbenchStatus("open")}><CareerIcon name="folder" size={22} /><span>{resumeOpen ? "简历与经历" : "职业工作台"}</span>{pendingCareerCount > 0 && <small>{pendingCareerCount}</small>}</button>}
                    <button data-onboarding="memory" type="button" className="career-taskbar-app" aria-pressed={memoryStatus === "open"} aria-label={memoryStatus === "open" ? "最小化穗奈·忆迹场" : "打开穗奈·忆迹场"} onClick={() => memoryStatus === "open" ? minimizeMemory() : openMemory()}><CareerIcon name="memory" size={22} /><span>穗奈·忆迹场</span>{memoryView && memoryView.recalls[0]?.items.length ? <small>{memoryView.recalls[0].items.length}</small> : null}</button>
                </div>
                <span className="career-taskbar-status">{busy ? "穗奈正在处理任务…" : "青穗集 · 你的成长桌面"}</span>
            </footer>
            <DesktopWindow open={workbenchStatus === "open"} onClose={closeWorkbench} onMinimize={minimizeWorkbench} title={resumeOpen ? "简历与经历" : "职业工作台"}>
                <CareerWorkbench workspace={careerWorkspace} learning={learningWorkspace} onJob={id => { minimizeWorkbench(); openJob(id); }} tab={careerTab} onTab={setCareerTab} files={files} hidden={workbenchStatus !== "open"} resumeOpen={resumeOpen} onResumeOpen={setResumeOpen} resume={{ workspace: resumeWorkspace, busy: busy || working || fileBusy || Boolean(snapshot?.conversation.archived), onChat: message => { void openResumeChat(message); }, onContinue: continueResumeConversation, onExport: exportResume }} onPrompt={fillPrompt} onImport={() => { minimizeWorkbench(); fileInput.current?.click(); }} onPending={setPendingCareerCount} uploadDisabled={busy || working || fileBusy || Boolean(snapshot?.conversation.archived)} />
            </DesktopWindow>
            <DesktopWindow id="suinai-memory-window" open={memoryStatus === "open"} onClose={closeMemory} onMinimize={minimizeMemory} title="穗奈·忆迹场" status="记忆 · 证据 · 当前召回">
                {memoryStatus !== "closed" && <Suspense fallback={<div className="memory-loading" role="status">正在打开忆迹场…</div>}><MemorySea active={memoryStatus === "open"} activity={insights.analyzing ? "consolidating" : busy ? "working" : "idle"} view={memoryView} loading={memoryLoading} error={memoryError} onRefresh={loadMemory} onChange={async (id, change) => { await agentApi.changeMemory(id, change); await loadMemory(); }} onRetry={async () => { await agentApi.retryMemory(); await loadMemory(); }} onSettings={async value => { await agentApi.memorySettings(value); await loadMemory(); }} onExport={agentApi.exportMemory} onConfirmDelete={node => confirm({ title: "让穗奈忘记这段记忆？", confirmLabel: "永久删除记忆", description: <><p>{node.text}</p><p>忆迹场中的记录、来源索引和旧召回引用会删除；原始对话、正式画像和简历仍会保留。之后不会自动从这段来源重新记起。</p></> })} /></Suspense>}
            </DesktopWindow>
            <RemoteConnections cloud={cloud} open={remoteOpen} onClose={() => setRemoteOpen(false)} user={user} onLogin={() => { setRemoteOpen(false); void logout(); }} />
            {settings && ui.model_connections ? (
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
        <WorkspacePicker
            open={workspacePickerOpen}
            conversation={snapshot?.conversation ?? conversations.find(item => item.id === conversationId) ?? null}
            workspaces={workspaces}
            access={snapshot?.conversation.workspace_access ?? "read-only"}
            busy={fileBusy || working || busy}
            onClose={() => setWorkspacePickerOpen(false)}
            onPick={() => void pickWorkspace()}
            onBind={(id, access) => void bindWorkspace(id, access)}
            onUnbind={() => void unbindWorkspace()}
            onDelete={value => void deleteWorkspace(value)}
        />
        {renaming && <RenameConversationDialog key={renaming.id} conversation={renaming} onSave={title => renameConversation(renaming, title)} onClose={() => setRenaming(null)} />}
        {onboarding.active && <OnboardingTour step={onboarding.active.step} mode={deploymentMode} animated={uiMotion && motion && !reduced} onStep={onboarding.move} onFinish={onboarding.finish} />}
        {confirmationDialog}
        </FileActionProvider>
    );
}
