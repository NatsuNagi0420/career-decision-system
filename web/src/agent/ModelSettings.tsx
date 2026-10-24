/** 青穗集 · 模型设置：官方与自带接口并列，密钥仅提交、不回显，能力由真实测试决定。 */
import { useEffect, useRef, useState } from "react";
import { agentApi } from "./api";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import type {
    AgentInfo,
    AgentUser,
    ModelDiscovery,
    ModelInput,
    ModelProfile,
} from "./types";
const blank: ModelInput = {
    name: "我的模型",
    mode: "custom",
    api_kind: "auto",
    base_url: "",
    model: "",
    api_key: "",
    allow_local: false,
    remember_key: false,
};
function toInput(p?: ModelProfile): ModelInput {
    return p
        ? {
              name: p.name,
              mode: p.mode,
              api_kind: p.api_kind,
              base_url: p.base_url,
              model: p.model,
              allow_local: p.allow_local,
              remember_key: p.remember_key,
              api_key: "",
          }
        : { ...blank };
}
const protocolName = (kind: ModelInput["api_kind"]) =>
    kind === "auto"
        ? "自动检测"
        : kind === "responses"
          ? "Responses"
          : "Chat Completions";
interface Props {
    profiles: ModelProfile[];
    info: AgentInfo | null;
    user: AgentUser;
    selected: string;
    onClose: () => void;
    onSaved: (id?: string) => Promise<void>;
    onConsent: (value: boolean) => Promise<void>;
}
export function ModelSettings({
    profiles,
    info,
    user,
    selected,
    onClose,
    onSaved,
    onConsent,
}: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const { confirm, dialog: confirmationDialog } = usePixelConfirm();
    const [editing, setEditing] = useState<string | undefined>(
        selected || undefined,
    );
    const [form, setForm] = useState<ModelInput>(() =>
        toInput(profiles.find((item) => item.id === selected)),
    );
    const [result, setResult] = useState<ModelProfile | null>(
        () => profiles.find((p) => p.id === selected) ?? null,
    );
    const [operation, setOperation] = useState<
        "" | "discover" | "save" | "test"
    >("");
    const busy = Boolean(operation);
    const [catalog, setCatalog] = useState<ModelDiscovery | null>(null);
    const [catalogError, setCatalogError] = useState("");
    const [query, setQuery] = useState("");
    const [manual, setManual] = useState(false);
    const visibleModels =
        catalog?.models.filter((model) =>
            (model.id + " " + (model.label ?? ""))
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase().trim()),
        ) ?? [];
    const [error, setError] = useState("");
    useEffect(() => {
        dialog.current?.showModal();
        return () => dialog.current?.close();
    }, []);
    function choose(profile?: ModelProfile) {
        setEditing(profile?.id);
        setResult(profile ?? null);
        setError("");
        setForm(toInput(profile));
        setCatalog(null);
        setCatalogError("");
        setQuery("");
        setManual(false);
    }
    const field = <K extends keyof ModelInput>(
        key: K,
        value: ModelInput[K],
    ) => {
        setForm((old) => ({ ...old, [key]: value }));
        setResult(null);
        setError("");
        if (["base_url", "api_key", "allow_local", "mode"].includes(key)) {
            setCatalog(null);
            setCatalogError("");
            setQuery("");
            if (key !== "allow_local")
                setForm((old) => ({ ...old, model: "" }));
        }
    };
    async function discover() {
        setOperation("discover");
        setError("");
        setCatalogError("");
        try {
            const found = await agentApi.discoverModels({
                base_url: form.base_url,
                api_key: form.api_key?.trim() || undefined,
                profile_id: editing,
                allow_local: form.allow_local,
            });
            setCatalog(found);
            setQuery("");
            setManual(false);
            setForm((old) => ({
                ...old,
                base_url: found.base_url,
                model: found.models.some((model) => model.id === old.model)
                    ? old.model
                    : "",
            }));
        } catch (error) {
            setCatalogError((error as Error).message);
        } finally {
            setOperation("");
        }
    }
    async function save(test: boolean) {
        if (form.mode === "custom" && !form.model.trim()) {
            setError("请先拉取并选择一个模型；列表不可用时可启用手动填写。");
            return;
        }
        setOperation("save");
        setError("");
        try {
            const saved = await agentApi.saveProfile(
                { ...form, api_key: form.api_key || undefined },
                editing,
            );
            setEditing(saved.id);
            setForm(toInput(saved));
            setResult(saved);
            await onSaved(saved.id);
            if (test) {
                setOperation("test");
                const tested = await agentApi.testProfile(saved.id);
                setResult(tested);
                await onSaved(tested.id);
            }
        } catch (error) {
            setError((error as Error).message);
        } finally {
            setOperation("");
        }
    }
    async function remove() {
        if (!editing) return;
        if (!await confirm({ title: "删除这个模型连接？", confirmLabel: "确认删除", description: <><p>此模型连接配置将被删除，需要时可以重新添加。</p><p>对话和成果文件仍会保留，不会一并删除。</p></> })) return;
        setOperation("save");
        setError("");
        try {
            await agentApi.deleteProfile(editing);
            choose();
            await onSaved();
        } catch (error) {
            setError((error as Error).message);
        } finally {
            setOperation("");
        }
    }
    return (
        <>
        <dialog
            ref={dialog}
            className="agent-dialog agent-settings"
            aria-labelledby="model-settings-title"
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onClose();
            }}
        >
            <div className="desktop-titlebar">
                <span id="model-settings-title">模型连接设置</span>
                <button
                    type="button"
                    aria-label="关闭模型设置"
                    disabled={busy}
                    onClick={onClose}
                >
                    ×
                </button>
            </div>
            <div className="agent-settings__layout">
                <nav aria-label="已保存的模型配置">
                    <button
                        className="btn btn--outline"
                        type="button"
                        disabled={busy}
                        onClick={() => choose()}
                    >
                        ＋ 添加连接
                    </button>
                    {profiles.map((profile) => (
                        <button
                            type="button"
                            key={profile.id}
                            data-selected={editing === profile.id}
                            disabled={busy}
                            onClick={() => choose(profile)}
                        >
                            <strong>{profile.mode === "official" ? profile.display_name || profile.name : profile.name}</strong>
                            <small>
                                {profile.mode === "official"
                                    ? "官方服务"
                                    : "自带接口"}{" "}
                                ·{" "}
                                {profile.has_key
                                    ? profile.capabilities.tools
                                        ? "可执行工具"
                                        : profile.capabilities.chat
                                          ? "仅聊天"
                                          : profile.capabilities.tested_at
                                            ? "连接异常"
                                            : "待测试"
                                    : "需要密钥"}
                            </small>
                        </button>
                    ))}
                    <p>
                        支持 New API 等兼容网关。填写地址和 Key
                        后拉取模型，再选择与测试。
                    </p>
                </nav>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save(true);
                    }}
                >
                    <h2>{editing ? "管理这个连接" : "接入你选择的模型"}</h2>
                    <p className="agent-muted">
                        密钥不会放入对话、角色提示或命令沙箱。连接测试会向所选服务发起少量请求，可能产生费用。
                    </p>
                    <label className="agent-check agent-consent">
                        <input
                            type="checkbox"
                            checked={user.external_ai_consent}
                            disabled={busy}
                            onChange={(event) => {
                                setError("");
                                void onConsent(event.target.checked).catch(
                                    (error) => setError(error.message),
                                );
                            }}
                        />
                        <span>
                            我同意将请求、对话及选取资料发送给当前选择的模型服务。自定义网关的隐私由其服务方负责。
                        </span>
                    </label>
                    <fieldset disabled={busy}>
                        <legend>接入方式</legend>
                        <div className="agent-segment">
                            <button
                                type="button"
                                data-selected={form.mode === "custom"}
                                onClick={() => field("mode", "custom")}
                            >
                                自定义接口
                            </button>
                            <button
                                type="button"
                                data-selected={form.mode === "official"}
                                disabled={!info?.official_configured}
                                onClick={() => {
                                    field("mode", "official");
                                    field("name", "官方服务");
                                }}
                            >
                                官方服务
                            </button>
                        </div>
                        {!info?.official_configured ? (
                            <p className="agent-muted">
                                官方入口尚未部署。现在可使用自己的 API
                                Key，不会自动切换或产生官方扣费。
                            </p>
                        ) : null}
                        <label>
                            连接名称
                            <input
                                required
                                maxLength={60}
                                value={form.name}
                                onChange={(event) =>
                                    field("name", event.target.value)
                                }
                            />
                        </label>
                        {form.mode === "custom" ? (
                            <>
                                <label>
                                    接口地址（Base URL）
                                    <input
                                        required
                                        type="url"
                                        autoComplete="off"
                                        placeholder="https://你的网关域名/v1"
                                        value={form.base_url}
                                        onChange={(event) =>
                                            field(
                                                "base_url",
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <small>
                                        可填 API 根地址或 /v1 地址；完整
                                        /chat/completions、/responses
                                        路径会自动整理。自定义路径前缀会保留。
                                    </small>
                                </label>
                                <label>
                                    API Key
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        spellCheck={false}
                                        placeholder={
                                            editing
                                                ? "留空沿用；服务重启后可能需要重填"
                                                : "填写服务商或网关提供的密钥"
                                        }
                                        value={form.api_key}
                                        onChange={(event) =>
                                            field("api_key", event.target.value)
                                        }
                                    />
                                </label>
                                <section
                                    className="agent-model-discovery"
                                    aria-label="从接口选择模型"
                                >
                                    <div className="agent-model-discovery__heading">
                                        <strong>选择模型</strong>
                                        <button
                                            className="btn btn--outline"
                                            type="button"
                                            disabled={
                                                busy ||
                                                !user.external_ai_consent ||
                                                !form.base_url.trim() ||
                                                (!form.api_key?.trim() &&
                                                    !editing)
                                            }
                                            onClick={() => void discover()}
                                        >
                                            {operation === "discover"
                                                ? "正在拉取…"
                                                : catalog
                                                  ? "刷新模型列表"
                                                  : "拉取模型列表"}
                                        </button>
                                    </div>
                                    <p className="agent-muted">
                                        使用当前地址和 Key
                                        请求模型列表，无需先保存，也无需猜模型名称。列表中的模型仍需测试是否能聊天与调用工具。
                                    </p>
                                    {catalog ? (
                                        <p
                                            className="agent-discovery-status"
                                            role="status"
                                        >
                                            已获取 {catalog.models.length}{" "}
                                            个模型
                                        </p>
                                    ) : null}
                                    {catalogError ? (
                                        <p className="agent-error" role="alert">
                                            {catalogError}
                                        </p>
                                    ) : null}
                                    {!manual ? (
                                        <>
                                            {catalog ? (
                                                <label>
                                                    搜索可用模型
                                                    <input
                                                        type="search"
                                                        placeholder="按模型名称筛选"
                                                        value={query}
                                                        onChange={(event) =>
                                                            setQuery(
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                    />
                                                </label>
                                            ) : null}
                                            <label>
                                                模型
                                                <select
                                                    required
                                                    value={form.model}
                                                    onChange={(event) =>
                                                        field(
                                                            "model",
                                                            event.target.value,
                                                        )
                                                    }
                                                >
                                                    <option value="">
                                                        {catalog
                                                            ? "请选择一个聊天模型"
                                                            : "请先点击上方拉取模型列表"}
                                                    </option>
                                                    {form.model &&
                                                    !visibleModels.some(
                                                        (model) =>
                                                            model.id ===
                                                            form.model,
                                                    ) ? (
                                                        <option
                                                            value={form.model}
                                                        >
                                                            {form.model}
                                                            （当前选择）
                                                        </option>
                                                    ) : null}
                                                    {visibleModels.map(
                                                        (model) => (
                                                            <option
                                                                key={model.id}
                                                                value={model.id}
                                                            >
                                                                {model.label
                                                                    ? model.label +
                                                                      " · "
                                                                    : ""}
                                                                {model.id}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>
                                            {catalog &&
                                            !visibleModels.length ? (
                                                <p className="agent-muted">
                                                    没有匹配的模型，请更换搜索词。
                                                </p>
                                            ) : null}
                                        </>
                                    ) : (
                                        <label>
                                            手动填写模型标识
                                            <input
                                                required
                                                autoComplete="off"
                                                maxLength={200}
                                                placeholder="仅在服务商未开放模型列表时使用"
                                                value={form.model}
                                                onChange={(event) =>
                                                    field(
                                                        "model",
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </label>
                                    )}
                                    <label className="agent-check">
                                        <input
                                            type="checkbox"
                                            checked={manual}
                                            onChange={(event) =>
                                                setManual(event.target.checked)
                                            }
                                        />
                                        <span>
                                            接口不提供模型列表，改为手动填写
                                        </span>
                                    </label>
                                </section>
                                <details>
                                    <summary>高级连接选项</summary>
                                    <label>
                                        接口协议
                                        <select
                                            value={form.api_kind}
                                            onChange={(event) =>
                                                field(
                                                    "api_kind",
                                                    event.target
                                                        .value as ModelInput["api_kind"],
                                                )
                                            }
                                        >
                                            <option value="auto">
                                                自动检测（推荐）
                                            </option>
                                            <option value="chat-completions">
                                                Chat Completions（常见兼容接口）
                                            </option>
                                            <option value="responses">
                                                Responses
                                            </option>
                                        </select>
                                    </label>
                                    <label className="agent-check">
                                        <input
                                            type="checkbox"
                                            checked={form.allow_local}
                                            onChange={(event) =>
                                                field(
                                                    "allow_local",
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                        <span>
                                            我明确允许连接本机或私网模型接口
                                        </span>
                                    </label>
                                    <label className="agent-check">
                                        <input
                                            type="checkbox"
                                            disabled={
                                                !info?.persistent_secrets_supported
                                            }
                                            checked={form.remember_key}
                                            onChange={(event) =>
                                                field(
                                                    "remember_key",
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                        <span>
                                            {info?.persistent_secrets_supported
                                                ? "使用 Windows 当前用户加密保存密钥"
                                                : "当前系统仅支持临时保存"}
                                        </span>
                                    </label>
                                    <p className="agent-muted">
                                        不勾选时只在本次服务运行期间保管；退出账号或重启服务后需重新填写。系统加密也不能防止同一系统账号下的恶意程序。
                                    </p>
                                </details>
                            </>
                        ) : (
                            <p className="agent-callout">
                                官方上游密钥只留在运营方服务器。此应用使用独立、受限的官方访问凭证。
                            </p>
                        )}
                    </fieldset>
                    {result ? (
                        <section
                            className="agent-test-result"
                            aria-label="模型连接测试结果"
                        >
                            <strong>
                                {result.capabilities.tested_at
                                    ? "实际连接测试"
                                    : "配置已保存，尚未测试"}
                            </strong>
                            <div>
                                <span data-ok={result.capabilities.chat}>
                                    聊天：
                                    {result.capabilities.chat
                                        ? "通过"
                                        : result.capabilities.tested_at
                                          ? "未通过"
                                          : "尚未测试"}
                                </span>
                                <span data-ok={result.capabilities.tools}>
                                    工具往返：
                                    {result.capabilities.tools
                                        ? "通过"
                                        : result.capabilities.chat
                                          ? "未通过"
                                          : "未测试"}
                                </span>
                                <span data-ok={result.capabilities.stream}>
                                    流式：
                                    {result.capabilities.stream
                                        ? "通过"
                                        : result.capabilities.chat
                                          ? "非流式"
                                          : "未通过"}
                                </span>
                            </div>
                            <p>{result.capabilities.note}</p>
                            {result.resolved_api_kind ? (
                                <p className="agent-muted">
                                    实际使用协议：
                                    {protocolName(result.resolved_api_kind)}
                                    {result.api_kind === "auto"
                                        ? "（自动检测）"
                                        : ""}
                                </p>
                            ) : null}
                            {result.capabilities.checks?.length ? (
                                <details
                                    className="agent-connection-checks"
                                    open={
                                        !result.capabilities.chat ||
                                        !result.capabilities.tools
                                    }
                                >
                                    <summary>查看分项测试详情</summary>
                                    <ul>
                                        {result.capabilities.checks.map(
                                            (check, index) => (
                                                <li
                                                    key={index}
                                                    data-ok={check.ok}
                                                >
                                                    <strong>
                                                        {protocolName(
                                                            check.protocol,
                                                        )}{" "}
                                                        ·{" "}
                                                        {
                                                            {
                                                                chat: "聊天",
                                                                stream: "流式",
                                                                tools: "工具往返",
                                                            }[check.stage]
                                                        }
                                                        ：
                                                        {check.ok
                                                            ? "通过"
                                                            : "未通过"}
                                                    </strong>
                                                    <p>{check.note}</p>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                </details>
                            ) : null}
                            {!result.has_key ? (
                                <p>当前没有可用密钥，请重新填写。</p>
                            ) : null}
                        </section>
                    ) : null}
                    {error ? (
                        <p className="agent-error" role="alert">
                            {error}
                        </p>
                    ) : null}
                    <footer className="agent-form-actions">
                        <button
                            className="btn btn--primary"
                            disabled={busy || !user.external_ai_consent}
                            type="submit"
                        >
                            {operation === "test"
                                ? "正在测试聊天和工具…"
                                : operation === "save"
                                  ? "正在保存…"
                                  : "保存并测试连接"}
                        </button>
                        <button
                            className="btn btn--outline"
                            type="button"
                            disabled={busy}
                            onClick={() => void save(false)}
                        >
                            只保存
                        </button>
                        {editing ? (
                            <button
                                className="agent-link agent-danger"
                                disabled={busy}
                                type="button"
                                onClick={() => void remove()}
                            >
                                删除连接
                            </button>
                        ) : null}
                    </footer>
                </form>
            </div>
        </dialog>
        {confirmationDialog}
        </>
    );
}
