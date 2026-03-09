import { useCallback, useMemo, useState } from "react";
import { codexManagerApi } from "@/lib/http/apis";
import type {
  CodexManagerAccount,
  CodexManagerAccountUsage,
  CodexManagerDeleteData,
  CodexManagerDeleteUnavailableData,
  CodexManagerExportData,
  CodexManagerImportData,
  CodexManagerImportPayload,
  CodexManagerLoginCompleteData,
  CodexManagerLoginCompletePayload,
  CodexManagerLoginStartData,
  CodexManagerLoginStartPayload,
  CodexManagerLoginStatusData,
  CodexManagerUsageRefreshBatchData,
} from "@/lib/http/types";

export interface CodexManagerActionsPendingState {
  startLogin: boolean;
  getLoginStatus: boolean;
  completeLogin: boolean;
  importAccounts: boolean;
  exportAccounts: boolean;
  deleteUnavailableAccounts: boolean;
  deleteAccount: boolean;
  setRelayState: boolean;
  refreshAccountUsage: boolean;
  refreshUsageBatch: boolean;
}

export interface CodexManagerActionsErrorState {
  startLogin: string | null;
  getLoginStatus: string | null;
  completeLogin: string | null;
  importAccounts: string | null;
  exportAccounts: string | null;
  deleteUnavailableAccounts: string | null;
  deleteAccount: string | null;
  setRelayState: string | null;
  refreshAccountUsage: string | null;
  refreshUsageBatch: string | null;
}

export interface CodexManagerActionsResultState {
  startLogin: CodexManagerLoginStartData | null;
  getLoginStatus: CodexManagerLoginStatusData | null;
  completeLogin: CodexManagerLoginCompleteData | null;
  importAccounts: CodexManagerImportData | null;
  exportAccounts: CodexManagerExportData | null;
  deleteUnavailableAccounts: CodexManagerDeleteUnavailableData | null;
  deleteAccount: CodexManagerDeleteData | null;
  setRelayState: CodexManagerAccount | null;
  refreshAccountUsage: CodexManagerAccountUsage | null;
  refreshUsageBatch: CodexManagerUsageRefreshBatchData | null;
}

export interface CodexManagerActionsState {
  pending: CodexManagerActionsPendingState;
  error: CodexManagerActionsErrorState;
  result: CodexManagerActionsResultState;
}

export interface UseCodexManagerActionsResult {
  state: CodexManagerActionsState;
  actions: {
    startLogin: (
      payload?: CodexManagerLoginStartPayload,
    ) => Promise<CodexManagerLoginStartData | null>;
    getLoginStatus: (loginId: string) => Promise<CodexManagerLoginStatusData | null>;
    completeLogin: (
      payload: CodexManagerLoginCompletePayload,
    ) => Promise<CodexManagerLoginCompleteData | null>;
    importAccounts: (payload: CodexManagerImportPayload) => Promise<CodexManagerImportData | null>;
    exportAccounts: () => Promise<CodexManagerExportData | null>;
    deleteUnavailableAccounts: () => Promise<CodexManagerDeleteUnavailableData | null>;
    deleteAccount: (accountId: string) => Promise<CodexManagerDeleteData | null>;
    setRelayState: (
      accountId: string,
      relayEnabled: boolean,
    ) => Promise<CodexManagerAccount | null>;
    refreshAccountUsage: (accountId: string) => Promise<CodexManagerAccountUsage | null>;
    refreshUsageBatch: (accountIds: string[]) => Promise<CodexManagerUsageRefreshBatchData | null>;
  };
}

type CodexManagerActionKey = keyof CodexManagerActionsResultState;

const ACTION_ERROR_MESSAGES: Record<CodexManagerActionKey, string> = {
  startLogin: "启动 Codex 登录失败",
  getLoginStatus: "获取 Codex 登录状态失败",
  completeLogin: "完成 Codex 登录失败",
  importAccounts: "导入 Codex 账号失败",
  exportAccounts: "导出 Codex 账号失败",
  deleteUnavailableAccounts: "清理不可用免费 Codex 账号失败",
  deleteAccount: "删除 Codex 账号失败",
  setRelayState: "更新 Codex Relay 状态失败",
  refreshAccountUsage: "刷新 Codex 账号用量失败",
  refreshUsageBatch: "批量刷新 Codex 用量失败",
};

const createPendingState = (): CodexManagerActionsPendingState => ({
  startLogin: false,
  getLoginStatus: false,
  completeLogin: false,
  importAccounts: false,
  exportAccounts: false,
  deleteUnavailableAccounts: false,
  deleteAccount: false,
  setRelayState: false,
  refreshAccountUsage: false,
  refreshUsageBatch: false,
});

const createErrorState = (): CodexManagerActionsErrorState => ({
  startLogin: null,
  getLoginStatus: null,
  completeLogin: null,
  importAccounts: null,
  exportAccounts: null,
  deleteUnavailableAccounts: null,
  deleteAccount: null,
  setRelayState: null,
  refreshAccountUsage: null,
  refreshUsageBatch: null,
});

const createResultState = (): CodexManagerActionsResultState => ({
  startLogin: null,
  getLoginStatus: null,
  completeLogin: null,
  importAccounts: null,
  exportAccounts: null,
  deleteUnavailableAccounts: null,
  deleteAccount: null,
  setRelayState: null,
  refreshAccountUsage: null,
  refreshUsageBatch: null,
});

const updateActionState = <
  T extends Record<CodexManagerActionKey, unknown>,
  K extends CodexManagerActionKey,
>(
  state: T,
  key: K,
  value: T[K],
): T =>
  ({
    ...state,
    [key]: value,
  }) as T;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed || fallback;
  }

  return fallback;
};

export function useCodexManagerActions(): UseCodexManagerActionsResult {
  const [pending, setPending] = useState<CodexManagerActionsPendingState>(createPendingState);
  const [error, setError] = useState<CodexManagerActionsErrorState>(createErrorState);
  const [result, setResult] = useState<CodexManagerActionsResultState>(createResultState);

  const runAction = useCallback(
    async <K extends CodexManagerActionKey>(
      key: K,
      runner: () => Promise<CodexManagerActionsResultState[K]>,
    ): Promise<CodexManagerActionsResultState[K] | null> => {
      setPending((previous) => updateActionState(previous, key, true));
      setError((previous) => updateActionState(previous, key, null));
      setResult((previous) => updateActionState(previous, key, null));

      try {
        const nextResult = await runner();
        setResult((previous) => updateActionState(previous, key, nextResult));
        setPending((previous) => updateActionState(previous, key, false));
        return nextResult;
      } catch (caughtError: unknown) {
        setPending((previous) => updateActionState(previous, key, false));
        setError((previous) =>
          updateActionState(
            previous,
            key,
            getErrorMessage(caughtError, ACTION_ERROR_MESSAGES[key]),
          ),
        );
        return null;
      }
    },
    [],
  );

  const startLogin = useCallback(
    (payload: CodexManagerLoginStartPayload = {}) =>
      runAction("startLogin", () => codexManagerApi.startLogin(payload)),
    [runAction],
  );

  const getLoginStatus = useCallback(
    (loginId: string) => runAction("getLoginStatus", () => codexManagerApi.getLoginStatus(loginId)),
    [runAction],
  );

  const completeLogin = useCallback(
    (payload: CodexManagerLoginCompletePayload) =>
      runAction("completeLogin", () => codexManagerApi.completeLogin(payload)),
    [runAction],
  );

  const importAccounts = useCallback(
    (payload: CodexManagerImportPayload) =>
      runAction("importAccounts", () => codexManagerApi.importAccounts(payload)),
    [runAction],
  );

  const exportAccounts = useCallback(
    () => runAction("exportAccounts", () => codexManagerApi.exportAccounts()),
    [runAction],
  );

  const deleteUnavailableAccounts = useCallback(
    () => runAction("deleteUnavailableAccounts", () => codexManagerApi.deleteUnavailableAccounts()),
    [runAction],
  );

  const deleteAccount = useCallback(
    (accountId: string) =>
      runAction("deleteAccount", () => codexManagerApi.deleteAccount(accountId)),
    [runAction],
  );

  const setRelayState = useCallback(
    (accountId: string, relayEnabled: boolean) =>
      runAction("setRelayState", () => codexManagerApi.setRelayState(accountId, relayEnabled)),
    [runAction],
  );

  const refreshAccountUsage = useCallback(
    (accountId: string) =>
      runAction("refreshAccountUsage", () => codexManagerApi.refreshAccountUsage(accountId)),
    [runAction],
  );

  const refreshUsageBatch = useCallback(
    (accountIds: string[]) =>
      runAction("refreshUsageBatch", () => codexManagerApi.refreshUsageBatch(accountIds)),
    [runAction],
  );

  const state = useMemo(
    () => ({
      pending,
      error,
      result,
    }),
    [error, pending, result],
  );

  const actions = useMemo(
    () => ({
      startLogin,
      getLoginStatus,
      completeLogin,
      importAccounts,
      exportAccounts,
      deleteUnavailableAccounts,
      deleteAccount,
      setRelayState,
      refreshAccountUsage,
      refreshUsageBatch,
    }),
    [
      completeLogin,
      deleteUnavailableAccounts,
      deleteAccount,
      exportAccounts,
      getLoginStatus,
      importAccounts,
      refreshAccountUsage,
      refreshUsageBatch,
      setRelayState,
      startLogin,
    ],
  );

  return {
    state,
    actions,
  };
}
