export interface AuthSnapshot {
  apiBase: string;
  managementKey: string;
  rememberPassword: boolean;
}

export type AuthFileType =
  | "qwen"
  | "kimi"
  | "gemini"
  | "gemini-cli"
  | "aistudio"
  | "claude"
  | "codex"
  | "antigravity"
  | "iflow"
  | "vertex"
  | "empty"
  | "unknown";

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  auth_index?: string | number | null;
  runtimeOnly?: boolean | string;
  runtime_only?: boolean | string;
  disabled?: boolean;
  modified?: number;
  modtime?: number;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}

export interface UsageDetail {
  timestamp: string;
  failed: boolean;
  source: string;
  auth_index: string;
  latency_ms?: number;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  };
}

export interface UsageData {
  apis: Record<
    string,
    {
      models: Record<
        string,
        {
          details: UsageDetail[];
        }
      >;
    }
  >;
}

export interface ProviderModel {
  name?: string;
  alias?: string;
  priority?: number;
  testModel?: string;
}

export interface ProviderApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
}

export interface OpenAIProvider {
  name: string;
  baseUrl?: string;
  prefix?: string;
  headers?: Record<string, string>;
  models?: ProviderModel[];
  apiKeyEntries?: ProviderApiKeyEntry[];
  priority?: number;
  testModel?: string;
}

export interface ProviderSimpleConfig {
  apiKey: string;
  name?: string;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ProviderModel[];
  excludedModels?: string[];
}

export type OAuthProvider = "codex" | "anthropic" | "antigravity" | "gemini-cli" | "kimi" | "qwen";

export interface OAuthStartResponse {
  url: string;
  state?: string;
}

export interface OAuthCallbackResponse {
  status: "ok";
}

export interface OAuthModelAliasEntry {
  name: string;
  alias: string;
  fork?: boolean;
}

export interface IFlowCookieAuthResponse {
  status: "ok" | "error";
  error?: string;
  saved_path?: string;
  email?: string;
  expired?: string;
  type?: string;
}

export interface LogsQuery {
  after?: number;
}

export interface LogsResponse {
  lines: string[];
  "line-count": number;
  "latest-timestamp": number;
}

export interface ErrorLogFile {
  name: string;
  size?: number;
  modified?: number;
}

export interface ErrorLogsResponse {
  files?: ErrorLogFile[];
}

export interface ApiCallRequest {
  authIndex?: string;
  method: string;
  url: string;
  header?: Record<string, string>;
  data?: string;
}

export interface ApiCallResult<T = unknown> {
  statusCode: number;
  header: Record<string, string[]>;
  bodyText: string;
  body: T | null;
}

export const CODEX_MANAGER_DEFAULT_PAGE = 1;
export const CODEX_MANAGER_DEFAULT_PAGE_SIZE = 20;
export const CODEX_MANAGER_MAX_PAGE_SIZE = 100;

export interface CodexManagerEnvelope<T = unknown> {
  ok: boolean;
  code: string;
  message: string;
  retryable: boolean;
  data: T;
}

export type CodexManagerRuntimeSource = "codex_manager" | string;

export type CodexManagerLoginFlowStatus =
  | "in_progress"
  | "success"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "unknown"
  | string;

export interface CodexManagerListParams {
  page?: number;
  pageSize?: number;
  query?: string;
}

export interface CodexManagerUsageSummary {
  availabilityStatus: string;
  usedPercent?: number | null;
  windowMinutes?: number | null;
  capturedAt?: string | null;
}

export interface CodexManagerUsageSnapshot {
  accountId?: string | null;
  availabilityStatus?: string | null;
  usedPercent?: number | null;
  windowMinutes?: number | null;
  resetsAt?: number | null;
  secondaryUsedPercent?: number | null;
  secondaryWindowMinutes?: number | null;
  secondaryResetsAt?: number | null;
  capturedAt?: number | null;
}

export interface CodexManagerAccount {
  accountId: string;
  label: string;
  groupName: string;
  status: string;
  sort: number;
  relayEnabled: boolean;
  runtimeSource: CodexManagerRuntimeSource;
  runtimeIncluded: boolean;
  usageSummary: CodexManagerUsageSummary | null;
  lastSyncedAt: string | null;
  stale: boolean;
}

export interface CodexManagerAccountDetail extends CodexManagerAccount {
  usageSnapshot: CodexManagerUsageSnapshot | null;
}

export interface CodexManagerAccountUsage {
  accountId: string;
  usageSummary: CodexManagerUsageSummary | null;
  snapshot: CodexManagerUsageSnapshot | null;
}

export interface CodexManagerAccountListData {
  items: CodexManagerAccount[];
  total: number;
  page: number;
  pageSize: number;
  maxPageSize: number;
}

export interface CodexManagerLoginStartPayload {
  type?: string;
  openBrowser?: boolean;
  note?: string;
  tags?: string;
  groupName?: string;
  workspaceId?: string;
}

export interface CodexManagerDeviceAuthInfo {
  userCodeUrl: string;
  tokenUrl: string;
  verificationUrl: string;
  redirectUri: string;
}

export interface CodexManagerLoginStartData {
  loginId: string;
  authUrl: string;
  loginType: string;
  issuer: string;
  clientId: string;
  redirectUri: string;
  warning: string | null;
  device: CodexManagerDeviceAuthInfo | null;
}

export interface CodexManagerLoginStatusData {
  loginId: string;
  status: CodexManagerLoginFlowStatus;
  upstreamStatus: string;
  terminal: boolean;
  error: string | null;
  updatedAt: string | null;
}

export interface CodexManagerLoginCompletePayload {
  state: string;
  code: string;
  redirectUri?: string;
}

export interface CodexManagerLoginCompleteData {
  status: CodexManagerLoginFlowStatus;
  completed: boolean;
}

export interface CodexManagerImportPayload {
  contents?: string[];
  content?: string;
}

export interface CodexManagerImportError {
  index: number;
  message: string;
}

export interface CodexManagerImportData {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: CodexManagerImportError[];
}

export type CodexManagerExportData = Blob;

export interface CodexManagerDeleteData {
  accountId: string;
  removed: boolean;
  alreadyRemoved: boolean;
  notFoundButHandled: boolean;
}

export interface CodexManagerDeleteUnavailableData {
  scanned: number;
  deleted: number;
  skippedAvailable: number;
  skippedNonFree: number;
  skippedMissingUsage: number;
  skippedMissingToken: number;
  deletedAccountIds: string[];
  localCredentialsRemoved: number;
  localProjectionsTombstoned: number;
}

export interface CodexManagerUsageRefreshBatchItem {
  accountId: string;
  success: boolean;
  reason: string | null;
  usageSummary: CodexManagerUsageSummary | null;
  snapshot: CodexManagerUsageSnapshot | null;
}

export interface CodexManagerUsageRefreshBatchData {
  items: CodexManagerUsageRefreshBatchItem[];
  total: number;
  successCount: number;
  failedCount: number;
}
