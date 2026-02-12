import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from "@/lib/http/apis";
import type { ApiCallResult, AuthFileItem } from "@/lib/http/types";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";

const DEFAULT_ANTIGRAVITY_PROJECT_ID = "bamboo-precept-lgxtn";

const ANTIGRAVITY_QUOTA_URLS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
];

const ANTIGRAVITY_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "antigravity/1.11.5 windows/amd64",
};

const GEMINI_CLI_QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const GEMINI_CLI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
};

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
};

const KIRO_QUOTA_URL = "https://codewhisperer.us-east-1.amazonaws.com";
const KIRO_REQUEST_HEADERS = {
  "Content-Type": "application/x-amz-json-1.0",
  "x-amz-target": "AmazonCodeWhispererService.GetUsageLimits",
  Authorization: "Bearer $TOKEN$",
};

const KIRO_REQUEST_BODY = JSON.stringify({
  origin: "AI_EDITOR",
  resourceType: "AGENTIC_REQUEST",
});

type QuotaStatus = "idle" | "loading" | "success" | "error";

type QuotaItem = {
  label: string;
  percent: number | null;
  resetLabel?: string;
  meta?: string;
};

type QuotaState = {
  status: QuotaStatus;
  items: QuotaItem[];
  error?: string;
  updatedAt?: number;
};

const normalizeAuthIndexValue = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const normalizeStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
};

const normalizeNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeQuotaFraction = (value: unknown): number | null => {
  const normalized = normalizeNumberValue(value);
  if (normalized !== null) return normalized;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith("%")) {
      const parsed = Number(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed / 100 : null;
    }
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseIdTokenPayload = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore
  }
  const segments = trimmed.split(".");
  if (segments.length < 2) return null;
  try {
    const normalized = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = typeof window.atob === "function" ? window.atob(padded) : atob(padded);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const resolveAuthProvider = (file: AuthFileItem): string => {
  const raw = (file.provider ?? file.type ?? "") as unknown;
  return String(raw).trim().toLowerCase();
};

const isDisabledAuthFile = (file: AuthFileItem): boolean => {
  const raw = file.disabled as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
};

const formatResetTime = (value?: string): string => {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatUnixSeconds = (seconds?: number | null): string => {
  if (!seconds) return "--";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

function QuotaBar({ percent }: { percent: number | null }) {
  const segments = 20;
  const normalized = percent === null ? null : clampPercent(percent);
  const filled = normalized === null ? 0 : Math.round((normalized / 100) * segments);
  const tone =
    normalized === null
      ? "bg-slate-300/50 dark:bg-white/10"
      : normalized >= 60
        ? "bg-emerald-500"
        : normalized >= 20
          ? "bg-amber-500"
          : "bg-rose-500";

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }).map((_, idx) => (
        <span
          key={idx}
          className={[
            "h-2 flex-1 rounded-full",
            idx < filled ? tone : "bg-slate-200 dark:bg-neutral-800",
          ].join(" ")}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

type AntigravityQuotaInfo = {
  displayName?: string;
  quotaInfo?: {
    remainingFraction?: number | string;
    remaining_fraction?: number | string;
    remaining?: number | string;
    resetTime?: string;
    reset_time?: string;
  };
  quota_info?: {
    remainingFraction?: number | string;
    remaining_fraction?: number | string;
    remaining?: number | string;
    resetTime?: string;
    reset_time?: string;
  };
};

type AntigravityModelsPayload = Record<string, AntigravityQuotaInfo>;

const ANTIGRAVITY_QUOTA_GROUPS: { id: string; label: string; identifiers: string[]; labelFromModel?: boolean }[] = [
  {
    id: "claude-gpt",
    label: "Claude/GPT",
    identifiers: ["claude-sonnet-4-5-thinking", "claude-opus-4-5-thinking", "claude-sonnet-4-5", "gpt-oss-120b-medium"],
  },
  { id: "gemini-3-pro", label: "Gemini 3 Pro", identifiers: ["gemini-3-pro-high", "gemini-3-pro-low"] },
  { id: "gemini-2-5-flash", label: "Gemini 2.5 Flash", identifiers: ["gemini-2.5-flash", "gemini-2.5-flash-thinking"] },
  { id: "gemini-2-5-flash-lite", label: "Gemini 2.5 Flash Lite", identifiers: ["gemini-2.5-flash-lite"] },
  { id: "gemini-2-5-cu", label: "Gemini 2.5 CU", identifiers: ["rev19-uic3-1p"] },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", identifiers: ["gemini-3-flash"] },
  { id: "gemini-image", label: "gemini-3-pro-image", identifiers: ["gemini-3-pro-image"], labelFromModel: true },
];

const findAntigravityModel = (models: AntigravityModelsPayload, identifier: string) => {
  const direct = models[identifier];
  if (direct) return { id: identifier, entry: direct };
  const match = Object.entries(models).find(([, entry]) => {
    const name = typeof entry?.displayName === "string" ? entry.displayName : "";
    return name.toLowerCase() === identifier.toLowerCase();
  });
  return match ? { id: match[0], entry: match[1] } : null;
};

const getAntigravityQuotaInfo = (entry?: AntigravityQuotaInfo) => {
  if (!entry) return { remainingFraction: null as number | null };
  const quotaInfo = (entry.quotaInfo ?? entry.quota_info ?? {}) as Record<string, unknown>;
  const remainingValue = quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction ?? quotaInfo.remaining;
  const remainingFraction = normalizeQuotaFraction(remainingValue);
  const resetValue = quotaInfo.resetTime ?? quotaInfo.reset_time;
  const resetTime = typeof resetValue === "string" ? resetValue : undefined;
  const displayName = typeof entry.displayName === "string" ? entry.displayName : undefined;
  return { remainingFraction, resetTime, displayName };
};

const buildAntigravityGroups = (models: AntigravityModelsPayload) => {
  const groups: { id: string; label: string; remainingFraction: number; resetTime?: string }[] = [];
  let geminiProResetTime: string | undefined;

  const buildGroup = (def: (typeof ANTIGRAVITY_QUOTA_GROUPS)[number], overrideResetTime?: string) => {
    const matches = def.identifiers
      .map((identifier) => findAntigravityModel(models, identifier))
      .filter(Boolean) as { id: string; entry: AntigravityQuotaInfo }[];

    const quotaEntries = matches
      .map(({ id, entry }) => {
        const info = getAntigravityQuotaInfo(entry);
        const remainingFraction = info.remainingFraction ?? (info.resetTime ? 0 : null);
        if (remainingFraction === null) return null;
        return { id, remainingFraction, resetTime: info.resetTime, displayName: info.displayName };
      })
      .filter(Boolean) as { id: string; remainingFraction: number; resetTime?: string; displayName?: string }[];

    if (quotaEntries.length === 0) return null;
    const remainingFraction = Math.min(...quotaEntries.map((entry) => entry.remainingFraction));
    const resetTime = overrideResetTime ?? quotaEntries.map((entry) => entry.resetTime).find(Boolean);
    const displayName = quotaEntries.map((entry) => entry.displayName).find(Boolean);
    const label = def.labelFromModel && displayName ? displayName : def.label;
    return { id: def.id, label, remainingFraction, resetTime };
  };

  const claude = buildGroup(ANTIGRAVITY_QUOTA_GROUPS[0]);
  if (claude) groups.push(claude);
  const geminiPro = buildGroup(ANTIGRAVITY_QUOTA_GROUPS[1]);
  if (geminiPro) {
    geminiProResetTime = geminiPro.resetTime;
    groups.push(geminiPro);
  }
  for (const def of ANTIGRAVITY_QUOTA_GROUPS.slice(2, 6)) {
    const group = buildGroup(def);
    if (group) groups.push(group);
  }
  const image = buildGroup(ANTIGRAVITY_QUOTA_GROUPS[6], geminiProResetTime);
  if (image) groups.push(image);

  return groups;
};

type GeminiCliQuotaBucket = {
  modelId?: string;
  model_id?: string;
  tokenType?: string;
  token_type?: string;
  remainingFraction?: number | string;
  remaining_fraction?: number | string;
  remainingAmount?: number | string;
  remaining_amount?: number | string;
  resetTime?: string;
  reset_time?: string;
};

type GeminiCliQuotaPayload = { buckets?: GeminiCliQuotaBucket[] };

const normalizeGeminiCliModelId = (value: unknown): string | null => {
  const modelId = normalizeStringValue(value);
  if (!modelId) return null;
  const suffix = "_vertex";
  if (modelId.endsWith(suffix)) return modelId.slice(0, -suffix.length);
  return modelId;
};

const GEMINI_CLI_IGNORED_MODEL_PREFIXES = ["gemini-2.0-flash"];
const isIgnoredGeminiCliModel = (modelId: string): boolean =>
  GEMINI_CLI_IGNORED_MODEL_PREFIXES.some((prefix) => modelId === prefix || modelId.startsWith(`${prefix}-`));

const GEMINI_CLI_GROUPS: { id: string; label: string; preferredModelId?: string; modelIds: string[] }[] = [
  { id: "gemini-flash-lite-series", label: "Gemini Flash Lite Series", preferredModelId: "gemini-2.5-flash-lite", modelIds: ["gemini-2.5-flash-lite"] },
  { id: "gemini-flash-series", label: "Gemini Flash Series", preferredModelId: "gemini-3-flash-preview", modelIds: ["gemini-3-flash-preview", "gemini-2.5-flash"] },
  { id: "gemini-pro-series", label: "Gemini Pro Series", preferredModelId: "gemini-3-pro-preview", modelIds: ["gemini-3-pro-preview", "gemini-2.5-pro"] },
];

const GEMINI_GROUP_ORDER = new Map(GEMINI_CLI_GROUPS.map((group, idx) => [group.id, idx] as const));
const GEMINI_GROUP_LOOKUP = new Map(
  GEMINI_CLI_GROUPS.flatMap((group) => group.modelIds.map((id) => [id, group] as const)),
);

const pickEarlierResetTime = (current?: string, next?: string): string | undefined => {
  if (!current) return next;
  if (!next) return current;
  const currentTime = new Date(current).getTime();
  const nextTime = new Date(next).getTime();
  if (Number.isNaN(currentTime)) return next;
  if (Number.isNaN(nextTime)) return current;
  return currentTime <= nextTime ? current : next;
};

const minNullableNumber = (current: number | null, next: number | null): number | null => {
  if (current === null) return next;
  if (next === null) return current;
  return Math.min(current, next);
};

const buildGeminiCliBuckets = (
  buckets: { modelId: string; tokenType: string | null; remainingFraction: number | null; remainingAmount: number | null; resetTime?: string }[],
) => {
  if (!buckets.length) return [];

  type Group = {
    id: string;
    label: string;
    tokenType: string | null;
    modelIds: string[];
    preferredModelId?: string;
    preferredBucket?: typeof buckets[number];
    fallbackRemainingFraction: number | null;
    fallbackRemainingAmount: number | null;
    fallbackResetTime: string | undefined;
  };

  const grouped = new Map<string, Group>();
  for (const bucket of buckets) {
    if (isIgnoredGeminiCliModel(bucket.modelId)) continue;
    const group = GEMINI_GROUP_LOOKUP.get(bucket.modelId);
    const groupId = group?.id ?? bucket.modelId;
    const label = group?.label ?? bucket.modelId;
    const tokenKey = bucket.tokenType ?? "";
    const mapKey = `${groupId}::${tokenKey}`;
    const existing = grouped.get(mapKey);
    if (!existing) {
      const preferredModelId = group?.preferredModelId;
      grouped.set(mapKey, {
        id: `${groupId}${tokenKey ? `-${tokenKey}` : ""}`,
        label,
        tokenType: bucket.tokenType,
        modelIds: [bucket.modelId],
        preferredModelId,
        preferredBucket: preferredModelId && bucket.modelId === preferredModelId ? bucket : undefined,
        fallbackRemainingFraction: bucket.remainingFraction,
        fallbackRemainingAmount: bucket.remainingAmount,
        fallbackResetTime: bucket.resetTime,
      });
      continue;
    }

    existing.modelIds.push(bucket.modelId);
    existing.fallbackRemainingFraction = minNullableNumber(existing.fallbackRemainingFraction, bucket.remainingFraction);
    existing.fallbackRemainingAmount = minNullableNumber(existing.fallbackRemainingAmount, bucket.remainingAmount);
    existing.fallbackResetTime = pickEarlierResetTime(existing.fallbackResetTime, bucket.resetTime);
    if (existing.preferredModelId && bucket.modelId === existing.preferredModelId) {
      existing.preferredBucket = bucket;
    }
  }

  const toOrder = (bucket: Group): number => {
    const tokenSuffix = bucket.tokenType ? `-${bucket.tokenType}` : "";
    const groupId = bucket.id.endsWith(tokenSuffix) ? bucket.id.slice(0, bucket.id.length - tokenSuffix.length) : bucket.id;
    return GEMINI_GROUP_ORDER.get(groupId) ?? Number.MAX_SAFE_INTEGER;
  };

  return Array.from(grouped.values())
    .sort((a, b) => {
      const diff = toOrder(a) - toOrder(b);
      if (diff !== 0) return diff;
      const ta = a.tokenType ?? "";
      const tb = b.tokenType ?? "";
      return ta.localeCompare(tb);
    })
    .map((group) => {
      const uniqueModelIds = Array.from(new Set(group.modelIds));
      const preferred = group.preferredBucket;
      const remainingFraction = preferred ? preferred.remainingFraction : group.fallbackRemainingFraction;
      const remainingAmount = preferred ? preferred.remainingAmount : group.fallbackRemainingAmount;
      const resetTime = preferred ? preferred.resetTime : group.fallbackResetTime;
      return { id: group.id, label: group.label, tokenType: group.tokenType, remainingFraction, remainingAmount, resetTime, modelIds: uniqueModelIds };
    });
};

const extractGeminiCliProjectId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (!matches.length) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
};

const resolveGeminiCliProjectId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? (file.metadata as Record<string, unknown>) : null;
  const attributes = isRecord(file.attributes) ? (file.attributes as Record<string, unknown>) : null;
  const candidates = [file.account, (file as any)["account"], metadata?.account, attributes?.account];
  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }
  return null;
};

const extractCodexChatgptAccountId = (value: unknown): string | null => {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return normalizeStringValue(payload.chatgpt_account_id ?? payload.chatgptAccountId);
};

const resolveCodexChatgptAccountId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? (file.metadata as Record<string, unknown>) : null;
  const attributes = isRecord(file.attributes) ? (file.attributes as Record<string, unknown>) : null;
  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];
  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }
  return null;
};

const resolveAntigravityProjectId = async (file: AuthFileItem): Promise<string> => {
  try {
    const text = await authFilesApi.downloadText(file.name);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const top = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (top) return top;

    const installed = isRecord(parsed.installed) ? (parsed.installed as Record<string, unknown>) : null;
    const installedId = installed ? normalizeStringValue(installed.project_id ?? installed.projectId) : null;
    if (installedId) return installedId;

    const web = isRecord(parsed.web) ? (parsed.web as Record<string, unknown>) : null;
    const webId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webId) return webId;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }
  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

const parseAntigravityPayload = (payload: unknown): Record<string, unknown> | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as Record<string, unknown>;
  return null;
};

const parseGeminiCliQuotaPayload = (payload: unknown): GeminiCliQuotaPayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as GeminiCliQuotaPayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as GeminiCliQuotaPayload;
  return null;
};

type CodexUsageWindow = {
  used_percent?: number | string;
  usedPercent?: number | string;
  limit_window_seconds?: number | string;
  limitWindowSeconds?: number | string;
  reset_after_seconds?: number | string;
  resetAfterSeconds?: number | string;
  reset_at?: number | string;
  resetAt?: number | string;
};

type CodexRateLimitInfo = {
  allowed?: boolean;
  limit_reached?: boolean;
  limitReached?: boolean;
  primary_window?: CodexUsageWindow | null;
  primaryWindow?: CodexUsageWindow | null;
  secondary_window?: CodexUsageWindow | null;
  secondaryWindow?: CodexUsageWindow | null;
};

type CodexUsagePayload = {
  plan_type?: string;
  planType?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
  code_review_rate_limit?: CodexRateLimitInfo | null;
  codeReviewRateLimit?: CodexRateLimitInfo | null;
};

const parseCodexUsagePayload = (payload: unknown): CodexUsagePayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as CodexUsagePayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as CodexUsagePayload;
  return null;
};

const formatCodexResetLabel = (window?: CodexUsageWindow | null): string => {
  if (!window) return "--";
  const resetAt = normalizeNumberValue(window.reset_at ?? window.resetAt);
  if (resetAt !== null) return formatUnixSeconds(resetAt);
  const after = normalizeNumberValue(window.reset_after_seconds ?? window.resetAfterSeconds);
  if (after === null) return "--";
  const minutes = Math.max(0, Math.round(after / 60));
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟后` : `${hours} 小时后`;
};

const buildCodexItems = (payload: CodexUsagePayload): QuotaItem[] => {
  const FIVE_HOUR_SECONDS = 18000;
  const WEEK_SECONDS = 604800;

  const pickWindows = (limitInfo?: CodexRateLimitInfo | null) => {
    const rawWindows = [
      limitInfo?.primary_window ?? limitInfo?.primaryWindow ?? null,
      limitInfo?.secondary_window ?? limitInfo?.secondaryWindow ?? null,
    ];
    let fiveHour: CodexUsageWindow | null = null;
    let weekly: CodexUsageWindow | null = null;

    const getSeconds = (w?: CodexUsageWindow | null) =>
      w ? normalizeNumberValue(w.limit_window_seconds ?? w.limitWindowSeconds) : null;

    for (const window of rawWindows) {
      if (!window) continue;
      const seconds = getSeconds(window);
      if (seconds === FIVE_HOUR_SECONDS && !fiveHour) fiveHour = window;
      else if (seconds === WEEK_SECONDS && !weekly) weekly = window;
    }
    return { fiveHour, weekly };
  };

  const items: QuotaItem[] = [];
  const rate = payload.rate_limit ?? payload.rateLimit ?? null;
  const codeReview = payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? null;

  const addWindow = (label: string, window?: CodexUsageWindow | null, limitInfo?: CodexRateLimitInfo | null) => {
    if (!window) return;
    const usedRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const allowed = limitInfo?.allowed;
    const limitReached = limitInfo?.limit_reached ?? limitInfo?.limitReached;
    const used = usedRaw !== null ? clampPercent(usedRaw) : allowed === false || limitReached ? 100 : null;
    const remaining = used === null ? null : clampPercent(100 - used);
    items.push({
      label,
      percent: remaining,
      resetLabel: formatCodexResetLabel(window),
    });
  };

  const rateWindows = pickWindows(rate);
  addWindow("代码：5小时", rateWindows.fiveHour, rate);
  addWindow("代码：周", rateWindows.weekly, rate);

  const reviewWindows = pickWindows(codeReview);
  addWindow("审查：5小时", reviewWindows.fiveHour, codeReview);
  addWindow("审查：周", reviewWindows.weekly, codeReview);

  return items;
};

type KiroQuotaPayload = {
  nextDateReset?: number;
  subscriptionInfo?: { subscriptionTitle?: string };
  usageBreakdownList?: {
    usageLimitWithPrecision?: number;
    currentUsageWithPrecision?: number;
    nextDateReset?: number;
    freeTrialInfo?: {
      freeTrialStatus?: string;
      usageLimitWithPrecision?: number;
      currentUsageWithPrecision?: number;
      freeTrialExpiry?: number;
    };
  }[];
};

const parseKiroQuotaPayload = (payload: unknown): KiroQuotaPayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as KiroQuotaPayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as KiroQuotaPayload;
  return null;
};

const fetchQuota = async (
  type: "antigravity" | "codex" | "gemini-cli" | "kiro",
  file: AuthFileItem,
): Promise<QuotaItem[]> => {
  const rawAuthIndex = (file as any)["auth_index"] ?? file.authIndex;
  const authIndex = normalizeAuthIndexValue(rawAuthIndex);
  if (!authIndex) {
    throw new Error("缺少 auth_index");
  }

  if (type === "antigravity") {
    const projectId = await resolveAntigravityProjectId(file);
    const requestBody = JSON.stringify({ project: projectId });

    let last: ApiCallResult | null = null;
    for (const url of ANTIGRAVITY_QUOTA_URLS) {
      const result = await apiCallApi.request({
        authIndex,
        method: "POST",
        url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS },
        data: requestBody,
      });
      last = result;
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const parsed = parseAntigravityPayload(result.body ?? result.bodyText);
        const models = parsed?.models;
        if (!models || !isRecord(models)) {
          throw new Error("未获取到可用模型配额数据");
        }
        const groups = buildAntigravityGroups(models as AntigravityModelsPayload);
        return groups.map((group) => ({
          label: group.label,
          percent: Math.round(clampPercent(group.remainingFraction * 100)),
          resetLabel: group.resetTime ? formatResetTime(group.resetTime) : "--",
        }));
      }
    }
    if (last) {
      throw new Error(getApiCallErrorMessage(last));
    }
    throw new Error("请求失败");
  }

  if (type === "codex") {
    const accountId = resolveCodexChatgptAccountId(file);
    if (!accountId) {
      throw new Error("缺少 Chatgpt-Account-Id（请检查 codex 认证文件是否包含 id_token）");
    }
    const result = await apiCallApi.request({
      authIndex,
      method: "GET",
      url: CODEX_USAGE_URL,
      header: { ...CODEX_REQUEST_HEADERS, "Chatgpt-Account-Id": accountId },
    });
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }
    const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
    if (!payload) {
      throw new Error("解析 Codex 配额失败");
    }
    return buildCodexItems(payload);
  }

  if (type === "gemini-cli") {
    const projectId = resolveGeminiCliProjectId(file);
    if (!projectId) {
      throw new Error("缺少 Gemini CLI Project ID（请检查 account 字段）");
    }
    const result = await apiCallApi.request({
      authIndex,
      method: "POST",
      url: GEMINI_CLI_QUOTA_URL,
      header: { ...GEMINI_CLI_REQUEST_HEADERS },
      data: JSON.stringify({ project: projectId }),
    });
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }
    const payload = parseGeminiCliQuotaPayload(result.body ?? result.bodyText);
    const buckets = Array.isArray(payload?.buckets) ? payload?.buckets : [];
    const parsed = buckets
      .map((bucket) => {
        const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
        if (!modelId) return null;
        const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
        const remainingFractionRaw = normalizeQuotaFraction(bucket.remainingFraction ?? bucket.remaining_fraction);
        const remainingAmount = normalizeNumberValue(bucket.remainingAmount ?? bucket.remaining_amount);
        const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
        let fallbackFraction: number | null = null;
        if (remainingAmount !== null) {
          fallbackFraction = remainingAmount <= 0 ? 0 : null;
        } else if (resetTime) {
          fallbackFraction = 0;
        }
        const remainingFraction = remainingFractionRaw ?? fallbackFraction;
        return { modelId, tokenType: tokenType ?? null, remainingFraction, remainingAmount, resetTime };
      })
      .filter(Boolean) as { modelId: string; tokenType: string | null; remainingFraction: number | null; remainingAmount: number | null; resetTime?: string }[];

    const grouped = buildGeminiCliBuckets(parsed);
    return grouped.map((bucket) => {
      const percent = bucket.remainingFraction === null ? null : Math.round(clampPercent(bucket.remainingFraction * 100));
      const amount = bucket.remainingAmount !== null ? `${Math.round(bucket.remainingAmount).toLocaleString()} tokens` : null;
      const tokenType = bucket.tokenType ? `tokenType=${bucket.tokenType}` : null;
      const meta = [tokenType, amount].filter(Boolean).join(" · ");
      return {
        label: bucket.label,
        percent,
        resetLabel: bucket.resetTime ? formatResetTime(bucket.resetTime) : "--",
        meta: meta || undefined,
      };
    });
  }

  const result = await apiCallApi.request({
    authIndex,
    method: "POST",
    url: KIRO_QUOTA_URL,
    header: { ...KIRO_REQUEST_HEADERS },
    data: KIRO_REQUEST_BODY,
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(getApiCallErrorMessage(result));
  }
  const payload = parseKiroQuotaPayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error("解析 Kiro 配额失败");
  }
  const usage = payload.usageBreakdownList?.[0];
  const items: QuotaItem[] = [];
  if (usage) {
    const limit = normalizeNumberValue(usage.usageLimitWithPrecision);
    const used = normalizeNumberValue(usage.currentUsageWithPrecision);
    const resetTime = normalizeNumberValue(usage.nextDateReset ?? payload.nextDateReset);
    if (limit !== null && used !== null) {
      const remaining = Math.max(0, limit - used);
      const percent = limit > 0 ? Math.round((remaining / limit) * 100) : 0;
      items.push({
        label: "基础额度",
        percent,
        resetLabel: resetTime !== null ? formatUnixSeconds(resetTime) : "--",
        meta: `used ${Math.round(used).toLocaleString()} / limit ${Math.round(limit).toLocaleString()}`,
      });
    }
    const trial = usage.freeTrialInfo;
    if (trial) {
      const trialLimit = normalizeNumberValue(trial.usageLimitWithPrecision);
      const trialUsed = normalizeNumberValue(trial.currentUsageWithPrecision);
      const trialExpiry = normalizeNumberValue(trial.freeTrialExpiry);
      const status = normalizeStringValue(trial.freeTrialStatus);
      if (trialLimit !== null && trialUsed !== null) {
        const remaining = Math.max(0, trialLimit - trialUsed);
        const percent = trialLimit > 0 ? Math.round((remaining / trialLimit) * 100) : 0;
        items.push({
          label: "试用额度",
          percent,
          resetLabel: trialExpiry !== null ? formatUnixSeconds(trialExpiry) : "--",
          meta: `${status ?? "trial"} · used ${Math.round(trialUsed).toLocaleString()} / limit ${Math.round(trialLimit).toLocaleString()}`,
        });
      }
    }
  }
  const subscriptionTitle = normalizeStringValue(payload.subscriptionInfo?.subscriptionTitle);
  if (subscriptionTitle) {
    items.unshift({ label: "订阅", percent: null, meta: subscriptionTitle });
  }
  return items;
};

function QuotaFileCard({
  file,
  state,
  onRefresh,
}: {
  file: AuthFileItem;
  state: QuotaState;
  onRefresh: () => void;
}) {
  const provider = resolveAuthProvider(file);
  const disabled = isDisabledAuthFile(file);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-900 dark:text-white">{file.name}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
            provider：{provider || "--"} · {disabled ? "已禁用" : "已启用"}
            {state.updatedAt ? ` · 更新于 ${new Date(state.updatedAt).toLocaleTimeString()}` : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={state.status === "loading"}>
          <RefreshCw size={14} className={state.status === "loading" ? "animate-spin" : ""} />
          刷新
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {state.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-rose-100">
            <div className="flex items-start gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>{state.error || "加载失败"}</span>
            </div>
          </div>
        ) : state.items.length === 0 ? (
          <EmptyState title="暂无额度数据" description="该文件可能不支持额度查询，或接口返回为空。" />
        ) : (
          state.items.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                <p className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
                  {item.percent === null ? "--" : `${Math.round(clampPercent(item.percent))}%`}{" "}
                  <span className="text-slate-500 dark:text-white/55">{item.resetLabel ? `· ${item.resetLabel}` : ""}</span>
                </p>
              </div>
              <div className="mt-2">
                <QuotaBar percent={item.percent} />
              </div>
              {item.meta ? (
                <p className="mt-2 text-xs text-slate-600 dark:text-white/65">{item.meta}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function QuotaPage() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const [antigravity, setAntigravity] = useState<Record<string, QuotaState>>({});
  const [codex, setCodex] = useState<Record<string, QuotaState>>({});
  const [geminiCli, setGeminiCli] = useState<Record<string, QuotaState>>({});
  const [kiro, setKiro] = useState<Record<string, QuotaState>>({});

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const data = await authFilesApi.list();
      setFiles(Array.isArray(data?.files) ? data.files : []);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载认证文件失败" });
    } finally {
      setLoadingFiles(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const grouped = useMemo(() => {
    const ag: AuthFileItem[] = [];
    const cx: AuthFileItem[] = [];
    const gm: AuthFileItem[] = [];
    const kr: AuthFileItem[] = [];
    files.forEach((file) => {
      const provider = resolveAuthProvider(file);
      if (provider === "antigravity") ag.push(file);
      if (provider === "codex") cx.push(file);
      if (provider === "gemini-cli") gm.push(file);
      if (provider === "kiro") kr.push(file);
    });
    return { ag, cx, gm, kr };
  }, [files]);

  const refreshOne = useCallback(
    async (type: "antigravity" | "codex" | "gemini-cli" | "kiro", file: AuthFileItem) => {
      const name = file.name;
      const setMap =
        type === "antigravity"
          ? setAntigravity
          : type === "codex"
            ? setCodex
            : type === "gemini-cli"
              ? setGeminiCli
              : setKiro;

      setMap((prev) => ({
        ...prev,
        [name]: { status: "loading", items: [], updatedAt: Date.now() },
      }));

      try {
        const items = await fetchQuota(type, file);
        setMap((prev) => ({
          ...prev,
          [name]: { status: "success", items, updatedAt: Date.now() },
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "额度查询失败";
        setMap((prev) => ({
          ...prev,
          [name]: { status: "error", items: [], error: message, updatedAt: Date.now() },
        }));
      }
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    grouped.ag.forEach((file) => tasks.push(refreshOne("antigravity", file)));
    grouped.cx.forEach((file) => tasks.push(refreshOne("codex", file)));
    grouped.gm.forEach((file) => tasks.push(refreshOne("gemini-cli", file)));
    grouped.kr.forEach((file) => tasks.push(refreshOne("kiro", file)));

    if (!tasks.length) {
      notify({ type: "info", message: "未发现可查询额度的认证文件" });
      return;
    }

    startTransition(() => {
      void Promise.allSettled(tasks).then(() => {
        notify({ type: "success", message: "额度刷新完成（部分失败请查看错误提示）" });
      });
    });
  }, [grouped, notify, refreshOne, startTransition]);

  const renderSection = (
    title: string,
    description: string,
    list: AuthFileItem[],
    stateMap: Record<string, QuotaState>,
    type: "antigravity" | "codex" | "gemini-cli" | "kiro",
  ) => (
    <Card
      title={title}
      description={description}
      actions={
        <Button variant="secondary" size="sm" onClick={() => void Promise.all(list.map((f) => refreshOne(type, f)))}>
          <RefreshCw size={14} />
          刷新本组
        </Button>
      }
      loading={loadingFiles}
    >
      {list.length === 0 ? (
        <EmptyState title="暂无对应认证文件" description="请先在“认证文件”页面上传/生成对应 provider 的认证文件。" />
      ) : (
        <div className="space-y-3">
          {list.map((file) => (
            <QuotaFileCard
              key={file.name}
              file={file}
              state={stateMap[file.name] ?? { status: "idle", items: [] }}
              onRefresh={() => void refreshOne(type, file)}
            />
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void refreshAll()} disabled={isPending || loadingFiles}>
          <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
          一键刷新所有额度
        </Button>
        <Button variant="secondary" onClick={() => void loadFiles()} disabled={loadingFiles}>
          <RefreshCw size={14} className={loadingFiles ? "animate-spin" : ""} />
          刷新文件列表
        </Button>
      </div>

      {renderSection("Antigravity", "支持多个 API 端点回退。", grouped.ag, antigravity, "antigravity")}
      {renderSection("Codex", "展示 5 小时 / 周限额与代码审查窗口。", grouped.cx, codex, "codex")}
      {renderSection("Gemini CLI", "按模型组聚合 bucket 并展示剩余额度。", grouped.gm, geminiCli, "gemini-cli")}
      {renderSection("Kiro", "查询 AWS CodeWhisperer / Kiro 使用额度与重置时间。", grouped.kr, kiro, "kiro")}
    </div>
  );
}
