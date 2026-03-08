import { useCallback, useMemo, useState } from "react";
import { codexManagerApi } from "@/lib/http/apis";
import type {
  CodexManagerAccountDetail,
  CodexManagerAccountListData,
  CodexManagerAccountUsage,
} from "@/lib/http/types";
import {
  createCodexManagerSelectionState,
  createCodexManagerViewState,
  createEmptyCodexManagerAccountListData,
  normalizeCodexManagerQueryState,
  normalizeCodexManagerSelection,
  normalizeCodexManagerTab,
  setCodexManagerSelectedAccountId,
  toggleCodexManagerSelection,
  type CodexManagerQueryState,
  type CodexManagerTab,
  type CodexManagerViewState,
} from "@/modules/codex-manager/model";

export interface CodexManagerResourceState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

export interface UseCodexManagerDataResult {
  state: CodexManagerViewState;
  resources: {
    accountsList: CodexManagerResourceState<CodexManagerAccountListData>;
    accountDetail: CodexManagerResourceState<CodexManagerAccountDetail | null>;
    usageList: CodexManagerResourceState<CodexManagerAccountListData>;
    accountUsage: CodexManagerResourceState<CodexManagerAccountUsage | null>;
  };
  actions: {
    setActiveTab: (tab: CodexManagerTab) => void;
    setAccountsQuery: (next: Partial<CodexManagerQueryState>) => void;
    setUsageQuery: (next: Partial<CodexManagerQueryState>) => void;
    setSelectedAccountId: (accountId: string | null) => void;
    setSelectedAccountIds: (accountIds: string[]) => void;
    toggleSelectedAccountId: (accountId: string) => void;
    clearSelectedAccountIds: () => void;
    loadAccountsList: (overrideQuery?: Partial<CodexManagerQueryState>) => Promise<CodexManagerAccountListData | null>;
    loadUsageList: (overrideQuery?: Partial<CodexManagerQueryState>) => Promise<CodexManagerAccountListData | null>;
    loadAccountDetail: (accountId: string) => Promise<CodexManagerAccountDetail | null>;
    loadSelectedAccountDetail: () => Promise<CodexManagerAccountDetail | null>;
    loadAccountUsage: (accountId: string) => Promise<CodexManagerAccountUsage | null>;
    loadSelectedAccountUsage: () => Promise<CodexManagerAccountUsage | null>;
    reset: () => void;
  };
}

const createResourceState = <T,>(data: T): CodexManagerResourceState<T> => ({
  data,
  loading: false,
  error: null,
});

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed || fallback;
  }
  return fallback;
};

export function useCodexManagerData(
  initialState?: Partial<CodexManagerViewState>,
): UseCodexManagerDataResult {
  const normalizedInitialState = useMemo(() => createCodexManagerViewState(initialState), [initialState]);
  const initialAccountsList = useMemo(
    () => createEmptyCodexManagerAccountListData(normalizedInitialState.accountsQuery),
    [normalizedInitialState.accountsQuery],
  );
  const initialUsageList = useMemo(
    () => createEmptyCodexManagerAccountListData(normalizedInitialState.usageQuery),
    [normalizedInitialState.usageQuery],
  );

  const [state, setState] = useState<CodexManagerViewState>(normalizedInitialState);
  const [accountsList, setAccountsList] = useState<CodexManagerResourceState<CodexManagerAccountListData>>(
    createResourceState(initialAccountsList),
  );
  const [accountDetail, setAccountDetail] = useState<CodexManagerResourceState<CodexManagerAccountDetail | null>>(
    createResourceState(null),
  );
  const [usageList, setUsageList] = useState<CodexManagerResourceState<CodexManagerAccountListData>>(
    createResourceState(initialUsageList),
  );
  const [accountUsage, setAccountUsage] = useState<CodexManagerResourceState<CodexManagerAccountUsage | null>>(
    createResourceState(null),
  );

  const setActiveTab = useCallback((tab: CodexManagerTab) => {
    setState((previous) => ({
      ...previous,
      activeTab: normalizeCodexManagerTab(tab),
    }));
  }, []);

  const setAccountsQuery = useCallback((next: Partial<CodexManagerQueryState>) => {
    setState((previous) => ({
      ...previous,
      accountsQuery: normalizeCodexManagerQueryState({ ...previous.accountsQuery, ...next }),
    }));
  }, []);

  const setUsageQuery = useCallback((next: Partial<CodexManagerQueryState>) => {
    setState((previous) => ({
      ...previous,
      usageQuery: normalizeCodexManagerQueryState({ ...previous.usageQuery, ...next }),
    }));
  }, []);

  const setSelectedAccountId = useCallback((accountId: string | null) => {
    setState((previous) => ({
      ...previous,
      selection: setCodexManagerSelectedAccountId(previous.selection, accountId),
    }));
    setAccountDetail(createResourceState(null));
    setAccountUsage(createResourceState(null));
  }, []);

  const setSelectedAccountIds = useCallback((accountIds: string[]) => {
    setState((previous) => ({
      ...previous,
      selection: {
        ...previous.selection,
        selectedAccountIds: normalizeCodexManagerSelection(accountIds),
      },
    }));
  }, []);

  const toggleSelectedAccountId = useCallback((accountId: string) => {
    setState((previous) => ({
      ...previous,
      selection: toggleCodexManagerSelection(previous.selection, accountId),
    }));
  }, []);

  const clearSelectedAccountIds = useCallback(() => {
    setState((previous) => ({
      ...previous,
      selection: createCodexManagerSelectionState({
        ...previous.selection,
        selectedAccountIds: [],
      }),
    }));
  }, []);

  const loadAccountsList = useCallback(async (overrideQuery?: Partial<CodexManagerQueryState>) => {
    const query = overrideQuery ? { ...state.accountsQuery, ...overrideQuery } : state.accountsQuery;
    setAccountsList((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await codexManagerApi.listAccounts(query);
      setAccountsList({ data, loading: false, error: null });
      return data;
    } catch (error: unknown) {
      setAccountsList((previous) => ({
        ...previous,
        loading: false,
        error: getErrorMessage(error, "加载 Codex 账号列表失败"),
      }));
      return null;
    }
  }, [state.accountsQuery]);

  const loadUsageList = useCallback(async (overrideQuery?: Partial<CodexManagerQueryState>) => {
    const query = overrideQuery ? { ...state.usageQuery, ...overrideQuery } : state.usageQuery;
    setUsageList((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await codexManagerApi.listUsage(query);
      setUsageList({ data, loading: false, error: null });
      return data;
    } catch (error: unknown) {
      setUsageList((previous) => ({
        ...previous,
        loading: false,
        error: getErrorMessage(error, "加载 Codex 用量列表失败"),
      }));
      return null;
    }
  }, [state.usageQuery]);

  const loadAccountDetail = useCallback(async (accountId: string) => {
    const targetSelection = setCodexManagerSelectedAccountId(createCodexManagerSelectionState(), accountId);
    if (!targetSelection.selectedAccountId) {
      setAccountDetail(createResourceState(null));
      return null;
    }

    setAccountDetail((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await codexManagerApi.getAccount(targetSelection.selectedAccountId);
      setAccountDetail({ data, loading: false, error: null });
      return data;
    } catch (error: unknown) {
      setAccountDetail((previous) => ({
        ...previous,
        loading: false,
        error: getErrorMessage(error, "加载 Codex 账号详情失败"),
      }));
      return null;
    }
  }, []);

  const loadSelectedAccountDetail = useCallback(async () => {
    if (!state.selection.selectedAccountId) {
      setAccountDetail(createResourceState(null));
      return null;
    }
    return loadAccountDetail(state.selection.selectedAccountId);
  }, [loadAccountDetail, state.selection.selectedAccountId]);

  const loadAccountUsage = useCallback(async (accountId: string) => {
    const targetSelection = setCodexManagerSelectedAccountId(createCodexManagerSelectionState(), accountId);
    if (!targetSelection.selectedAccountId) {
      setAccountUsage(createResourceState(null));
      return null;
    }

    setAccountUsage((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await codexManagerApi.getAccountUsage(targetSelection.selectedAccountId);
      setAccountUsage({ data, loading: false, error: null });
      return data;
    } catch (error: unknown) {
      setAccountUsage((previous) => ({
        ...previous,
        loading: false,
        error: getErrorMessage(error, "加载 Codex 账号用量失败"),
      }));
      return null;
    }
  }, []);

  const loadSelectedAccountUsage = useCallback(async () => {
    if (!state.selection.selectedAccountId) {
      setAccountUsage(createResourceState(null));
      return null;
    }
    return loadAccountUsage(state.selection.selectedAccountId);
  }, [loadAccountUsage, state.selection.selectedAccountId]);

  const reset = useCallback(() => {
    setState(normalizedInitialState);
    setAccountsList(createResourceState(initialAccountsList));
    setUsageList(createResourceState(initialUsageList));
    setAccountDetail(createResourceState(null));
    setAccountUsage(createResourceState(null));
  }, [initialAccountsList, initialUsageList, normalizedInitialState]);

  return {
    state,
    resources: {
      accountsList,
      accountDetail,
      usageList,
      accountUsage,
    },
    actions: {
      setActiveTab,
      setAccountsQuery,
      setUsageQuery,
      setSelectedAccountId,
      setSelectedAccountIds,
      toggleSelectedAccountId,
      clearSelectedAccountIds,
      loadAccountsList,
      loadUsageList,
      loadAccountDetail,
      loadSelectedAccountDetail,
      loadAccountUsage,
      loadSelectedAccountUsage,
      reset,
    },
  };
}
