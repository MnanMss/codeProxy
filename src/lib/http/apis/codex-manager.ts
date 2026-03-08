import { apiClient } from "@/lib/http/client";
import { isRecord, normalizeString } from "@/lib/http/apis/helpers";
import {
  CODEX_MANAGER_DEFAULT_PAGE,
  CODEX_MANAGER_DEFAULT_PAGE_SIZE,
  CODEX_MANAGER_MAX_PAGE_SIZE,
  type CodexManagerAccount,
  type CodexManagerAccountDetail,
  type CodexManagerAccountListData,
  type CodexManagerAccountUsage,
  type CodexManagerDeleteData,
  type CodexManagerEnvelope,
  type CodexManagerImportData,
  type CodexManagerImportPayload,
  type CodexManagerListParams,
  type CodexManagerLoginCompleteData,
  type CodexManagerLoginCompletePayload,
  type CodexManagerLoginStartData,
  type CodexManagerLoginStartPayload,
  type CodexManagerLoginStatusData,
  type CodexManagerUsageRefreshBatchData,
} from "@/lib/http/types";

const CODEX_MANAGER_API_BASE = "/codex-manager";

type EnvelopeReadOptions<T> = {
  fallback?: T;
  message: string;
  requireData?: boolean;
};

const normalizePositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.max(1, Math.round(numeric));
  return typeof max === "number" ? Math.min(rounded, max) : rounded;
};

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  const normalized = normalizeString(value);
  if (normalized) return normalized;
  throw new Error(`${fieldName} 不能为空`);
};

const normalizeOptionalString = (value: unknown): string | undefined => normalizeString(value) ?? undefined;

const normalizeListParams = (params?: CodexManagerListParams) => ({
  page: normalizePositiveInt(params?.page, CODEX_MANAGER_DEFAULT_PAGE),
  pageSize: normalizePositiveInt(
    params?.pageSize,
    CODEX_MANAGER_DEFAULT_PAGE_SIZE,
    CODEX_MANAGER_MAX_PAGE_SIZE,
  ),
  query: normalizeOptionalString(params?.query),
});

const createEmptyAccountListData = (params?: CodexManagerListParams): CodexManagerAccountListData => {
  const normalized = normalizeListParams(params);
  return {
    items: [],
    total: 0,
    page: normalized.page,
    pageSize: normalized.pageSize,
    maxPageSize: CODEX_MANAGER_MAX_PAGE_SIZE,
  };
};

const unwrapCodexManagerEnvelope = <T>(
  payload: unknown,
  { fallback, message, requireData = false }: EnvelopeReadOptions<T>,
): T => {
  if (!isRecord(payload)) {
    if (fallback !== undefined) return fallback;
    throw new Error(message);
  }

  const envelope = payload as Partial<CodexManagerEnvelope<T>> & Record<string, unknown>;
  if (envelope.ok === false) {
    throw new Error(normalizeString(envelope.message) ?? normalizeString(envelope.code) ?? message);
  }

  if (Object.prototype.hasOwnProperty.call(envelope, "data")) {
    const data = envelope.data;
    if (data !== undefined && data !== null) {
      return data as T;
    }
    if (fallback !== undefined) return fallback;
  }

  if (fallback !== undefined) return fallback;
  if (requireData) throw new Error(message);
  return payload as T;
};

const normalizeImportPayload = (payload: CodexManagerImportPayload): { contents: string[] } => {
  const contents = [
    ...(Array.isArray(payload.contents) ? payload.contents : []),
    ...(typeof payload.content === "string" ? [payload.content] : []),
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  return { contents };
};

const normalizeAccountIds = (accountIds: string[]) => {
  const result: string[] = [];
  const seen = new Set<string>();
  accountIds.forEach((accountId) => {
    const normalized = normalizeOptionalString(accountId);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

const normalizeLoginStartPayload = (payload: CodexManagerLoginStartPayload = {}) => {
  const normalized: CodexManagerLoginStartPayload = {};

  const type = normalizeOptionalString(payload.type);
  if (type) normalized.type = type;

  if (typeof payload.openBrowser === "boolean") {
    normalized.openBrowser = payload.openBrowser;
  }

  const note = normalizeOptionalString(payload.note);
  if (note) normalized.note = note;

  const tags = normalizeOptionalString(payload.tags);
  if (tags) normalized.tags = tags;

  const groupName = normalizeOptionalString(payload.groupName);
  if (groupName) normalized.groupName = groupName;

  const workspaceId = normalizeOptionalString(payload.workspaceId);
  if (workspaceId) normalized.workspaceId = workspaceId;

  return Object.keys(normalized).length ? normalized : undefined;
};

export const codexManagerApi = {
  listAccounts: async (params: CodexManagerListParams = {}): Promise<CodexManagerAccountListData> => {
    const normalized = normalizeListParams(params);
    const response = await apiClient.get<unknown>(`${CODEX_MANAGER_API_BASE}/accounts`, {
      params: {
        page: normalized.page,
        pageSize: normalized.pageSize,
        query: normalized.query,
      },
    });

    return unwrapCodexManagerEnvelope(response, {
      fallback: createEmptyAccountListData(normalized),
      message: "加载 Codex 账号列表失败",
    });
  },

  getAccount: async (accountId: string): Promise<CodexManagerAccountDetail> => {
    const normalizedAccountId = normalizeRequiredString(accountId, "accountId");
    const response = await apiClient.get<unknown>(
      `${CODEX_MANAGER_API_BASE}/accounts/${encodeURIComponent(normalizedAccountId)}`,
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "加载 Codex 账号详情失败",
      requireData: true,
    });
  },

  listUsage: async (params: CodexManagerListParams = {}): Promise<CodexManagerAccountListData> => {
    const normalized = normalizeListParams(params);
    const response = await apiClient.get<unknown>(`${CODEX_MANAGER_API_BASE}/usage`, {
      params: {
        page: normalized.page,
        pageSize: normalized.pageSize,
        query: normalized.query,
      },
    });

    return unwrapCodexManagerEnvelope(response, {
      fallback: createEmptyAccountListData(normalized),
      message: "加载 Codex 用量列表失败",
    });
  },

  getAccountUsage: async (accountId: string): Promise<CodexManagerAccountUsage> => {
    const normalizedAccountId = normalizeRequiredString(accountId, "accountId");
    const response = await apiClient.get<unknown>(
      `${CODEX_MANAGER_API_BASE}/accounts/${encodeURIComponent(normalizedAccountId)}/usage`,
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "加载 Codex 账号用量失败",
      requireData: true,
    });
  },

  refreshAccountUsage: async (accountId: string): Promise<CodexManagerAccountUsage> => {
    const normalizedAccountId = normalizeRequiredString(accountId, "accountId");
    const response = await apiClient.post<unknown>(
      `${CODEX_MANAGER_API_BASE}/accounts/${encodeURIComponent(normalizedAccountId)}/usage/refresh`,
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "刷新 Codex 账号用量失败",
      requireData: true,
    });
  },

  refreshUsageBatch: async (accountIds: string[]): Promise<CodexManagerUsageRefreshBatchData> => {
    const response = await apiClient.post<unknown>(`${CODEX_MANAGER_API_BASE}/usage/refresh-batch`, {
      accountIds: normalizeAccountIds(accountIds),
    });

    return unwrapCodexManagerEnvelope(response, {
      message: "批量刷新 Codex 用量失败",
      requireData: true,
    });
  },

  startLogin: async (payload: CodexManagerLoginStartPayload = {}): Promise<CodexManagerLoginStartData> => {
    const response = await apiClient.post<unknown>(
      `${CODEX_MANAGER_API_BASE}/login/start`,
      normalizeLoginStartPayload(payload),
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "启动 Codex 登录失败",
      requireData: true,
    });
  },

  getLoginStatus: async (loginId: string): Promise<CodexManagerLoginStatusData> => {
    const normalizedLoginId = normalizeRequiredString(loginId, "loginId");
    const response = await apiClient.get<unknown>(
      `${CODEX_MANAGER_API_BASE}/login/status/${encodeURIComponent(normalizedLoginId)}`,
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "获取 Codex 登录状态失败",
      requireData: true,
    });
  },

  completeLogin: async (
    payload: CodexManagerLoginCompletePayload,
  ): Promise<CodexManagerLoginCompleteData> => {
    const response = await apiClient.post<unknown>(`${CODEX_MANAGER_API_BASE}/login/complete`, {
      state: normalizeRequiredString(payload.state, "state"),
      code: normalizeRequiredString(payload.code, "code"),
      redirectUri: normalizeOptionalString(payload.redirectUri),
    });

    return unwrapCodexManagerEnvelope(response, {
      message: "完成 Codex 登录失败",
      requireData: true,
    });
  },

  importAccounts: async (payload: CodexManagerImportPayload): Promise<CodexManagerImportData> => {
    const response = await apiClient.post<unknown>(
      `${CODEX_MANAGER_API_BASE}/import`,
      normalizeImportPayload(payload),
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "导入 Codex 账号失败",
      requireData: true,
    });
  },

  deleteAccount: async (accountId: string): Promise<CodexManagerDeleteData> => {
    const normalizedAccountId = normalizeRequiredString(accountId, "accountId");
    const response = await apiClient.delete<unknown>(
      `${CODEX_MANAGER_API_BASE}/accounts/${encodeURIComponent(normalizedAccountId)}`,
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "删除 Codex 账号失败",
      requireData: true,
    });
  },

  setRelayState: async (accountId: string, relayEnabled: boolean): Promise<CodexManagerAccount> => {
    const normalizedAccountId = normalizeRequiredString(accountId, "accountId");
    const response = await apiClient.patch<unknown>(
      `${CODEX_MANAGER_API_BASE}/accounts/${encodeURIComponent(normalizedAccountId)}/relay-state`,
      { relayEnabled: Boolean(relayEnabled) },
    );

    return unwrapCodexManagerEnvelope(response, {
      message: "更新 Codex Relay 状态失败",
      requireData: true,
    });
  },
};
