import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  CodexManagerAccount,
  CodexManagerAccountUsage,
  CodexManagerDeleteData,
  CodexManagerDeleteUnavailableData,
  CodexManagerImportData,
  CodexManagerLoginCompleteData,
  CodexManagerLoginStartData,
  CodexManagerLoginStatusData,
  CodexManagerUsageRefreshBatchData,
} from "@/lib/http/types";
import { useCodexManagerActions } from "@/modules/codex-manager/useCodexManagerActions";

const mocks = vi.hoisted(() => ({
  startLogin: vi.fn(),
  getLoginStatus: vi.fn(),
  completeLogin: vi.fn(),
  importAccounts: vi.fn(),
  exportAccounts: vi.fn(),
  deleteUnavailableAccounts: vi.fn(),
  deleteAccount: vi.fn(),
  setRelayState: vi.fn(),
  refreshAccountUsage: vi.fn(),
  refreshUsageBatch: vi.fn(),
}));

vi.mock("@/lib/http/apis", () => ({
  codexManagerApi: {
    startLogin: mocks.startLogin,
    getLoginStatus: mocks.getLoginStatus,
    completeLogin: mocks.completeLogin,
    importAccounts: mocks.importAccounts,
    exportAccounts: mocks.exportAccounts,
    deleteUnavailableAccounts: mocks.deleteUnavailableAccounts,
    deleteAccount: mocks.deleteAccount,
    setRelayState: mocks.setRelayState,
    refreshAccountUsage: mocks.refreshAccountUsage,
    refreshUsageBatch: mocks.refreshUsageBatch,
  },
}));

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
};

describe("useCodexManagerActions", () => {
  beforeEach(() => {
    mocks.startLogin.mockReset();
    mocks.getLoginStatus.mockReset();
    mocks.completeLogin.mockReset();
    mocks.importAccounts.mockReset();
    mocks.exportAccounts.mockReset();
    mocks.deleteUnavailableAccounts.mockReset();
    mocks.deleteAccount.mockReset();
    mocks.setRelayState.mockReset();
    mocks.refreshAccountUsage.mockReset();
    mocks.refreshUsageBatch.mockReset();
  });

  test("covers export and delete-unavailable actions and keeps their states isolated", async () => {
    const exportBlob = new Blob(["zip-bytes"], { type: "application/zip" });
    const cleanupData: CodexManagerDeleteUnavailableData = {
      scanned: 4,
      deleted: 2,
      skippedAvailable: 1,
      skippedNonFree: 1,
      skippedMissingUsage: 0,
      skippedMissingToken: 0,
      deletedAccountIds: ["acc-alpha", "acc-bravo"],
      localCredentialsRemoved: 2,
      localProjectionsTombstoned: 2,
    };

    const exportDeferred = createDeferred<Blob>();
    mocks.exportAccounts.mockReturnValueOnce(exportDeferred.promise);
    mocks.deleteUnavailableAccounts.mockResolvedValueOnce(cleanupData);

    const { result } = renderHook(() => useCodexManagerActions());

    let exportPromise!: Promise<Blob | null>;
    act(() => {
      exportPromise = result.current.actions.exportAccounts();
    });

    expect(mocks.exportAccounts).toHaveBeenCalledTimes(1);
    expect(result.current.state.pending.exportAccounts).toBe(true);
    expect(result.current.state.error.exportAccounts).toBeNull();
    expect(result.current.state.result.exportAccounts).toBeNull();

    exportDeferred.resolve(exportBlob);
    await act(async () => {
      await exportPromise;
    });

    await waitFor(() => {
      expect(result.current.state.pending.exportAccounts).toBe(false);
      expect(result.current.state.result.exportAccounts).toBe(exportBlob);
    });

    await act(async () => {
      const cleanupResult = await result.current.actions.deleteUnavailableAccounts();
      expect(cleanupResult).toEqual(cleanupData);
    });

    expect(mocks.deleteUnavailableAccounts).toHaveBeenCalledTimes(1);
    expect(result.current.state.pending.deleteUnavailableAccounts).toBe(false);
    expect(result.current.state.error.deleteUnavailableAccounts).toBeNull();
    expect(result.current.state.result.deleteUnavailableAccounts).toEqual(cleanupData);
    expect(result.current.state.result.exportAccounts).toBe(exportBlob);
  });

  test("covers login actions and toggles pending before and after promise resolution", async () => {
    const startLoginData: CodexManagerLoginStartData = {
      loginId: "login-1",
      authUrl: "http://example.test/auth",
      loginType: "device",
      issuer: "codex",
      clientId: "client-1",
      redirectUri: "http://127.0.0.1/callback",
      warning: null,
      device: null,
    };
    const loginStatusData: CodexManagerLoginStatusData = {
      loginId: "login-1",
      status: "in_progress",
      upstreamStatus: "pending",
      terminal: false,
      error: null,
      updatedAt: "2026-03-08T02:30:00Z",
    };
    const completeLoginData: CodexManagerLoginCompleteData = {
      status: "success",
      completed: true,
    };

    const startLoginDeferred = createDeferred<CodexManagerLoginStartData>();
    mocks.startLogin.mockReturnValueOnce(startLoginDeferred.promise);
    mocks.getLoginStatus.mockResolvedValueOnce(loginStatusData);
    mocks.completeLogin.mockResolvedValueOnce(completeLoginData);

    const { result } = renderHook(() => useCodexManagerActions());

    let startLoginPromise!: Promise<CodexManagerLoginStartData | null>;
    act(() => {
      startLoginPromise = result.current.actions.startLogin({ type: "device", openBrowser: false });
    });

    expect(mocks.startLogin).toHaveBeenCalledWith({ type: "device", openBrowser: false });
    expect(result.current.state.pending.startLogin).toBe(true);
    expect(result.current.state.error.startLogin).toBeNull();
    expect(result.current.state.result.startLogin).toBeNull();

    startLoginDeferred.resolve(startLoginData);
    await act(async () => {
      await startLoginPromise;
    });

    await waitFor(() => {
      expect(result.current.state.pending.startLogin).toBe(false);
      expect(result.current.state.result.startLogin).toEqual(startLoginData);
    });

    await act(async () => {
      const loginStatusResult = await result.current.actions.getLoginStatus("login-1");
      const completeLoginResult = await result.current.actions.completeLogin({
        state: "state-1",
        code: "code-1",
        redirectUri: "http://127.0.0.1/callback",
      });

      expect(loginStatusResult).toEqual(loginStatusData);
      expect(completeLoginResult).toEqual(completeLoginData);
    });

    expect(mocks.getLoginStatus).toHaveBeenCalledWith("login-1");
    expect(mocks.completeLogin).toHaveBeenCalledWith({
      state: "state-1",
      code: "code-1",
      redirectUri: "http://127.0.0.1/callback",
    });
    expect(result.current.state.pending.getLoginStatus).toBe(false);
    expect(result.current.state.pending.completeLogin).toBe(false);
    expect(result.current.state.error.getLoginStatus).toBeNull();
    expect(result.current.state.error.completeLogin).toBeNull();
    expect(result.current.state.result.getLoginStatus).toEqual(loginStatusData);
    expect(result.current.state.result.completeLogin).toEqual(completeLoginData);
  });

  test("covers import delete relay refresh-batch params and writes readable errors", async () => {
    const importError = new Error("导入失败");
    const deleteError = new Error("删除失败");
    const refreshBatchError = new Error("批量刷新失败");
    const relayStateData: CodexManagerAccount = {
      accountId: "acc-alpha",
      label: "Alpha",
      groupName: "team-a",
      status: "active",
      sort: 10,
      relayEnabled: false,
      runtimeSource: "codex_manager",
      runtimeIncluded: false,
      usageSummary: null,
      lastSyncedAt: null,
      stale: false,
    };

    mocks.importAccounts.mockRejectedValueOnce(importError);
    mocks.deleteAccount.mockRejectedValueOnce(deleteError);
    mocks.setRelayState.mockResolvedValueOnce(relayStateData);
    mocks.refreshUsageBatch.mockRejectedValueOnce(refreshBatchError);

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const importResult = await result.current.actions.importAccounts({
        contents: ['{"auth":1}'],
        content: '{"auth":2}',
      });
      expect(importResult).toBeNull();
    });

    expect(mocks.importAccounts).toHaveBeenCalledWith({
      contents: ['{"auth":1}'],
      content: '{"auth":2}',
    });
    expect(result.current.state.pending.importAccounts).toBe(false);
    expect(result.current.state.error.importAccounts).toBe("导入失败");

    await act(async () => {
      const deleteResult = await result.current.actions.deleteAccount("acc-alpha");
      const relayStateResult = await result.current.actions.setRelayState("acc-alpha", false);
      const refreshBatchResult = await result.current.actions.refreshUsageBatch([
        "acc-alpha",
        "acc-bravo",
      ]);

      expect(deleteResult).toBeNull();
      expect(relayStateResult).toEqual(relayStateData);
      expect(refreshBatchResult).toBeNull();
    });

    expect(mocks.deleteAccount).toHaveBeenCalledWith("acc-alpha");
    expect(mocks.setRelayState).toHaveBeenCalledWith("acc-alpha", false);
    expect(mocks.refreshUsageBatch).toHaveBeenCalledWith(["acc-alpha", "acc-bravo"]);
    expect(Array.isArray(mocks.refreshUsageBatch.mock.calls[0]?.[0])).toBe(true);
    expect(result.current.state.error.deleteAccount).toBe("删除失败");
    expect(result.current.state.error.setRelayState).toBeNull();
    expect(result.current.state.error.refreshUsageBatch).toBe("批量刷新失败");
    expect(result.current.state.result.deleteAccount).toBeNull();
    expect(result.current.state.result.setRelayState).toEqual(relayStateData);
    expect(result.current.state.result.refreshUsageBatch).toBeNull();
  });

  test("covers refreshAccountUsage success path and keeps other action results independent", async () => {
    const refreshUsageData: CodexManagerAccountUsage = {
      accountId: "acc-alpha",
      usageSummary: {
        availabilityStatus: "available",
        usedPercent: 42,
        windowMinutes: 60,
      },
      snapshot: {
        accountId: "acc-alpha",
        usedPercent: 42,
        windowMinutes: 60,
      },
    };
    const refreshBatchData: CodexManagerUsageRefreshBatchData = {
      items: [
        {
          accountId: "acc-alpha",
          success: true,
          reason: null,
          usageSummary: {
            availabilityStatus: "available",
            usedPercent: 42,
            windowMinutes: 60,
          },
          snapshot: {
            accountId: "acc-alpha",
            usedPercent: 42,
            windowMinutes: 60,
          },
        },
      ],
      total: 1,
      successCount: 1,
      failedCount: 0,
    };

    const refreshUsageDeferred = createDeferred<CodexManagerAccountUsage>();
    mocks.refreshAccountUsage.mockReturnValueOnce(refreshUsageDeferred.promise);
    mocks.refreshUsageBatch.mockResolvedValueOnce(refreshBatchData);

    const { result } = renderHook(() => useCodexManagerActions());

    let refreshUsagePromise!: Promise<CodexManagerAccountUsage | null>;
    act(() => {
      refreshUsagePromise = result.current.actions.refreshAccountUsage("acc-alpha");
    });

    expect(mocks.refreshAccountUsage).toHaveBeenCalledWith("acc-alpha");
    expect(result.current.state.pending.refreshAccountUsage).toBe(true);
    expect(result.current.state.result.refreshAccountUsage).toBeNull();

    refreshUsageDeferred.resolve(refreshUsageData);
    await act(async () => {
      await refreshUsagePromise;
    });

    await waitFor(() => {
      expect(result.current.state.pending.refreshAccountUsage).toBe(false);
      expect(result.current.state.error.refreshAccountUsage).toBeNull();
      expect(result.current.state.result.refreshAccountUsage).toEqual(refreshUsageData);
    });

    await act(async () => {
      const refreshBatchResult = await result.current.actions.refreshUsageBatch(["acc-alpha"]);
      expect(refreshBatchResult).toEqual(refreshBatchData);
    });

    expect(result.current.state.error.refreshUsageBatch).toBeNull();
    expect(result.current.state.result.refreshUsageBatch).toEqual(refreshBatchData);
  });

  test("uses fallback error message when api throws non-Error values", async () => {
    mocks.startLogin.mockRejectedValueOnce("boom");

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const startLoginResult = await result.current.actions.startLogin({ type: "device" });
      expect(startLoginResult).toBeNull();
    });

    expect(result.current.state.pending.startLogin).toBe(false);
    expect(result.current.state.error.startLogin).toBe("启动 Codex 登录失败");
    expect(result.current.state.result.startLogin).toBeNull();
  });

  test("stores readable error for completeLogin when api throws Error", async () => {
    mocks.completeLogin.mockRejectedValueOnce(new Error("完成失败"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const completeLoginResult = await result.current.actions.completeLogin({
        state: "state-2",
        code: "code-2",
      });
      expect(completeLoginResult).toBeNull();
    });

    expect(result.current.state.pending.completeLogin).toBe(false);
    expect(result.current.state.error.completeLogin).toBe("完成失败");
    expect(result.current.state.result.completeLogin).toBeNull();
  });

  test("stores readable errors for exportAccounts and deleteUnavailableAccounts", async () => {
    mocks.exportAccounts.mockRejectedValueOnce(undefined);
    mocks.deleteUnavailableAccounts.mockRejectedValueOnce(new Error("清理失败"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const exportResult = await result.current.actions.exportAccounts();
      expect(exportResult).toBeNull();
    });

    expect(result.current.state.pending.exportAccounts).toBe(false);
    expect(result.current.state.error.exportAccounts).toBe("导出 Codex 账号失败");
    expect(result.current.state.result.exportAccounts).toBeNull();

    await act(async () => {
      const cleanupResult = await result.current.actions.deleteUnavailableAccounts();
      expect(cleanupResult).toBeNull();
    });

    expect(result.current.state.pending.deleteUnavailableAccounts).toBe(false);
    expect(result.current.state.error.deleteUnavailableAccounts).toBe("清理失败");
    expect(result.current.state.result.deleteUnavailableAccounts).toBeNull();
  });

  test("stores readable error for getLoginStatus when api throws Error", async () => {
    mocks.getLoginStatus.mockRejectedValueOnce(new Error("状态失败"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const loginStatusResult = await result.current.actions.getLoginStatus("login-2");
      expect(loginStatusResult).toBeNull();
    });

    expect(result.current.state.pending.getLoginStatus).toBe(false);
    expect(result.current.state.error.getLoginStatus).toBe("状态失败");
    expect(result.current.state.result.getLoginStatus).toBeNull();
  });

  test("stores readable error for refreshAccountUsage when api throws Error", async () => {
    mocks.refreshAccountUsage.mockRejectedValueOnce(new Error("刷新失败"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const refreshUsageResult = await result.current.actions.refreshAccountUsage("acc-bravo");
      expect(refreshUsageResult).toBeNull();
    });

    expect(result.current.state.pending.refreshAccountUsage).toBe(false);
    expect(result.current.state.error.refreshAccountUsage).toBe("刷新失败");
    expect(result.current.state.result.refreshAccountUsage).toBeNull();
  });

  test("stores readable error for setRelayState when api throws Error", async () => {
    mocks.setRelayState.mockRejectedValueOnce(new Error("relay 失败"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const relayStateResult = await result.current.actions.setRelayState("acc-charlie", true);
      expect(relayStateResult).toBeNull();
    });

    expect(result.current.state.pending.setRelayState).toBe(false);
    expect(result.current.state.error.setRelayState).toBe("relay 失败");
    expect(result.current.state.result.setRelayState).toBeNull();
  });

  test("stores readable error for deleteAccount when api throws non-Error values", async () => {
    mocks.deleteAccount.mockRejectedValueOnce(null);

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const deleteResult = await result.current.actions.deleteAccount("acc-delta");
      expect(deleteResult).toBeNull();
    });

    expect(result.current.state.pending.deleteAccount).toBe(false);
    expect(result.current.state.error.deleteAccount).toBe("删除 Codex 账号失败");
    expect(result.current.state.result.deleteAccount).toBeNull();
  });

  test("stores readable error for importAccounts when api throws non-Error values", async () => {
    mocks.importAccounts.mockRejectedValueOnce(undefined);

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const importResult = await result.current.actions.importAccounts({ content: '{"auth":3}' });
      expect(importResult).toBeNull();
    });

    expect(result.current.state.pending.importAccounts).toBe(false);
    expect(result.current.state.error.importAccounts).toBe("导入 Codex 账号失败");
    expect(result.current.state.result.importAccounts).toBeNull();
  });

  test("stores readable error for refreshUsageBatch when api throws non-Error values", async () => {
    mocks.refreshUsageBatch.mockRejectedValueOnce(0);

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const refreshBatchResult = await result.current.actions.refreshUsageBatch([
        "acc-echo",
        "acc-foxtrot",
      ]);
      expect(refreshBatchResult).toBeNull();
    });

    expect(result.current.state.pending.refreshUsageBatch).toBe(false);
    expect(result.current.state.error.refreshUsageBatch).toBe("批量刷新 Codex 用量失败");
    expect(result.current.state.result.refreshUsageBatch).toBeNull();
  });

  test("stores readable error for startLogin when api throws Error values", async () => {
    mocks.startLogin.mockRejectedValueOnce(new Error("启动失败"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const startLoginResult = await result.current.actions.startLogin({ openBrowser: true });
      expect(startLoginResult).toBeNull();
    });

    expect(result.current.state.pending.startLogin).toBe(false);
    expect(result.current.state.error.startLogin).toBe("启动失败");
    expect(result.current.state.result.startLogin).toBeNull();
  });

  test("stores readable error for refreshUsageBatch when api throws Error values", async () => {
    mocks.refreshUsageBatch.mockRejectedValueOnce(new Error("批量失败"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const refreshBatchResult = await result.current.actions.refreshUsageBatch(["acc-golf"]);
      expect(refreshBatchResult).toBeNull();
    });

    expect(result.current.state.pending.refreshUsageBatch).toBe(false);
    expect(result.current.state.error.refreshUsageBatch).toBe("批量失败");
    expect(result.current.state.result.refreshUsageBatch).toBeNull();
  });

  test("stores readable error for getLoginStatus when api throws non-Error values", async () => {
    mocks.getLoginStatus.mockRejectedValueOnce(false);

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const loginStatusResult = await result.current.actions.getLoginStatus("login-3");
      expect(loginStatusResult).toBeNull();
    });

    expect(result.current.state.pending.getLoginStatus).toBe(false);
    expect(result.current.state.error.getLoginStatus).toBe("获取 Codex 登录状态失败");
    expect(result.current.state.result.getLoginStatus).toBeNull();
  });

  test("stores readable error for completeLogin when api throws non-Error values", async () => {
    mocks.completeLogin.mockRejectedValueOnce(Symbol("err"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const completeLoginResult = await result.current.actions.completeLogin({
        state: "state-3",
        code: "code-3",
      });
      expect(completeLoginResult).toBeNull();
    });

    expect(result.current.state.pending.completeLogin).toBe(false);
    expect(result.current.state.error.completeLogin).toBe("完成 Codex 登录失败");
    expect(result.current.state.result.completeLogin).toBeNull();
  });

  test("stores readable error for setRelayState when api throws non-Error values", async () => {
    mocks.setRelayState.mockRejectedValueOnce({});

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const relayStateResult = await result.current.actions.setRelayState("acc-hotel", false);
      expect(relayStateResult).toBeNull();
    });

    expect(result.current.state.pending.setRelayState).toBe(false);
    expect(result.current.state.error.setRelayState).toBe("更新 Codex Relay 状态失败");
    expect(result.current.state.result.setRelayState).toBeNull();
  });

  test("stores readable error for refreshAccountUsage when api throws non-Error values", async () => {
    mocks.refreshAccountUsage.mockRejectedValueOnce(1);

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const refreshUsageResult = await result.current.actions.refreshAccountUsage("acc-india");
      expect(refreshUsageResult).toBeNull();
    });

    expect(result.current.state.pending.refreshAccountUsage).toBe(false);
    expect(result.current.state.error.refreshAccountUsage).toBe("刷新 Codex 账号用量失败");
    expect(result.current.state.result.refreshAccountUsage).toBeNull();
  });

  test("stores readable error for importAccounts when api throws Error values", async () => {
    mocks.importAccounts.mockRejectedValueOnce(new Error("导入异常"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const importResult = await result.current.actions.importAccounts({
        contents: ['{"auth":4}'],
      });
      expect(importResult).toBeNull();
    });

    expect(result.current.state.pending.importAccounts).toBe(false);
    expect(result.current.state.error.importAccounts).toBe("导入异常");
    expect(result.current.state.result.importAccounts).toBeNull();
  });

  test("stores readable error for deleteAccount when api throws Error values", async () => {
    mocks.deleteAccount.mockRejectedValueOnce(new Error("删除异常"));

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const deleteResult = await result.current.actions.deleteAccount("acc-juliet");
      expect(deleteResult).toBeNull();
    });

    expect(result.current.state.pending.deleteAccount).toBe(false);
    expect(result.current.state.error.deleteAccount).toBe("删除异常");
    expect(result.current.state.result.deleteAccount).toBeNull();
  });

  test("stores successful results for importAccounts and deleteAccount independently", async () => {
    const importData: CodexManagerImportData = {
      total: 2,
      created: 1,
      updated: 1,
      failed: 0,
      errors: [],
    };
    const deleteData: CodexManagerDeleteData = {
      accountId: "acc-kilo",
      removed: true,
      alreadyRemoved: false,
      notFoundButHandled: false,
    };

    mocks.importAccounts.mockResolvedValueOnce(importData);
    mocks.deleteAccount.mockResolvedValueOnce(deleteData);

    const { result } = renderHook(() => useCodexManagerActions());

    await act(async () => {
      const importResult = await result.current.actions.importAccounts({ content: '{"auth":5}' });
      const deleteResult = await result.current.actions.deleteAccount("acc-kilo");

      expect(importResult).toEqual(importData);
      expect(deleteResult).toEqual(deleteData);
    });

    expect(result.current.state.result.importAccounts).toEqual(importData);
    expect(result.current.state.result.deleteAccount).toEqual(deleteData);
  });
});
