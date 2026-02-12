import { apiClient } from "@/lib/http/client";
import type {
  ApiCallRequest,
  ApiCallResult,
  AuthFilesResponse,
  ErrorLogsResponse,
  LogsQuery,
  LogsResponse,
  OAuthCallbackResponse,
  OAuthModelAliasEntry,
  OAuthProvider,
  OAuthStartResponse,
  IFlowCookieAuthResponse,
  OpenAIProvider,
  ProviderApiKeyEntry,
  ProviderModel,
  ProviderSimpleConfig,
  UsageData,
} from "@/lib/http/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const extractArrayPayload = (data: unknown, key: string): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const candidate = data[key] ?? data.items ?? data.data ?? data;
  return Array.isArray(candidate) ? candidate : [];
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeHeaders = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  Object.entries(value).forEach(([key, raw]) => {
    const k = key.trim();
    if (!k) return;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) result[k] = trimmed;
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      result[k] = String(raw);
    }
  });
  return Object.keys(result).length ? result : undefined;
};

const normalizeModels = (value: unknown): ProviderModel[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const models = value
    .map((item) => {
      if (!isRecord(item)) return null;
      const name = normalizeString(item.name ?? item.id);
      if (!name) return null;
      const alias = normalizeString(item.alias);
      const priorityRaw = item.priority;
      const priority = typeof priorityRaw === "number" && Number.isFinite(priorityRaw) ? priorityRaw : undefined;
      const testModel = normalizeString(item["test-model"] ?? item.testModel) ?? undefined;
      return { name, ...(alias ? { alias } : {}), ...(priority !== undefined ? { priority } : {}), ...(testModel ? { testModel } : {}) };
    })
    .filter(Boolean) as ProviderModel[];
  return models.length ? models : undefined;
};

const normalizeExcludedModels = (value: unknown): string[] | undefined => {
  if (!value) return undefined;
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]+/)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result.length ? result : undefined;
};

const serializeHeaders = (headers?: Record<string, string>) =>
  headers && Object.keys(headers).length ? headers : undefined;

const serializeModels = (models?: ProviderModel[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          const name = normalizeString(model?.name) ?? "";
          if (!name) return null;
          const payload: Record<string, unknown> = { name };
          const alias = normalizeString(model?.alias);
          if (alias && alias !== name) payload.alias = alias;
          if (typeof model?.priority === "number" && Number.isFinite(model.priority)) payload.priority = model.priority;
          const testModel = normalizeString(model?.testModel);
          if (testModel) payload["test-model"] = testModel;
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeProviderKey = (config: ProviderSimpleConfig) => {
  const payload: Record<string, unknown> = { "api-key": config.apiKey };
  const prefix = normalizeString(config.prefix);
  if (prefix) payload.prefix = prefix;
  const baseUrl = normalizeString(config.baseUrl);
  if (baseUrl) payload["base-url"] = baseUrl;
  const proxyUrl = normalizeString(config.proxyUrl);
  if (proxyUrl) payload["proxy-url"] = proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModels(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) payload["excluded-models"] = config.excludedModels;
  return payload;
};

const serializeGeminiKey = (config: ProviderSimpleConfig) => {
  const payload: Record<string, unknown> = { "api-key": config.apiKey };
  const prefix = normalizeString(config.prefix);
  if (prefix) payload.prefix = prefix;
  const baseUrl = normalizeString(config.baseUrl);
  if (baseUrl) payload["base-url"] = baseUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  if (config.excludedModels && config.excludedModels.length) payload["excluded-models"] = config.excludedModels;
  const models = serializeModels(config.models);
  if (models && models.length) payload.models = models;
  return payload;
};

const serializeApiKeyEntry = (entry: ProviderApiKeyEntry) => {
  const payload: Record<string, unknown> = { "api-key": entry.apiKey };
  const proxyUrl = normalizeString(entry.proxyUrl);
  if (proxyUrl) payload["proxy-url"] = proxyUrl;
  const headers = serializeHeaders(entry.headers);
  if (headers) payload.headers = headers;
  return payload;
};

const serializeOpenAIProvider = (provider: OpenAIProvider) => {
  const payload: Record<string, unknown> = {
    name: provider.name,
    "base-url": provider.baseUrl,
    "api-key-entries": Array.isArray(provider.apiKeyEntries)
      ? provider.apiKeyEntries.map((entry) => serializeApiKeyEntry(entry))
      : [],
  };
  const prefix = normalizeString(provider.prefix);
  if (prefix) payload.prefix = prefix;
  const headers = serializeHeaders(provider.headers);
  if (headers) payload.headers = headers;
  const models = serializeModels(provider.models);
  if (models && models.length) payload.models = models;
  if (typeof provider.priority === "number" && Number.isFinite(provider.priority)) payload.priority = provider.priority;
  const testModel = normalizeString(provider.testModel);
  if (testModel) payload["test-model"] = testModel;
  return payload;
};

export const configApi = {
  getConfig: () => apiClient.get<Record<string, unknown>>("/config"),

  updateDebug: (enabled: boolean) => apiClient.put("/debug", { value: enabled }),
  updateProxyUrl: (proxyUrl: string) => apiClient.put("/proxy-url", { value: proxyUrl }),
  clearProxyUrl: () => apiClient.delete("/proxy-url"),
  updateRequestRetry: (retryCount: number) => apiClient.put("/request-retry", { value: retryCount }),
  updateSwitchProject: (enabled: boolean) =>
    apiClient.put("/quota-exceeded/switch-project", { value: enabled }),
  updateSwitchPreviewModel: (enabled: boolean) =>
    apiClient.put("/quota-exceeded/switch-preview-model", { value: enabled }),
  updateUsageStatistics: (enabled: boolean) =>
    apiClient.put("/usage-statistics-enabled", { value: enabled }),
  updateRequestLog: (enabled: boolean) => apiClient.put("/request-log", { value: enabled }),
  updateLoggingToFile: (enabled: boolean) => apiClient.put("/logging-to-file", { value: enabled }),
  getLogsMaxTotalSizeMb: async (): Promise<number> => {
    const data = await apiClient.get<Record<string, unknown>>("/logs-max-total-size-mb");
    const value = data?.["logs-max-total-size-mb"] ?? data?.logsMaxTotalSizeMb ?? 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  updateLogsMaxTotalSizeMb: (value: number) => apiClient.put("/logs-max-total-size-mb", { value }),
  updateWsAuth: (enabled: boolean) => apiClient.put("/ws-auth", { value: enabled }),
  getForceModelPrefix: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/force-model-prefix");
    return Boolean(data?.["force-model-prefix"] ?? data?.forceModelPrefix ?? false);
  },
  updateForceModelPrefix: (enabled: boolean) => apiClient.put("/force-model-prefix", { value: enabled }),
  getRoutingStrategy: async (): Promise<string> => {
    const data = await apiClient.get<Record<string, unknown>>("/routing/strategy");
    const strategy = data?.strategy ?? data?.["routing-strategy"] ?? data?.routingStrategy;
    return typeof strategy === "string" && strategy.trim() ? strategy.trim() : "round-robin";
  },
  updateRoutingStrategy: (strategy: string) => apiClient.put("/routing/strategy", { value: strategy }),
};

export const usageApi = {
  async getUsage(): Promise<UsageData> {
    const response = await apiClient.get<Record<string, unknown>>("/usage");
    const candidate =
      response.usage && typeof response.usage === "object" ? response.usage : response;

    if (!candidate || typeof candidate !== "object") {
      return { apis: {} };
    }

    const payload = candidate as { apis?: UsageData["apis"] };

    if (!payload.apis || typeof payload.apis !== "object") {
      return { apis: {} };
    }

    return {
      apis: payload.apis,
    };
  },
};

export const providersApi = {
  async getGeminiKeys(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/gemini-api-key");
    const list = extractArrayPayload(data, "gemini-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(item["excluded-models"] ?? item.excludedModels);
        return { apiKey, ...(prefix ? { prefix } : {}), ...(baseUrl ? { baseUrl } : {}), ...(headers ? { headers } : {}), ...(models ? { models } : {}), ...(excludedModels ? { excludedModels } : {}) };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveGeminiKeys: (configs: ProviderSimpleConfig[]) =>
    apiClient.put("/gemini-api-key", configs.map((item) => serializeGeminiKey(item))),

  deleteGeminiKey: (apiKey: string) =>
    apiClient.delete("/gemini-api-key", undefined, { params: { "api-key": apiKey } }),

  async getCodexConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/codex-api-key");
    const list = extractArrayPayload(data, "codex-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(item["excluded-models"] ?? item.excludedModels);
        return { apiKey, ...(prefix ? { prefix } : {}), ...(baseUrl ? { baseUrl } : {}), ...(proxyUrl ? { proxyUrl } : {}), ...(headers ? { headers } : {}), ...(models ? { models } : {}), ...(excludedModels ? { excludedModels } : {}) };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveCodexConfigs: (configs: ProviderSimpleConfig[]) =>
    apiClient.put("/codex-api-key", configs.map((item) => serializeProviderKey(item))),

  deleteCodexConfig: (apiKey: string) =>
    apiClient.delete("/codex-api-key", undefined, { params: { "api-key": apiKey } }),

  async getClaudeConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/claude-api-key");
    const list = extractArrayPayload(data, "claude-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(item["excluded-models"] ?? item.excludedModels);
        return { apiKey, ...(prefix ? { prefix } : {}), ...(baseUrl ? { baseUrl } : {}), ...(proxyUrl ? { proxyUrl } : {}), ...(headers ? { headers } : {}), ...(models ? { models } : {}), ...(excludedModels ? { excludedModels } : {}) };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveClaudeConfigs: (configs: ProviderSimpleConfig[]) =>
    apiClient.put("/claude-api-key", configs.map((item) => serializeProviderKey(item))),

  deleteClaudeConfig: (apiKey: string) =>
    apiClient.delete("/claude-api-key", undefined, { params: { "api-key": apiKey } }),

  async getVertexConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/vertex-api-key");
    const list = extractArrayPayload(data, "vertex-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        return { apiKey, ...(prefix ? { prefix } : {}), ...(baseUrl ? { baseUrl } : {}), ...(proxyUrl ? { proxyUrl } : {}), ...(headers ? { headers } : {}), ...(models ? { models } : {}) };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveVertexConfigs: (configs: ProviderSimpleConfig[]) =>
    apiClient.put("/vertex-api-key", configs.map((item) => serializeProviderKey(item))),

  deleteVertexConfig: (apiKey: string) =>
    apiClient.delete("/vertex-api-key", undefined, { params: { "api-key": apiKey } }),

  async getOpenAIProviders(): Promise<OpenAIProvider[]> {
    const data = await apiClient.get("/openai-compatibility");
    const list = extractArrayPayload(data, "openai-compatibility");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const name = normalizeString(item.name) ?? "";
        if (!name) return null;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const apiKeyEntriesRaw = item["api-key-entries"] ?? item.apiKeyEntries;
        const apiKeyEntries = Array.isArray(apiKeyEntriesRaw)
          ? (apiKeyEntriesRaw
              .map((entry) => {
                if (!isRecord(entry)) return null;
                const apiKey = normalizeString(entry["api-key"] ?? entry.apiKey) ?? "";
                if (!apiKey) return null;
                const proxyUrl = normalizeString(entry["proxy-url"] ?? entry.proxyUrl) ?? undefined;
                const entryHeaders = normalizeHeaders(entry.headers);
                return { apiKey, ...(proxyUrl ? { proxyUrl } : {}), ...(entryHeaders ? { headers: entryHeaders } : {}) };
              })
              .filter(Boolean) as ProviderApiKeyEntry[])
          : undefined;
        const priorityRaw = item.priority;
        const priority = typeof priorityRaw === "number" && Number.isFinite(priorityRaw) ? priorityRaw : undefined;
        const testModel = normalizeString(item["test-model"] ?? item.testModel) ?? undefined;
        return {
          name,
          ...(baseUrl ? { baseUrl } : {}),
          ...(prefix ? { prefix } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
          ...(apiKeyEntries ? { apiKeyEntries } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(testModel ? { testModel } : {}),
        };
      })
      .filter(Boolean) as OpenAIProvider[];
  },

  saveOpenAIProviders: (providers: OpenAIProvider[]) =>
    apiClient.put("/openai-compatibility", providers.map((item) => serializeOpenAIProvider(item))),

  deleteOpenAIProvider: (name: string) =>
    apiClient.delete("/openai-compatibility", undefined, { params: { name } }),
};

export const configFileApi = {
  fetchConfigYaml: () =>
    apiClient.getText("/config.yaml", {
      headers: { Accept: "application/yaml, text/yaml, text/plain" },
      timeoutMs: 60000,
    }),
  saveConfigYaml: (content: string) =>
    apiClient.putRawText("/config.yaml", content, {
      headers: {
        "Content-Type": "application/yaml",
        Accept: "application/json, text/plain, */*",
      },
      timeoutMs: 60000,
    }),
};

export const logsApi = {
  fetchLogs: ({ after }: LogsQuery = {}): Promise<LogsResponse> =>
    apiClient.get("/logs", { params: after ? { after } : undefined, timeoutMs: 60000 }),
  clearLogs: (): Promise<void> => apiClient.delete("/logs"),
  fetchErrorLogs: (): Promise<ErrorLogsResponse> =>
    apiClient.get("/request-error-logs", { timeoutMs: 60000 }),
  downloadErrorLog: (filename: string): Promise<Blob> =>
    apiClient.getBlob(`/request-error-logs/${encodeURIComponent(filename)}`, { timeoutMs: 60000 }),
  downloadRequestLogById: (id: string): Promise<Blob> =>
    apiClient.getBlob(`/request-log-by-id/${encodeURIComponent(id)}`, { timeoutMs: 60000 }),
};

const WEBUI_SUPPORTED: OAuthProvider[] = ["codex", "anthropic", "antigravity", "gemini-cli"];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  "gemini-cli": "gemini",
};

export const oauthApi = {
  startAuth: (provider: OAuthProvider, options?: { projectId?: string }) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === "gemini-cli" && options?.projectId) {
      params.project_id = options.projectId;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, { params });
  },
  getAuthStatus: (state: string) =>
    apiClient.get<{ status: "ok" | "wait" | "error"; error?: string }>("/get-auth-status", {
      params: { state },
    }),
  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>("/oauth-callback", {
      provider: callbackProvider,
      redirect_url: redirectUrl,
    });
  },
  iflowCookieAuth: (cookie: string) => apiClient.post<IFlowCookieAuthResponse>("/iflow-auth-url", { cookie }),
};

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!isRecord(payload)) return {};
  const source = payload["oauth-excluded-models"] ?? payload.items ?? payload;
  if (!isRecord(source)) return {};

  const result: Record<string, string[]> = {};

  Object.entries(source).forEach(([provider, models]) => {
    const key = String(provider ?? "").trim().toLowerCase();
    if (!key) return;
    const normalized = normalizeExcludedModels(models);
    if (!normalized) return;
    result[key] = normalized;
  });

  return result;
};

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!isRecord(payload)) return {};
  const source = payload["oauth-model-alias"] ?? payload.items ?? payload;
  if (!isRecord(source)) return {};

  const result: Record<string, OAuthModelAliasEntry[]> = {};

  Object.entries(source).forEach(([channel, mappings]) => {
    const key = String(channel ?? "").trim().toLowerCase();
    if (!key) return;
    if (!Array.isArray(mappings)) return;
    const seen = new Set<string>();
    const normalized = mappings
      .map((item) => {
        if (!isRecord(item)) return null;
        const name = normalizeString(item.name ?? item.id ?? item.model) ?? "";
        const alias = normalizeString(item.alias) ?? "";
        if (!name || !alias) return null;
        const fork = item.fork === true;
        return fork ? { name, alias, fork } : { name, alias };
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry;
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? "1" : "0"}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }) as OAuthModelAliasEntry[];
    if (normalized.length) {
      result[key] = normalized;
    }
  });

  return result;
};

export const authFilesApi = {
  list: (): Promise<AuthFilesResponse> => apiClient.get<AuthFilesResponse>("/auth-files"),
  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<{ status: string; disabled: boolean }>("/auth-files/status", { name, disabled }),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return apiClient.postForm("/auth-files", formData);
  },
  deleteFile: (name: string) => apiClient.delete("/auth-files", undefined, { params: { name } }),
  deleteAll: () => apiClient.delete("/auth-files", undefined, { params: { all: true } }),
  downloadText: (name: string) =>
    apiClient.getText("/auth-files/download", { params: { name }, timeoutMs: 60000 }),

  getOauthExcludedModels: async (): Promise<Record<string, string[]>> => {
    const data = await apiClient.get("/oauth-excluded-models");
    return normalizeOauthExcludedModels(data);
  },
  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch("/oauth-excluded-models", { provider, models }),
  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete("/oauth-excluded-models", undefined, { params: { provider } }),
  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put("/oauth-excluded-models", normalizeOauthExcludedModels(map)),

  getOauthModelAlias: async (): Promise<Record<string, OAuthModelAliasEntry[]>> => {
    const data = await apiClient.get("/oauth-model-alias");
    return normalizeOauthModelAlias(data);
  },
  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? "").trim().toLowerCase();
    const normalizedAliases = normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch("/oauth-model-alias", { channel: normalizedChannel, aliases: normalizedAliases });
  },
  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? "").trim().toLowerCase();
    try {
      await apiClient.patch("/oauth-model-alias", { channel: normalizedChannel, aliases: [] });
    } catch {
      await apiClient.delete("/oauth-model-alias", undefined, { params: { channel: normalizedChannel } });
    }
  },

  getModelsForAuthFile: async (
    name: string,
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> => {
    const data = await apiClient.get<Record<string, unknown>>("/auth-files/models", { params: { name } });
    const models = data.models ?? data["models"];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
  getModelDefinitions: async (
    channel: string,
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> => {
    const normalizedChannel = String(channel ?? "").trim().toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(`/model-definitions/${encodeURIComponent(normalizedChannel)}`);
    const models = data.models ?? data["models"];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
};

const normalizeApiCallBody = (input: unknown): { bodyText: string; body: unknown | null } => {
  if (input === undefined || input === null) return { bodyText: "", body: null };

  if (typeof input === "string") {
    const text = input;
    const trimmed = text.trim();
    if (!trimmed) return { bodyText: text, body: null };
    try {
      return { bodyText: text, body: JSON.parse(trimmed) };
    } catch {
      return { bodyText: text, body: text };
    }
  }

  try {
    return { bodyText: JSON.stringify(input), body: input };
  } catch {
    return { bodyText: String(input), body: input };
  }
};

export const getApiCallErrorMessage = (result: ApiCallResult): string => {
  const status = result.statusCode;
  const body = result.body;
  const bodyText = result.bodyText;
  let message = "";

  if (isRecord(body)) {
    const errorValue = body.error;
    if (isRecord(errorValue) && typeof errorValue.message === "string") {
      message = errorValue.message;
    } else if (typeof errorValue === "string") {
      message = errorValue;
    }
    if (!message && typeof body.message === "string") {
      message = body.message;
    }
  } else if (typeof body === "string") {
    message = body;
  }

  if (!message && bodyText) {
    message = bodyText;
  }

  if (status && message) return `${status} ${message}`.trim();
  if (status) return `HTTP ${status}`;
  return message || "请求失败";
};

export const apiCallApi = {
  request: async (payload: ApiCallRequest): Promise<ApiCallResult> => {
    const response = await apiClient.post<Record<string, unknown>>("/api-call", payload, { timeoutMs: 60000 });
    const statusCode = Number(response?.status_code ?? response?.statusCode ?? 0);
    const header = (response?.header ?? response?.headers ?? {}) as Record<string, string[]>;
    const { bodyText, body } = normalizeApiCallBody(response?.body);

    return {
      statusCode,
      header,
      bodyText,
      body: body as ApiCallResult["body"],
    };
  },
};

export const ampcodeApi = {
  getAmpcode: () => apiClient.get<Record<string, unknown>>("/ampcode"),
  updateUpstreamUrl: (url: string) => apiClient.put("/ampcode/upstream-url", { value: url }),
  clearUpstreamUrl: () => apiClient.delete("/ampcode/upstream-url"),
  updateUpstreamApiKey: (apiKey: string) => apiClient.put("/ampcode/upstream-api-key", { value: apiKey }),
  clearUpstreamApiKey: () => apiClient.delete("/ampcode/upstream-api-key"),
  getModelMappings: async (): Promise<unknown[]> => {
    const data = await apiClient.get<Record<string, unknown>>("/ampcode/model-mappings");
    const list = data?.["model-mappings"] ?? data?.modelMappings ?? data?.items ?? data;
    return Array.isArray(list) ? list : [];
  },
  saveModelMappings: (mappings: unknown[]) => apiClient.put("/ampcode/model-mappings", { value: mappings }),
  patchModelMappings: (mappings: unknown[]) => apiClient.patch("/ampcode/model-mappings", { value: mappings }),
  clearModelMappings: () => apiClient.delete("/ampcode/model-mappings"),
  deleteModelMappings: (fromList: string[]) => apiClient.delete("/ampcode/model-mappings", { value: fromList }),
  updateForceModelMappings: (enabled: boolean) => apiClient.put("/ampcode/force-model-mappings", { value: enabled }),
};

export const vertexApi = {
  importCredential: (file: File, location?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (location) {
      formData.append("location", location);
    }
    return apiClient.postForm<{ status: "ok"; project_id?: string; email?: string; location?: string; auth_file?: string }>(
      "/vertex/import",
      formData,
    );
  },
};
