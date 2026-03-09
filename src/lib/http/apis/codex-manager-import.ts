import type { CodexManagerImportPayload } from "@/lib/http/types";

const IMPORT_ACCESS_TOKEN_KEYS = ["access_token", "accessToken"] as const;
const IMPORT_ID_TOKEN_KEYS = ["id_token", "idToken"] as const;
const IMPORT_REFRESH_TOKEN_KEYS = ["refresh_token", "refreshToken"] as const;
const IMPORT_ACCOUNT_ID_KEYS = [
  "account_id",
  "accountId",
  "accountID",
  "chatgpt_account_id",
  "chatgptAccountId",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const pickImportTokenField = (record: Record<string, unknown>, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const normalizeSingleImportRecord = (record: unknown): unknown => {
  if (!isRecord(record)) {
    return record;
  }

  const tokens = record.tokens;
  if (isRecord(tokens)) {
    return record;
  }

  const accessToken = pickImportTokenField(record, IMPORT_ACCESS_TOKEN_KEYS);
  const idToken = pickImportTokenField(record, IMPORT_ID_TOKEN_KEYS);
  const refreshToken = pickImportTokenField(record, IMPORT_REFRESH_TOKEN_KEYS);

  if (!accessToken || !idToken || !refreshToken) {
    return record;
  }

  const accountIdHint = pickImportTokenField(record, IMPORT_ACCOUNT_ID_KEYS);
  const normalizedTokens: Record<string, string> = {
    access_token: accessToken,
    id_token: idToken,
    refresh_token: refreshToken,
  };

  if (accountIdHint) {
    normalizedTokens.account_id = accountIdHint;
  }

  return {
    ...record,
    tokens: normalizedTokens,
  };
};

export const normalizeCodexManagerImportContentForCompatibility = (rawContent: unknown): string => {
  const text = String(rawContent ?? "").trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.map(normalizeSingleImportRecord));
    }
    if (isRecord(parsed)) {
      return JSON.stringify(normalizeSingleImportRecord(parsed));
    }
    return text;
  } catch {
    return text;
  }
};

export const normalizeCodexManagerImportContents = (
  payload: Pick<CodexManagerImportPayload, "content" | "contents">,
): string[] =>
  [
    ...(Array.isArray(payload.contents) ? payload.contents : []),
    ...(typeof payload.content === "string" ? [payload.content] : []),
  ]
    .map((item) => normalizeCodexManagerImportContentForCompatibility(item))
    .filter(Boolean);
