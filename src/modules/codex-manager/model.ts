import {
  CODEX_MANAGER_DEFAULT_PAGE,
  CODEX_MANAGER_DEFAULT_PAGE_SIZE,
  CODEX_MANAGER_MAX_PAGE_SIZE,
  type CodexManagerAccountListData,
} from "@/lib/http/types";

export type CodexManagerTab = "accounts" | "quota";

export interface CodexManagerQueryState {
  page: number;
  pageSize: number;
  query: string;
}

export interface CodexManagerSelectionState {
  selectedAccountId: string | null;
  selectedAccountIds: string[];
}

export interface CodexManagerViewState {
  activeTab: CodexManagerTab;
  accountsQuery: CodexManagerQueryState;
  usageQuery: CodexManagerQueryState;
  selection: CodexManagerSelectionState;
}

export const CODEX_MANAGER_DEFAULT_TAB: CodexManagerTab = "accounts";

const normalizePositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;

  const rounded = Math.max(1, Math.round(numeric));
  return typeof max === "number" ? Math.min(rounded, max) : rounded;
};

export const normalizeCodexManagerAccountId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const normalizeCodexManagerTab = (value: unknown): CodexManagerTab => {
  if (value === "quota") return "quota";
  return CODEX_MANAGER_DEFAULT_TAB;
};

export const normalizeCodexManagerQueryState = (
  value?: Partial<CodexManagerQueryState>,
): CodexManagerQueryState => ({
  page: normalizePositiveInt(value?.page, CODEX_MANAGER_DEFAULT_PAGE),
  pageSize: normalizePositiveInt(
    value?.pageSize,
    CODEX_MANAGER_DEFAULT_PAGE_SIZE,
    CODEX_MANAGER_MAX_PAGE_SIZE,
  ),
  query: typeof value?.query === "string" ? value.query.trim() : "",
});

export const normalizeCodexManagerSelection = (accountIds: string[]): string[] => {
  const normalized: string[] = [];
  const seen = new Set<string>();

  accountIds.forEach((accountId) => {
    const normalizedAccountId = normalizeCodexManagerAccountId(accountId);
    if (!normalizedAccountId || seen.has(normalizedAccountId)) return;

    seen.add(normalizedAccountId);
    normalized.push(normalizedAccountId);
  });

  return normalized;
};

export const createCodexManagerSelectionState = (
  value?: Partial<CodexManagerSelectionState>,
): CodexManagerSelectionState => ({
  selectedAccountId: normalizeCodexManagerAccountId(value?.selectedAccountId ?? null),
  selectedAccountIds: normalizeCodexManagerSelection(value?.selectedAccountIds ?? []),
});

export const setCodexManagerSelectedAccountId = (
  selection: CodexManagerSelectionState,
  accountId: string | null,
): CodexManagerSelectionState => ({
  ...selection,
  selectedAccountId: normalizeCodexManagerAccountId(accountId),
});

export const toggleCodexManagerSelection = (
  selection: CodexManagerSelectionState,
  accountId: string,
): CodexManagerSelectionState => {
  const normalizedAccountId = normalizeCodexManagerAccountId(accountId);
  if (!normalizedAccountId) {
    return createCodexManagerSelectionState(selection);
  }

  const normalizedSelection = normalizeCodexManagerSelection(selection.selectedAccountIds);
  if (normalizedSelection.includes(normalizedAccountId)) {
    return {
      ...selection,
      selectedAccountIds: normalizedSelection.filter((candidate) => candidate !== normalizedAccountId),
    };
  }

  return {
    ...selection,
    selectedAccountIds: [...normalizedSelection, normalizedAccountId],
  };
};

export const createEmptyCodexManagerAccountListData = (
  query?: Partial<CodexManagerQueryState>,
): CodexManagerAccountListData => {
  const normalizedQuery = normalizeCodexManagerQueryState(query);
  return {
    items: [],
    total: 0,
    page: normalizedQuery.page,
    pageSize: normalizedQuery.pageSize,
    maxPageSize: CODEX_MANAGER_MAX_PAGE_SIZE,
  };
};

export const createCodexManagerViewState = (
  value?: Partial<CodexManagerViewState>,
): CodexManagerViewState => ({
  activeTab: normalizeCodexManagerTab(value?.activeTab),
  accountsQuery: normalizeCodexManagerQueryState(value?.accountsQuery),
  usageQuery: normalizeCodexManagerQueryState(value?.usageQuery),
  selection: createCodexManagerSelectionState(value?.selection),
});
