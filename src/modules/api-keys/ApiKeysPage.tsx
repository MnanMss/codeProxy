import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Plus,
    Copy,
    Pencil,
    Trash2,
    KeyRound,
    ShieldCheck,
    RefreshCw,
    Infinity,
    BarChart3,
    Power,
} from "lucide-react";
import { apiKeyEntriesApi, apiKeysApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { usageApi } from "@/lib/http/apis";
import type { UsageData } from "@/lib/http/types";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import { Modal } from "@/modules/ui/Modal";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";
import { MultiSelect, type MultiSelectOption } from "@/modules/ui/MultiSelect";
import { useAuthStore } from "@/stores/useAuthStore";
import { normalizeApiBase } from "@/lib/connection";

/* ─── helpers ─── */

const generateKey = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "sk-";
    for (let i = 0; i < 32; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
};

const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.slice(0, 5) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-3);
};

const formatDate = (iso: string | undefined) => {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
};

const formatLimit = (limit: number | undefined) => {
    if (!limit || limit <= 0) return "无限制";
    return limit.toLocaleString();
};

const formatTimestamp = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "--";
    return date.toLocaleString();
};

const formatLatencyMs = (value: number): string => {
    if (!Number.isFinite(value) || value < 0) return "--";
    if (value < 1) return "<1ms";
    if (value < 1000) return `${Math.round(value)}ms`;
    const seconds = value / 1000;
    const fixed = seconds.toFixed(seconds < 10 ? 2 : 1);
    const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
    return `${trimmed}s`;
};

const readLatencyText = (detail: Record<string, unknown>): string => {
    const candidates = [
        detail["latency_ms"],
        detail["latencyMs"],
        detail["duration_ms"],
        detail["latency"],
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "number") return formatLatencyMs(candidate);
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "--";
};

/* ─── usage detail row type ─── */

interface UsageLogRow {
    id: string;
    timestamp: string;
    model: string;
    failed: boolean;
    latencyText: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

const buildUsageRows = (usage: UsageData, apiKey: string): UsageLogRow[] => {
    const apiData = (usage.apis ?? {})[apiKey];
    if (!apiData) return [];
    const rows: UsageLogRow[] = [];
    let id = 0;
    Object.entries(apiData.models ?? {}).forEach(([model, modelData]) => {
        (modelData.details ?? []).forEach((detail: any) => {
            const tokens = detail.tokens;
            rows.push({
                id: `${id++}`,
                timestamp: detail.timestamp ?? "",
                model,
                failed: Boolean(detail.failed),
                latencyText: readLatencyText(detail),
                inputTokens: tokens?.input_tokens ?? 0,
                outputTokens: tokens?.output_tokens ?? 0,
                totalTokens: tokens?.total_tokens ?? (tokens?.input_tokens ?? 0) + (tokens?.output_tokens ?? 0),
            });
        });
    });
    return rows.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
    });
};

/* ─── types ─── */

interface FormValues {
    name: string;
    key: string;
    dailyLimit: string;
    totalQuota: string;
    allowedModels: string[];
}

/* ─── component ─── */

export function ApiKeysPage() {
    const { notify } = useToast();

    const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
    const [usageViewKey, setUsageViewKey] = useState<string | null>(null);
    const [usageViewName, setUsageViewName] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [usage, setUsage] = useState<UsageData>({ apis: {} });
    const [usageLoading, setUsageLoading] = useState(false);
    const [availableModels, setAvailableModels] = useState<MultiSelectOption[]>([]);
    const [form, setForm] = useState<FormValues>({
        name: "",
        key: "",
        dailyLimit: "",
        totalQuota: "",
        allowedModels: [],
    });

    /* ─── load models ─── */

    const loadModels = useCallback(async (apiKeyEntries: ApiKeyEntry[]) => {
        try {
            // Fetch directly from /v1/models (not via management API prefix)
            const { apiBase } = useAuthStore.getState();
            const serverBase = normalizeApiBase(apiBase);
            if (!serverBase) return;

            // Use an existing api-key for auth (management key is NOT a valid API key)
            const apiKey = apiKeyEntries.find((e) => !e.disabled)?.key || apiKeyEntries[0]?.key;
            if (!apiKey) return;

            const resp = await fetch(`${serverBase}/v1/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            }).catch(() => null);
            if (!resp || !resp.ok) return;

            const data = (await resp.json().catch(() => null)) as { data?: { id: string }[] } | null;
            if (data?.data) {
                const opts: MultiSelectOption[] = data.data
                    .map((m) => ({ value: m.id, label: m.id }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                setAvailableModels(opts);
            }
        } catch {
            // silent — models list is supplementary
        }
    }, []);

    /* ─── load ─── */

    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            const [entriesData, legacyKeys] = await Promise.all([
                apiKeyEntriesApi.list(),
                apiKeysApi.list().catch(() => [] as string[]),
            ]);

            // Auto-migrate: old api-keys not in api-key-entries get added as unnamed entries
            const entryKeySet = new Set(entriesData.map((e) => e.key));
            const newEntries = legacyKeys
                .filter((k: string) => k && !entryKeySet.has(k))
                .map((k: string): ApiKeyEntry => ({ key: k, "created-at": new Date().toISOString() }));

            let finalEntries: ApiKeyEntry[];
            if (newEntries.length > 0) {
                const merged = [...entriesData, ...newEntries];
                try {
                    await apiKeyEntriesApi.replace(merged);
                    notify({ type: "success", message: `已自动导入 ${newEntries.length} 个旧 API Key` });
                } catch {
                    // silent
                }
                finalEntries = merged;
            } else {
                finalEntries = entriesData;
            }
            setEntries(finalEntries);
            // Load models after entries are available (needs a valid API key)
            void loadModels(finalEntries);
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "加载 API Keys 失败" });
        } finally {
            setLoading(false);
        }
    }, [notify, loadModels]);

    const loadUsage = useCallback(async () => {
        setUsageLoading(true);
        try {
            const data = await usageApi.getUsage();
            setUsage(data);
        } catch {
            // silent
        } finally {
            setUsageLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadEntries();
        void loadUsage();
    }, [loadEntries, loadUsage]);

    /* ─── toggle disable ─── */

    const handleToggleDisable = async (index: number) => {
        const entry = entries[index];
        const updated = { ...entry, disabled: !entry.disabled };
        const newEntries = [...entries];
        newEntries[index] = updated;

        try {
            await apiKeyEntriesApi.replace(newEntries);
            setEntries(newEntries);
            notify({
                type: "success",
                message: updated.disabled ? `已禁用「${entry.name || "未命名"}」` : `已启用「${entry.name || "未命名"}」`,
            });
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "操作失败" });
        }
    };

    /* ─── create ─── */

    const handleOpenCreate = () => {
        setForm({
            name: "",
            key: generateKey(),
            dailyLimit: "",
            totalQuota: "",
            allowedModels: [],
        });
        setShowCreate(true);
    };

    const handleCreate = async () => {
        if (!form.name.trim()) {
            notify({ type: "error", message: "请填写 API Key 名称" });
            return;
        }
        if (!form.key.trim()) {
            notify({ type: "error", message: "Key 不能为空" });
            return;
        }
        setSaving(true);
        try {
            const newEntry: ApiKeyEntry = {
                key: form.key.trim(),
                name: form.name.trim(),
                "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : undefined,
                "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : undefined,
                "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : undefined,
                "created-at": new Date().toISOString(),
            };
            await apiKeyEntriesApi.replace([...entries, newEntry]);
            notify({ type: "success", message: "创建成功" });
            setShowCreate(false);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "创建失败" });
        } finally {
            setSaving(false);
        }
    };

    /* ─── edit ─── */

    const handleOpenEdit = (index: number) => {
        const entry = entries[index];
        setForm({
            name: entry.name || "",
            key: entry.key,
            dailyLimit: entry["daily-limit"]?.toString() || "",
            totalQuota: entry["total-quota"]?.toString() || "",
            allowedModels: entry["allowed-models"] || [],
        });
        setEditIndex(index);
    };

    const handleEdit = async () => {
        if (editIndex === null) return;
        if (!form.name.trim()) {
            notify({ type: "error", message: "请填写 API Key 名称" });
            return;
        }
        setSaving(true);
        try {
            await apiKeyEntriesApi.update({
                index: editIndex,
                value: {
                    name: form.name.trim(),
                    "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : 0,
                    "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : 0,
                    "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : [],
                },
            });
            notify({ type: "success", message: "更新成功" });
            setEditIndex(null);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "更新失败" });
        } finally {
            setSaving(false);
        }
    };

    /* ─── delete ─── */

    const handleDelete = async () => {
        if (deleteIndex === null) return;
        setSaving(true);
        try {
            await apiKeyEntriesApi.delete({ index: deleteIndex });
            notify({ type: "success", message: "删除成功" });
            setDeleteIndex(null);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
        } finally {
            setSaving(false);
        }
    };

    /* ─── copy ─── */

    const handleCopy = async (key: string) => {
        try {
            await navigator.clipboard.writeText(key);
            notify({ type: "success", message: "已复制到剪贴板" });
        } catch {
            notify({ type: "error", message: "复制失败" });
        }
    };

    /* ─── usage view ─── */

    const handleViewUsage = (entry: ApiKeyEntry) => {
        setUsageViewKey(entry.key);
        setUsageViewName(entry.name || "未命名");
        void loadUsage();
    };

    const usageRows = useMemo<UsageLogRow[]>(() => {
        if (!usageViewKey) return [];
        return buildUsageRows(usage, usageViewKey);
    }, [usageViewKey, usage]);

    /* ─── render form ─── */

    const renderForm = () => (
        <div className="space-y-4">
            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    名称 <span className="text-rose-500">*</span>
                </label>
                <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="例如：团队A（必填）"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    API Key
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={form.key}
                        onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                        placeholder="sk-..."
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                        readOnly={editIndex !== null}
                    />
                    {editIndex === null && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setForm((p) => ({ ...p, key: generateKey() }))}
                        >
                            <RefreshCw size={14} />
                            重新生成
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                        每日请求限制
                    </label>
                    <input
                        type="number"
                        value={form.dailyLimit}
                        onChange={(e) => setForm((p) => ({ ...p, dailyLimit: e.target.value }))}
                        placeholder="0 = 无限制"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                        总请求额度
                    </label>
                    <input
                        type="number"
                        value={form.totalQuota}
                        onChange={(e) => setForm((p) => ({ ...p, totalQuota: e.target.value }))}
                        placeholder="0 = 无限制"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    允许的模型（不选 = 全部可用）
                </label>
                <MultiSelect
                    options={availableModels}
                    value={form.allowedModels}
                    onChange={(selected) => setForm((p) => ({ ...p, allowedModels: selected }))}
                    placeholder="选择模型..."
                    emptyLabel="全部模型"
                />
            </div>
        </div>
    );

    /* ─── main render ─── */

    return (
        <div className="space-y-6">
            <Card
                title="API Keys 管理"
                description="创建和管理 API Keys，设置请求限制和模型权限。数据持久化在服务端，重启不丢失。"
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void loadEntries()} disabled={loading}>
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            刷新
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                            <Plus size={14} />
                            创建 Key
                        </Button>
                    </div>
                }
                loading={loading}
            >
                {entries.length === 0 ? (
                    <EmptyState
                        title="暂无 API Key"
                        description="点击「创建 Key」按钮来添加第一个 API Key。"
                        icon={<KeyRound size={32} className="text-slate-400" />}
                    />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-neutral-800">
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead className="bg-white/95 backdrop-blur dark:bg-neutral-950/75">
                                <tr className="h-11 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 text-center dark:border-neutral-800" style={{ width: 52 }}>状态</th>
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 dark:border-neutral-800" style={{ width: 100 }}>名称</th>
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 dark:border-neutral-800">Key</th>
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 dark:border-neutral-800" style={{ width: 90 }}>每日限制</th>
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 dark:border-neutral-800" style={{ width: 90 }}>总配额</th>
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 dark:border-neutral-800" style={{ width: 160 }}>可用模型</th>
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 dark:border-neutral-800" style={{ width: 140 }}>创建时间</th>
                                    <th className="whitespace-nowrap border-b border-slate-200 px-4 dark:border-neutral-800" style={{ width: 130 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-900 dark:text-white">
                                {entries.map((entry, i) => (
                                    <tr
                                        key={entry.key}
                                        className={`h-10 transition ${entry.disabled ? "opacity-50" : ""} hover:bg-slate-50/70 dark:hover:bg-white/5`}
                                    >
                                        <td className="border-b border-slate-100 px-4 text-center align-middle dark:border-neutral-900">
                                            <button
                                                onClick={() => void handleToggleDisable(i)}
                                                title={entry.disabled ? "点击启用" : "点击禁用"}
                                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${entry.disabled
                                                    ? "text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-white/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                                    : "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                                                    }`}
                                            >
                                                <Power size={15} />
                                            </button>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 align-middle font-medium dark:border-neutral-900">
                                            <OverflowTooltip content={entry.name || "未命名"} className="block min-w-0">
                                                <span className="block min-w-0 truncate">
                                                    {entry.name || <span className="text-slate-400 dark:text-white/40">未命名</span>}
                                                </span>
                                            </OverflowTooltip>
                                        </td>
                                        <td className="whitespace-nowrap border-b border-slate-100 px-4 align-middle dark:border-neutral-900">
                                            <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
                                                {maskKey(entry.key)}
                                            </code>
                                        </td>
                                        <td className="whitespace-nowrap border-b border-slate-100 px-4 align-middle text-slate-700 dark:border-neutral-900 dark:text-white/70">
                                            <span className="inline-flex items-center gap-1">
                                                {!entry["daily-limit"] ? (
                                                    <>
                                                        <Infinity size={14} className="text-green-500" /> 无限制
                                                    </>
                                                ) : (
                                                    formatLimit(entry["daily-limit"])
                                                )}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap border-b border-slate-100 px-4 align-middle text-slate-700 dark:border-neutral-900 dark:text-white/70">
                                            <span className="inline-flex items-center gap-1">
                                                {!entry["total-quota"] ? (
                                                    <>
                                                        <Infinity size={14} className="text-green-500" /> 无限制
                                                    </>
                                                ) : (
                                                    formatLimit(entry["total-quota"])
                                                )}
                                            </span>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 align-middle text-slate-700 dark:border-neutral-900 dark:text-white/70">
                                            {entry["allowed-models"]?.length ? (
                                                <HoverTooltip
                                                    content={entry["allowed-models"].join(", ")}
                                                    className="block min-w-0"
                                                >
                                                    <span className="inline-flex items-center gap-1.5 text-xs">
                                                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-indigo-50 px-1.5 font-semibold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                                                            {entry["allowed-models"].length}
                                                        </span>
                                                        <span className="max-w-[100px] truncate text-slate-500 dark:text-white/50">
                                                            {entry["allowed-models"][0]}
                                                            {entry["allowed-models"].length > 1 ? ` 等` : ""}
                                                        </span>
                                                    </span>
                                                </HoverTooltip>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-600 dark:text-green-400">
                                                    <ShieldCheck size={14} /> 全部
                                                </span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap border-b border-slate-100 px-4 align-middle text-slate-500 dark:border-neutral-900 dark:text-white/50">
                                            {formatDate(entry["created-at"])}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 align-middle dark:border-neutral-900">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleViewUsage(entry)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-blue-400"
                                                    title="查看调用情况"
                                                >
                                                    <BarChart3 size={15} />
                                                </button>
                                                <button
                                                    onClick={() => void handleCopy(entry.key)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
                                                    title="复制 Key"
                                                >
                                                    <Copy size={15} />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenEdit(i)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
                                                    title="编辑"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteIndex(i)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                                    title="删除"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Create Modal */}
            <Modal
                open={showCreate}
                onClose={() => setShowCreate(false)}
                title="创建 API Key"
                description="填写信息并生成新的 API Key（名称为必填项）"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowCreate(false)}>
                            取消
                        </Button>
                        <Button variant="primary" onClick={() => void handleCreate()} disabled={saving}>
                            {saving ? "创建中..." : "创建"}
                        </Button>
                    </>
                }
            >
                {renderForm()}
            </Modal>

            {/* Edit Modal */}
            <Modal
                open={editIndex !== null}
                onClose={() => setEditIndex(null)}
                title="编辑 API Key"
                description="修改名称、限制和模型权限"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditIndex(null)}>
                            取消
                        </Button>
                        <Button variant="primary" onClick={() => void handleEdit()} disabled={saving}>
                            {saving ? "保存中..." : "保存"}
                        </Button>
                    </>
                }
            >
                {renderForm()}
            </Modal>

            {/* Delete Confirm */}
            <Modal
                open={deleteIndex !== null}
                onClose={() => setDeleteIndex(null)}
                title="确认删除"
                description="删除后将无法恢复，使用此 Key 的所有客户端将无法访问。"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteIndex(null)}>
                            取消
                        </Button>
                        <Button variant="danger" onClick={() => void handleDelete()} disabled={saving}>
                            {saving ? "删除中..." : "确认删除"}
                        </Button>
                    </>
                }
            >
                {deleteIndex !== null && entries[deleteIndex] && (
                    <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                        <div className="text-sm font-medium text-red-800 dark:text-red-300">
                            {entries[deleteIndex].name || "未命名"}
                        </div>
                        <code className="text-xs text-red-600 dark:text-red-400">
                            {maskKey(entries[deleteIndex].key)}
                        </code>
                    </div>
                )}
            </Modal>

            {/* Usage View — detailed call log table */}
            <Modal
                open={usageViewKey !== null}
                onClose={() => setUsageViewKey(null)}
                title={`调用情况 — ${usageViewName}`}
                description={usageViewKey ? `Key: ${maskKey(usageViewKey)}  ·  共 ${usageRows.length} 条记录` : ""}
            >
                {usageLoading ? (
                    <div className="py-8 text-center text-sm text-slate-500 dark:text-white/50">加载中...</div>
                ) : usageRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500 dark:text-white/50">暂无调用记录</div>
                ) : (
                    <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 dark:border-neutral-800">
                        <table className="w-full min-w-[700px] table-fixed border-separate border-spacing-0 text-sm">
                            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-neutral-950/75">
                                <tr className="h-11 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                                    <th className="w-48 border-b border-slate-200 px-4 dark:border-neutral-800">时间</th>
                                    <th className="w-48 border-b border-slate-200 px-4 dark:border-neutral-800">模型</th>
                                    <th className="w-16 border-b border-slate-200 px-4 dark:border-neutral-800">状态</th>
                                    <th className="w-20 border-b border-slate-200 px-4 text-right dark:border-neutral-800">用时</th>
                                    <th className="w-20 border-b border-slate-200 px-4 text-right dark:border-neutral-800">输入</th>
                                    <th className="w-20 border-b border-slate-200 px-4 text-right dark:border-neutral-800">输出</th>
                                    <th className="w-24 border-b border-slate-200 px-4 text-right dark:border-neutral-800">总 Token</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-900 dark:text-white">
                                {usageRows.map((row) => (
                                    <tr key={row.id} className="h-10 text-sm transition hover:bg-slate-50/70 dark:hover:bg-white/5">
                                        <td className="border-b border-slate-100 px-4 align-middle font-mono text-xs tabular-nums text-slate-700 dark:border-neutral-900 dark:text-slate-200">
                                            <span className="block min-w-0 truncate">{formatTimestamp(row.timestamp)}</span>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 align-middle dark:border-neutral-900">
                                            <OverflowTooltip content={row.model} className="block min-w-0">
                                                <span className="block min-w-0 truncate">{row.model}</span>
                                            </OverflowTooltip>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 align-middle dark:border-neutral-900">
                                            {row.failed ? (
                                                <span className="inline-flex min-w-[44px] justify-center rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                                    失败
                                                </span>
                                            ) : (
                                                <span className="inline-flex min-w-[44px] justify-center rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                                    成功
                                                </span>
                                            )}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums text-slate-700 dark:border-neutral-900 dark:text-slate-200">
                                            {row.latencyText}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums text-slate-700 dark:border-neutral-900 dark:text-slate-200">
                                            {row.inputTokens.toLocaleString()}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums text-slate-700 dark:border-neutral-900 dark:text-slate-200">
                                            {row.outputTokens.toLocaleString()}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums text-slate-900 dark:border-neutral-900 dark:text-white">
                                            {row.totalTokens.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Modal>
        </div>
    );
}
