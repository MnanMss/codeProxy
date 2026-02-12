import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Bot,
  Check,
  Copy,
  Database,
  FileKey,
  Globe,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { ampcodeApi, apiCallApi, getApiCallErrorMessage, providersApi } from "@/lib/http/apis";
import type { ApiCallResult, OpenAIProvider, ProviderSimpleConfig } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { Modal } from "@/modules/ui/Modal";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { TextInput } from "@/modules/ui/Input";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

const DISABLE_ALL_MODELS_RULE = "*";

const hasDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) && models.some((m) => String(m ?? "").trim() === DISABLE_ALL_MODELS_RULE);

const stripDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) ? models.filter((m) => String(m ?? "").trim() !== DISABLE_ALL_MODELS_RULE) : [];

const withDisableAllModelsRule = (models?: string[]) => [...stripDisableAllModelsRule(models), DISABLE_ALL_MODELS_RULE];
const withoutDisableAllModelsRule = (models?: string[]) => stripDisableAllModelsRule(models);

const maskApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
};

const parseHeadersJson = (text: string): { value?: Record<string, string>; error?: string } => {
  const trimmed = text.trim();
  if (!trimmed) return { value: undefined };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "headers 必须是 JSON 对象" };
    }
    const result: Record<string, string> = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
      const key = String(k ?? "").trim();
      if (!key) return;
      if (typeof v === "string") {
        const val = v.trim();
        if (val) result[key] = val;
      } else if (typeof v === "number" || typeof v === "boolean") {
        result[key] = String(v);
      }
    });
    return { value: Object.keys(result).length ? result : undefined };
  } catch {
    return { error: "headers JSON 解析失败" };
  }
};

const excludedModelsToText = (models?: string[]) => (Array.isArray(models) ? models.join("\n") : "");
const excludedModelsFromText = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const modelsFromText = (text: string) => {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return rows
    .map((line) => {
      const [left, right] = line.split("=>").map((s) => s.trim());
      if (!left) return null;
      if (!right || right === left) return { name: left };
      return { name: left, alias: right };
    })
    .filter(Boolean) as { name: string; alias?: string }[];
};

const modelsToText = (models?: { name?: string; alias?: string }[]) => {
  if (!Array.isArray(models) || models.length === 0) return "";
  return models
    .map((m) => {
      const name = String(m?.name ?? "").trim();
      const alias = String(m?.alias ?? "").trim();
      if (!name) return null;
      return alias && alias !== name ? `${name} => ${alias}` : name;
    })
    .filter(Boolean)
    .join("\n");
};

const normalizeOpenAIBaseUrl = (baseUrl: string): string => {
  let trimmed = String(baseUrl || "").trim();
  if (!trimmed) return "";
  trimmed = trimmed.replace(/\/?v0\/management\/?$/i, "");
  trimmed = trimmed.replace(/\/+$/g, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
};

const buildModelsEndpoint = (baseUrl: string): string => {
  const normalized = normalizeOpenAIBaseUrl(baseUrl);
  if (!normalized) return "";
  return `${normalized}/models`;
};

const normalizeDiscoveredModels = (payload: unknown): { id: string; owned_by?: string }[] => {
  if (!payload) return [];
  const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
  const root = isRecord(payload) ? payload : null;
  const data = root ? (root.data ?? root.models ?? payload) : payload;
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const result: { id: string; owned_by?: string }[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = String(item.id ?? item.name ?? "").trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const owned_by = typeof item.owned_by === "string" ? item.owned_by : undefined;
    result.push({ id, ...(owned_by ? { owned_by } : {}) });
  }
  return result;
};

type ProviderKeyDraft = {
  apiKey: string;
  prefix: string;
  baseUrl: string;
  proxyUrl: string;
  excludedModelsText: string;
  headersText: string;
  modelsText: string;
};

const buildProviderKeyDraft = (input?: ProviderSimpleConfig | null): ProviderKeyDraft => ({
  apiKey: input?.apiKey ?? "",
  prefix: input?.prefix ?? "",
  baseUrl: input?.baseUrl ?? "",
  proxyUrl: input?.proxyUrl ?? "",
  excludedModelsText: excludedModelsToText(input?.excludedModels),
  headersText: input?.headers ? JSON.stringify(input.headers, null, 2) : "",
  modelsText: modelsToText(input?.models),
});

type OpenAIDraft = {
  name: string;
  baseUrl: string;
  prefix: string;
  headersText: string;
  priorityText: string;
  testModel: string;
  apiKeyEntries: { apiKey: string; proxyUrl: string; headersText: string; id: string }[];
  modelsText: string;
};

const buildOpenAIDraft = (input?: OpenAIProvider | null): OpenAIDraft => ({
  name: input?.name ?? "",
  baseUrl: input?.baseUrl ?? "",
  prefix: input?.prefix ?? "",
  headersText: input?.headers ? JSON.stringify(input.headers, null, 2) : "",
  priorityText: input?.priority !== undefined ? String(input.priority) : "",
  testModel: input?.testModel ?? "",
  apiKeyEntries: Array.isArray(input?.apiKeyEntries) && input.apiKeyEntries.length
    ? input.apiKeyEntries.map((entry, idx) => ({
        id: `key-${idx}-${entry.apiKey}`,
        apiKey: entry.apiKey ?? "",
        proxyUrl: entry.proxyUrl ?? "",
        headersText: entry.headers ? JSON.stringify(entry.headers, null, 2) : "",
      }))
    : [{ id: `key-${Date.now()}`, apiKey: "", proxyUrl: "", headersText: "" }],
  modelsText: modelsToText(input?.models),
});

type AmpMappingEntry = { id: string; from: string; to: string };

const readString = (obj: Record<string, unknown> | null, ...keys: string[]): string => {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const readBool = (obj: Record<string, unknown> | null, ...keys: string[]): boolean => {
  if (!obj) return false;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.trim().toLowerCase() === "true";
    if (typeof value === "number") return value !== 0;
  }
  return false;
};

export function ProvidersPage() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<"gemini" | "claude" | "codex" | "vertex" | "openai" | "ampcode">("gemini");
  const [loading, setLoading] = useState(true);

  const [geminiKeys, setGeminiKeys] = useState<ProviderSimpleConfig[]>([]);
  const [claudeKeys, setClaudeKeys] = useState<ProviderSimpleConfig[]>([]);
  const [codexKeys, setCodexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [vertexKeys, setVertexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProvider[]>([]);

  const [ampcode, setAmpcode] = useState<Record<string, unknown> | null>(null);
  const [ampUpstreamUrl, setAmpUpstreamUrl] = useState("");
  const [ampUpstreamApiKey, setAmpUpstreamApiKey] = useState("");
  const [ampForceMappings, setAmpForceMappings] = useState(false);
  const [ampMappings, setAmpMappings] = useState<AmpMappingEntry[]>([]);

  const [editKeyOpen, setEditKeyOpen] = useState(false);
  const [editKeyType, setEditKeyType] = useState<"gemini" | "claude" | "codex" | "vertex">("gemini");
  const [editKeyIndex, setEditKeyIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState<ProviderKeyDraft>(() => buildProviderKeyDraft(null));
  const [keyDraftError, setKeyDraftError] = useState<string | null>(null);

  const [editOpenAIOpen, setEditOpenAIOpen] = useState(false);
  const [editOpenAIIndex, setEditOpenAIIndex] = useState<number | null>(null);
  const [openaiDraft, setOpenaiDraft] = useState<OpenAIDraft>(() => buildOpenAIDraft(null));
  const [openaiDraftError, setOpenaiDraftError] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<{ id: string; owned_by?: string }[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverSelected, setDiscoverSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<
    | null
    | { type: "deleteKey"; keyType: "gemini" | "claude" | "codex" | "vertex"; index: number }
    | { type: "deleteOpenAI"; index: number }
  >(null);

  const editKeyTitle =
    editKeyType === "gemini"
      ? "Gemini"
      : editKeyType === "claude"
        ? "Claude"
        : editKeyType === "codex"
          ? "Codex"
          : "Vertex";

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gemini, claude, codex, vertex, openai, amp, ampMap] = await Promise.all([
        providersApi.getGeminiKeys(),
        providersApi.getClaudeConfigs(),
        providersApi.getCodexConfigs(),
        providersApi.getVertexConfigs(),
        providersApi.getOpenAIProviders(),
        ampcodeApi.getAmpcode(),
        ampcodeApi.getModelMappings(),
      ]);
      setGeminiKeys(gemini);
      setClaudeKeys(claude);
      setCodexKeys(codex);
      setVertexKeys(vertex);
      setOpenaiProviders(openai);

      const ampObj = (amp && typeof amp === "object" && !Array.isArray(amp)) ? (amp as Record<string, unknown>) : {};
      setAmpcode(ampObj);
      setAmpUpstreamUrl(readString(ampObj, "upstreamUrl", "upstream-url"));
      setAmpForceMappings(readBool(ampObj, "forceModelMappings", "force-model-mappings"));

      const mappings = Array.isArray(ampMap) ? ampMap : [];
      const entries: AmpMappingEntry[] = mappings
        .map((item, idx) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const from = String(record.from ?? "").trim();
          const to = String(record.to ?? "").trim();
          if (!from || !to) return null;
          return { id: `map-${idx}-${from}`, from, to };
        })
        .filter(Boolean) as AmpMappingEntry[];
      setAmpMappings(entries.length ? entries : [{ id: `map-${Date.now()}`, from: "", to: "" }]);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载配置失败" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const openKeyEditor = useCallback(
    (type: "gemini" | "claude" | "codex" | "vertex", index: number | null) => {
      const list =
        type === "gemini"
          ? geminiKeys
          : type === "claude"
            ? claudeKeys
            : type === "codex"
              ? codexKeys
              : vertexKeys;
      const current = index === null ? null : list[index] ?? null;
      setEditKeyType(type);
      setEditKeyIndex(index);
      setKeyDraft(buildProviderKeyDraft(current));
      setKeyDraftError(null);
      setEditKeyOpen(true);
    },
    [claudeKeys, codexKeys, geminiKeys, vertexKeys],
  );

  const commitKeyDraft = useCallback((): ProviderSimpleConfig | null => {
    const apiKey = keyDraft.apiKey.trim();
    if (!apiKey) {
      setKeyDraftError("API Key 不能为空");
      return null;
    }

    const headersRes = parseHeadersJson(keyDraft.headersText);
    if (headersRes.error) {
      setKeyDraftError(headersRes.error);
      return null;
    }

    const result: ProviderSimpleConfig = {
      apiKey,
      ...(keyDraft.prefix.trim() ? { prefix: keyDraft.prefix.trim() } : {}),
      ...(keyDraft.baseUrl.trim() ? { baseUrl: keyDraft.baseUrl.trim() } : {}),
      ...(keyDraft.proxyUrl.trim() ? { proxyUrl: keyDraft.proxyUrl.trim() } : {}),
      ...(headersRes.value ? { headers: headersRes.value } : {}),
      ...(keyDraft.excludedModelsText.trim()
        ? { excludedModels: excludedModelsFromText(keyDraft.excludedModelsText) }
        : {}),
      ...(keyDraft.modelsText.trim() ? { models: modelsFromText(keyDraft.modelsText) } : {}),
    };

    if (editKeyType === "vertex" && result.models?.some((model) => !model.alias?.trim())) {
      setKeyDraftError("Vertex 的 models 必须使用 “name => alias” 形式（缺少 alias）");
      return null;
    }

    setKeyDraftError(null);
    return result;
  }, [editKeyType, keyDraft]);

  const saveKeyDraft = useCallback(async () => {
    const value = commitKeyDraft();
    if (!value) return;

    const type = editKeyType;
    const index = editKeyIndex;
    const apply = (list: ProviderSimpleConfig[]) => {
      if (index === null) return [...list, value];
      return list.map((item, i) => (i === index ? value : item));
    };

    try {
      if (type === "gemini") {
        const next = apply(geminiKeys);
        setGeminiKeys(next);
        await providersApi.saveGeminiKeys(next);
      } else if (type === "claude") {
        const next = apply(claudeKeys);
        setClaudeKeys(next);
        await providersApi.saveClaudeConfigs(next);
      } else if (type === "codex") {
        const next = apply(codexKeys);
        setCodexKeys(next);
        await providersApi.saveCodexConfigs(next);
      } else {
        const next = apply(vertexKeys);
        setVertexKeys(next);
        await providersApi.saveVertexConfigs(next);
      }
      notify({ type: "success", message: "已保存" });
      setEditKeyOpen(false);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    }
  }, [
    claudeKeys,
    codexKeys,
    commitKeyDraft,
    editKeyIndex,
    editKeyType,
    geminiKeys,
    notify,
    vertexKeys,
  ]);

  const deleteKey = useCallback(
    async (type: "gemini" | "claude" | "codex" | "vertex", index: number) => {
      const list =
        type === "gemini"
          ? geminiKeys
          : type === "claude"
            ? claudeKeys
            : type === "codex"
              ? codexKeys
              : vertexKeys;
      const entry = list[index];
      if (!entry) return;

      try {
        if (type === "gemini") {
          await providersApi.deleteGeminiKey(entry.apiKey);
          setGeminiKeys((prev) => prev.filter((_, i) => i !== index));
        } else if (type === "claude") {
          await providersApi.deleteClaudeConfig(entry.apiKey);
          setClaudeKeys((prev) => prev.filter((_, i) => i !== index));
        } else if (type === "codex") {
          await providersApi.deleteCodexConfig(entry.apiKey);
          setCodexKeys((prev) => prev.filter((_, i) => i !== index));
        } else {
          await providersApi.deleteVertexConfig(entry.apiKey);
          setVertexKeys((prev) => prev.filter((_, i) => i !== index));
        }
        notify({ type: "success", message: "已删除" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
      }
    },
    [claudeKeys, codexKeys, geminiKeys, notify, vertexKeys],
  );

  const toggleKeyEnabled = useCallback(
    async (type: "gemini" | "claude" | "codex", index: number, enabled: boolean) => {
      const list = type === "gemini" ? geminiKeys : type === "claude" ? claudeKeys : codexKeys;
      const current = list[index];
      if (!current) return;
      const prev = list;
      const nextExcluded = enabled ? withoutDisableAllModelsRule(current.excludedModels) : withDisableAllModelsRule(current.excludedModels);
      const nextItem: ProviderSimpleConfig = { ...current, excludedModels: nextExcluded };
      const nextList = prev.map((item, i) => (i === index ? nextItem : item));

      try {
        if (type === "gemini") {
          setGeminiKeys(nextList);
          await providersApi.saveGeminiKeys(nextList);
        } else if (type === "claude") {
          setClaudeKeys(nextList);
          await providersApi.saveClaudeConfigs(nextList);
        } else {
          setCodexKeys(nextList);
          await providersApi.saveCodexConfigs(nextList);
        }
        notify({ type: "success", message: enabled ? "已启用" : "已禁用" });
      } catch (err: unknown) {
        if (type === "gemini") setGeminiKeys(prev);
        else if (type === "claude") setClaudeKeys(prev);
        else setCodexKeys(prev);
        notify({ type: "error", message: err instanceof Error ? err.message : "更新失败" });
      }
    },
    [claudeKeys, codexKeys, geminiKeys, notify],
  );

  const openOpenAIEditor = useCallback(
    (index: number | null) => {
      const current = index === null ? null : openaiProviders[index] ?? null;
      setEditOpenAIIndex(index);
      setOpenaiDraft(buildOpenAIDraft(current));
      setOpenaiDraftError(null);
      setDiscoveredModels([]);
      setDiscoverSelected(new Set());
      setEditOpenAIOpen(true);
    },
    [openaiProviders],
  );

  const commitOpenAIDraft = useCallback((): OpenAIProvider | null => {
    const name = openaiDraft.name.trim();
    const baseUrl = openaiDraft.baseUrl.trim();
    if (!name) {
      setOpenaiDraftError("name 不能为空");
      return null;
    }
    if (!baseUrl) {
      setOpenaiDraftError("baseUrl 不能为空");
      return null;
    }

    const headersRes = parseHeadersJson(openaiDraft.headersText);
    if (headersRes.error) {
      setOpenaiDraftError(headersRes.error);
      return null;
    }

    const priorityText = openaiDraft.priorityText.trim();
    const priority =
      priorityText !== ""
        ? Number.isFinite(Number(priorityText))
          ? Number(priorityText)
          : NaN
        : undefined;
    if (priority !== undefined && !Number.isFinite(priority)) {
      setOpenaiDraftError("priority 必须是数字");
      return null;
    }

    const apiKeyEntries = openaiDraft.apiKeyEntries
      .map((entry) => {
        const apiKey = entry.apiKey.trim();
        if (!apiKey) return null;
        const entryHeadersRes = parseHeadersJson(entry.headersText);
        if (entryHeadersRes.error) {
          throw new Error(`apiKeyEntries headers 解析失败：${entryHeadersRes.error}`);
        }
        return {
          apiKey,
          ...(entry.proxyUrl.trim() ? { proxyUrl: entry.proxyUrl.trim() } : {}),
          ...(entryHeadersRes.value ? { headers: entryHeadersRes.value } : {}),
        };
      })
      .filter(Boolean) as OpenAIProvider["apiKeyEntries"];

    if (!apiKeyEntries || apiKeyEntries.length === 0) {
      setOpenaiDraftError("至少需要一个 apiKeyEntry");
      return null;
    }

    const models = openaiDraft.modelsText.trim() ? modelsFromText(openaiDraft.modelsText) : undefined;

    setOpenaiDraftError(null);

    return {
      name,
      baseUrl,
      ...(openaiDraft.prefix.trim() ? { prefix: openaiDraft.prefix.trim() } : {}),
      ...(headersRes.value ? { headers: headersRes.value } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(openaiDraft.testModel.trim() ? { testModel: openaiDraft.testModel.trim() } : {}),
      ...(models ? { models } : {}),
      apiKeyEntries,
    };
  }, [openaiDraft]);

  const saveOpenAIDraft = useCallback(async () => {
    try {
      const value = commitOpenAIDraft();
      if (!value) return;

      const index = editOpenAIIndex;
      const next = index === null ? [...openaiProviders, value] : openaiProviders.map((p, i) => (i === index ? value : p));

      setOpenaiProviders(next);
      await providersApi.saveOpenAIProviders(next);
      notify({ type: "success", message: "已保存" });
      setEditOpenAIOpen(false);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    }
  }, [commitOpenAIDraft, editOpenAIIndex, notify, openaiProviders]);

  const deleteOpenAIProvider = useCallback(
    async (index: number) => {
      const entry = openaiProviders[index];
      if (!entry) return;
      try {
        await providersApi.deleteOpenAIProvider(entry.name);
        setOpenaiProviders((prev) => prev.filter((_, i) => i !== index));
        notify({ type: "success", message: "已删除" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
      }
    },
    [notify, openaiProviders],
  );

  const discoverModels = useCallback(async () => {
    const baseUrl = openaiDraft.baseUrl.trim();
    if (!baseUrl) {
      notify({ type: "info", message: "请先填写 baseUrl" });
      return;
    }

    setDiscovering(true);
    setDiscoveredModels([]);
    setDiscoverSelected(new Set());
    try {
      const endpoint = buildModelsEndpoint(baseUrl);
      const headersRes = parseHeadersJson(openaiDraft.headersText);
      if (headersRes.error) {
        notify({ type: "error", message: headersRes.error });
        return;
      }
      const headers: Record<string, string> = headersRes.value ? { ...headersRes.value } : {};
      const hasAuthHeader = Boolean(headers.Authorization || (headers as any).authorization);
      const firstKey = openaiDraft.apiKeyEntries.find((entry) => entry.apiKey.trim())?.apiKey.trim();
      if (!hasAuthHeader && firstKey) {
        headers.Authorization = `Bearer ${firstKey}`;
      }

      const result: ApiCallResult = await apiCallApi.request({
        method: "GET",
        url: endpoint,
        header: Object.keys(headers).length ? headers : undefined,
      });
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }
      const list = normalizeDiscoveredModels(result.body ?? result.bodyText);
      setDiscoveredModels(list);
      setDiscoverSelected(new Set(list.map((m) => m.id)));
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "拉取模型失败" });
    } finally {
      setDiscovering(false);
    }
  }, [notify, openaiDraft.apiKeyEntries, openaiDraft.baseUrl, openaiDraft.headersText]);

  const applyDiscoveredModels = useCallback(() => {
    const selected = new Set(discoverSelected);
    const picked = discoveredModels.filter((m) => selected.has(m.id));
    if (picked.length === 0) {
      notify({ type: "info", message: "未选择任何模型" });
      return;
    }

    const current = modelsFromText(openaiDraft.modelsText);
    const seen = new Set(current.map((m) => m.name.toLowerCase()));
    const merged = [...current];
    for (const model of picked) {
      const key = model.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ name: model.id });
    }
    setOpenaiDraft((prev) => ({ ...prev, modelsText: modelsToText(merged) }));
    notify({ type: "success", message: "已合并模型列表" });
  }, [discoverSelected, discoveredModels, notify, openaiDraft.modelsText]);

  const saveAmpcode = useCallback(async () => {
    try {
      const upstreamUrl = ampUpstreamUrl.trim();
      if (upstreamUrl) {
        await ampcodeApi.updateUpstreamUrl(upstreamUrl);
      } else {
        await ampcodeApi.clearUpstreamUrl();
      }

      const upstreamKey = ampUpstreamApiKey.trim();
      if (upstreamKey) {
        await ampcodeApi.updateUpstreamApiKey(upstreamKey);
      }

      await ampcodeApi.updateForceModelMappings(ampForceMappings);

      const mappings = ampMappings
        .map((m) => ({ from: m.from.trim(), to: m.to.trim() }))
        .filter((m) => m.from && m.to);
      await ampcodeApi.patchModelMappings(mappings);

      notify({ type: "success", message: "Ampcode 配置已保存" });
      startTransition(() => void refreshAll());
      setAmpUpstreamApiKey("");
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    }
  }, [ampForceMappings, ampMappings, ampUpstreamApiKey, ampUpstreamUrl, notify, refreshAll, startTransition]);

  const copyMasked = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        notify({ type: "success", message: "已复制" });
      } catch {
        notify({ type: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  return (
    <div className="space-y-6">
      <Card
        title="配置总览"
        description="加载配置后可在各标签页进行编辑与保存。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void refreshAll()} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              刷新
            </Button>
          </div>
        }
        loading={loading}
      >
        <Tabs value={tab} onValueChange={(next) => setTab(next as typeof tab)}>
          <TabsList>
            <TabsTrigger value="gemini">Gemini</TabsTrigger>
            <TabsTrigger value="claude">Claude</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
            <TabsTrigger value="vertex">Vertex</TabsTrigger>
            <TabsTrigger value="openai">OpenAI 兼容</TabsTrigger>
            <TabsTrigger value="ampcode">Ampcode</TabsTrigger>
          </TabsList>

          <TabsContent value="gemini">
            <ProviderKeyListCard
              icon={Globe}
              title="Gemini Keys"
              description="API Key / Prefix / Base URL / Excluded Models / Headers / Models"
              items={geminiKeys}
              onAdd={() => openKeyEditor("gemini", null)}
              onEdit={(idx) => openKeyEditor("gemini", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "gemini", index: idx })}
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("gemini", idx, enabled)}
              onCopy={(idx) => void copyMasked((geminiKeys[idx]?.apiKey ?? "").trim())}
            />
          </TabsContent>

          <TabsContent value="claude">
            <ProviderKeyListCard
              icon={Bot}
              title="Claude Keys"
              description="支持 Excluded Models（用 * 一键禁用）以及自定义模型列表。"
              items={claudeKeys}
              onAdd={() => openKeyEditor("claude", null)}
              onEdit={(idx) => openKeyEditor("claude", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "claude", index: idx })}
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("claude", idx, enabled)}
              onCopy={(idx) => void copyMasked((claudeKeys[idx]?.apiKey ?? "").trim())}
            />
          </TabsContent>

          <TabsContent value="codex">
            <ProviderKeyListCard
              icon={FileKey}
              title="Codex Keys"
              description="支持 baseUrl / proxyUrl / headers 等配置。"
              items={codexKeys}
              onAdd={() => openKeyEditor("codex", null)}
              onEdit={(idx) => openKeyEditor("codex", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "codex", index: idx })}
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("codex", idx, enabled)}
              onCopy={(idx) => void copyMasked((codexKeys[idx]?.apiKey ?? "").trim())}
            />
          </TabsContent>

          <TabsContent value="vertex">
            <ProviderKeyListCard
              icon={Database}
              title="Vertex Keys"
              description="支持模型映射（通过 models 列表维护 name=>alias）。"
              items={vertexKeys}
              onAdd={() => openKeyEditor("vertex", null)}
              onEdit={(idx) => openKeyEditor("vertex", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "vertex", index: idx })}
              onCopy={(idx) => void copyMasked((vertexKeys[idx]?.apiKey ?? "").trim())}
            />
          </TabsContent>

          <TabsContent value="openai">
            <Card
              title="OpenAI 兼容提供商"
              description="多密钥管理、模型别名与模型发现（通过 api-call 拉取 /models）。"
              actions={
                <Button variant="primary" size="sm" onClick={() => openOpenAIEditor(null)} disabled={loading}>
                  <Plus size={14} />
                  新增提供商
                </Button>
              }
            >
              {openaiProviders.length === 0 ? (
                <EmptyState title="暂无 OpenAI 提供商" description="点击“新增提供商”开始配置。" />
              ) : (
                <div className="space-y-3">
                  {openaiProviders.map((provider, idx) => (
                    <div
                      key={`${provider.name}:${idx}`}
                      className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {provider.name}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                            baseUrl：{provider.baseUrl || "--"}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                            keys：{provider.apiKeyEntries?.length ?? 0} · models：{provider.models?.length ?? 0}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" size="sm" onClick={() => openOpenAIEditor(idx)}>
                            <Settings2 size={14} />
                            编辑
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setConfirm({ type: "deleteOpenAI", index: idx })}>
                            <Trash2 size={14} />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="ampcode">
            <Card
              title="Ampcode 集成"
              description="配置上游 URL / API Key、模型映射与强制映射开关。"
              actions={
                <Button variant="primary" size="sm" onClick={() => void saveAmpcode()} disabled={loading || isPending}>
                  <Save size={14} />
                  保存
                </Button>
              }
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <TextInput
                    value={ampUpstreamUrl}
                    onChange={(e) => setAmpUpstreamUrl(e.currentTarget.value)}
                    placeholder="upstream-url（为空则清除）"
                  />
                  <TextInput
                    value={ampUpstreamApiKey}
                    onChange={(e) => setAmpUpstreamApiKey(e.currentTarget.value)}
                    placeholder="upstream-api-key（仅用于更新；为空不改）"
                  />
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <ToggleSwitch
                      label="强制模型映射"
                      description="开启后仅允许映射列表中的模型。"
                      checked={ampForceMappings}
                      onCheckedChange={setAmpForceMappings}
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <p className="text-xs text-slate-600 dark:text-white/65">
                      当前：{ampcode ? "已加载" : "未加载"} · 映射 {ampMappings.length} 条
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">模型映射</p>
                  {ampMappings.map((entry, idx) => (
                    <div key={entry.id} className="grid gap-2 md:grid-cols-12">
                      <div className="md:col-span-5">
                        <TextInput
                          value={entry.from}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setAmpMappings((prev) => prev.map((it, i) => (i === idx ? { ...it, from: value } : it)));
                          }}
                          placeholder="from"
                        />
                      </div>
                      <div className="md:col-span-5">
                        <TextInput
                          value={entry.to}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setAmpMappings((prev) => prev.map((it, i) => (i === idx ? { ...it, to: value } : it)));
                          }}
                          placeholder="to"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-center justify-end">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setAmpMappings((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={ampMappings.length <= 1}
                          aria-label="删除映射"
                          title="删除映射"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAmpMappings((prev) => [...prev, { id: `map-${Date.now()}`, from: "", to: "" }])}
                    >
                      <Plus size={14} />
                      新增
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAmpMappings([{ id: `map-${Date.now()}`, from: "", to: "" }])}
                    >
                      清空
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </Card>

      <Modal
        open={editKeyOpen}
        title={`${editKeyIndex === null ? "新增" : "编辑"} ${editKeyTitle} 配置`}
        description="支持 Excluded Models（每行一个；用 * 一键禁用全部模型）、Headers（JSON 对象）与 Models（name 或 name => alias）。"
        onClose={() => setEditKeyOpen(false)}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {keyDraftError ? <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">{keyDraftError}</span> : null}
            <Button variant="secondary" onClick={() => setEditKeyOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void saveKeyDraft()}>
              <Check size={14} />
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <TextInput
            value={keyDraft.apiKey}
            onChange={(e) => setKeyDraft((prev) => ({ ...prev, apiKey: e.currentTarget.value }))}
            placeholder="apiKey"
          />
          <TextInput
            value={keyDraft.prefix}
            onChange={(e) => setKeyDraft((prev) => ({ ...prev, prefix: e.currentTarget.value }))}
            placeholder="prefix（可选）"
          />
          <TextInput
            value={keyDraft.baseUrl}
            onChange={(e) => setKeyDraft((prev) => ({ ...prev, baseUrl: e.currentTarget.value }))}
            placeholder="baseUrl（可选）"
          />
          <TextInput
            value={keyDraft.proxyUrl}
            onChange={(e) => setKeyDraft((prev) => ({ ...prev, proxyUrl: e.currentTarget.value }))}
            placeholder="proxyUrl（可选）"
          />
          <textarea
            value={keyDraft.excludedModelsText}
            onChange={(e) => setKeyDraft((prev) => ({ ...prev, excludedModelsText: e.currentTarget.value }))}
            placeholder="excludedModels（每行一个；用 * 一键禁用）"
            aria-label="excludedModels"
            className="min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
          />
          <textarea
            value={keyDraft.headersText}
            onChange={(e) => setKeyDraft((prev) => ({ ...prev, headersText: e.currentTarget.value }))}
            placeholder="headers（JSON 对象，可选）"
            aria-label="headers"
            className="min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
          />
          <textarea
            value={keyDraft.modelsText}
            onChange={(e) => setKeyDraft((prev) => ({ ...prev, modelsText: e.currentTarget.value }))}
            placeholder="models（每行一个：name 或 name => alias）"
            aria-label="models"
            className="min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
          />
        </div>
      </Modal>

      <Modal
        open={editOpenAIOpen}
        title={`${editOpenAIIndex === null ? "新增" : "编辑"} OpenAI 提供商`}
        description="配置 name/baseUrl、多个 apiKeyEntries、headers 与模型别名。"
        onClose={() => setEditOpenAIOpen(false)}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {openaiDraftError ? (
              <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">{openaiDraftError}</span>
            ) : null}
            <Button variant="secondary" onClick={() => setEditOpenAIOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void saveOpenAIDraft()}>
              <Check size={14} />
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <TextInput
            value={openaiDraft.name}
            onChange={(e) => setOpenaiDraft((prev) => ({ ...prev, name: e.currentTarget.value }))}
            placeholder="name"
          />
          <TextInput
            value={openaiDraft.baseUrl}
            onChange={(e) => setOpenaiDraft((prev) => ({ ...prev, baseUrl: e.currentTarget.value }))}
            placeholder="baseUrl"
          />
          <TextInput
            value={openaiDraft.prefix}
            onChange={(e) => setOpenaiDraft((prev) => ({ ...prev, prefix: e.currentTarget.value }))}
            placeholder="prefix（可选）"
          />
          <div className="grid gap-2 md:grid-cols-2">
            <TextInput
              value={openaiDraft.priorityText}
              onChange={(e) => setOpenaiDraft((prev) => ({ ...prev, priorityText: e.currentTarget.value }))}
              placeholder="priority（可选，数字）"
              inputMode="numeric"
            />
            <TextInput
              value={openaiDraft.testModel}
              onChange={(e) => setOpenaiDraft((prev) => ({ ...prev, testModel: e.currentTarget.value }))}
              placeholder="test-model（可选）"
            />
          </div>
          <textarea
            value={openaiDraft.headersText}
            onChange={(e) => setOpenaiDraft((prev) => ({ ...prev, headersText: e.currentTarget.value }))}
            placeholder="headers（JSON 对象，可选）"
            aria-label="OpenAI Provider headers"
            className="min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
          />

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">API Key Entries</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setOpenaiDraft((prev) => ({
                    ...prev,
                    apiKeyEntries: [
                      ...prev.apiKeyEntries,
                      { id: `key-${Date.now()}`, apiKey: "", proxyUrl: "", headersText: "" },
                    ],
                  }))
                }
              >
                <Plus size={14} />
                新增
              </Button>
            </div>
            <div className="space-y-3">
              {openaiDraft.apiKeyEntries.map((entry, idx) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950/70">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                      Entry {idx + 1}
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.filter((_, i) => i !== idx),
                        }))
                      }
                      disabled={openaiDraft.apiKeyEntries.length <= 1}
                    >
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <TextInput
                      value={entry.apiKey}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.map((it, i) => (i === idx ? { ...it, apiKey: value } : it)),
                        }));
                      }}
                      placeholder="apiKey"
                    />
                    <TextInput
                      value={entry.proxyUrl}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.map((it, i) => (i === idx ? { ...it, proxyUrl: value } : it)),
                        }));
                      }}
                      placeholder="proxyUrl（可选）"
                    />
                  </div>
                  <textarea
                    value={entry.headersText}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setOpenaiDraft((prev) => ({
                        ...prev,
                        apiKeyEntries: prev.apiKeyEntries.map((it, i) => (i === idx ? { ...it, headersText: value } : it)),
                      }));
                    }}
                    placeholder="headers（JSON 对象，可选）"
                    aria-label={`OpenAI Entry ${idx + 1} headers`}
                    className="mt-2 min-h-[90px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Models</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void discoverModels()} disabled={discovering}>
                  <RefreshCw size={14} className={discovering ? "animate-spin" : ""} />
                  拉取 /models
                </Button>
                <Button variant="secondary" size="sm" onClick={applyDiscoveredModels} disabled={discoveredModels.length === 0}>
                  <Check size={14} />
                  合并所选
                </Button>
              </div>
            </div>
            <textarea
              value={openaiDraft.modelsText}
              onChange={(e) => setOpenaiDraft((prev) => ({ ...prev, modelsText: e.currentTarget.value }))}
              placeholder="每行一个：name 或 name => alias"
              aria-label="OpenAI Provider models"
              className="min-h-[140px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
            />
            {discoveredModels.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <p className="text-xs text-slate-600 dark:text-white/65">发现 {discoveredModels.length} 个模型（默认全选）</p>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {discoveredModels.map((model) => {
                    const checked = discoverSelected.has(model.id);
                    return (
                      <label
                        key={model.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-xs font-mono ${
                          checked ? "bg-slate-900 text-white dark:bg-white dark:text-neutral-950" : "hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setDiscoverSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(model.id)) next.delete(model.id);
                              else next.add(model.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
                        />
                        <span className="truncate">{model.id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirm !== null}
        title="确认删除"
        description={
          confirm?.type === "deleteOpenAI"
            ? `确定要删除 OpenAI 提供商 “${openaiProviders[confirm.index]?.name ?? ""}” 吗？此操作不可恢复。`
            : confirm?.type === "deleteKey"
              ? "确定要删除该配置吗？此操作不可恢复。"
              : "确定要删除吗？"
        }
        confirmText="删除"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (!action) return;
          if (action.type === "deleteOpenAI") {
            void deleteOpenAIProvider(action.index);
            return;
          }
          void deleteKey(action.keyType, action.index);
        }}
      />
    </div>
  );
}

function ProviderKeyListCard({
  icon: Icon,
  title,
  description,
  items,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
  onCopy,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
  items: ProviderSimpleConfig[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggleEnabled?: (index: number, enabled: boolean) => void;
  onCopy: (index: number) => void;
}) {
  return (
    <Card
      title={title}
      description={description}
      actions={
        <Button variant="primary" size="sm" onClick={onAdd}>
          <Plus size={14} />
          新增
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="暂无配置" description="点击“新增”创建第一条配置。" />
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const disabled = hasDisableAllModelsRule(item.excludedModels);
            return (
              <div
                key={`${item.apiKey}:${idx}`}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Icon size={16} className="text-slate-900 dark:text-white" />
                      <span className="truncate">{maskApiKey(item.apiKey)}</span>
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                      prefix：{item.prefix || "--"} · baseUrl：{item.baseUrl || "--"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                      excluded：{item.excludedModels?.length ?? 0} · models：{item.models?.length ?? 0} · headers：
                      {item.headers ? Object.keys(item.headers).length : 0}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onToggleEnabled ? (
                      <ToggleSwitch
                        label="启用"
                        checked={!disabled}
                        onCheckedChange={(enabled) => onToggleEnabled(idx, enabled)}
                      />
                    ) : null}
                    <Button variant="secondary" size="sm" onClick={() => onCopy(idx)} title="复制 API Key">
                      <Copy size={14} />
                      复制
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(idx)}>
                      <Settings2 size={14} />
                      编辑
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => onDelete(idx)}>
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
