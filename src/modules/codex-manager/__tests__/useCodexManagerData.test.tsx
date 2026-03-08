import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useCodexManagerData } from "@/modules/codex-manager";

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getAccount: vi.fn(),
  listUsage: vi.fn(),
  getAccountUsage: vi.fn(),
}));

vi.mock("@/lib/http/apis", () => ({
  codexManagerApi: {
    listAccounts: mocks.listAccounts,
    getAccount: mocks.getAccount,
    listUsage: mocks.listUsage,
    getAccountUsage: mocks.getAccountUsage,
  },
}));

describe("useCodexManagerData", () => {
  beforeEach(() => {
    mocks.listAccounts.mockReset();
    mocks.getAccount.mockReset();
    mocks.listUsage.mockReset();
    mocks.getAccountUsage.mockReset();
  });

  test("initializes stable state and empty resource containers", () => {
    const { result } = renderHook(() => useCodexManagerData());

    expect(result.current.state.activeTab).toBe("accounts");
    expect(result.current.state.accountsQuery).toEqual({ page: 1, pageSize: 20, query: "" });
    expect(result.current.state.usageQuery).toEqual({ page: 1, pageSize: 20, query: "" });
    expect(result.current.state.selection).toEqual({
      selectedAccountId: null,
      selectedAccountIds: [],
    });
    expect(result.current.resources.accountsList.data).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      maxPageSize: 100,
    });
    expect(result.current.resources.accountDetail).toEqual({
      data: null,
      loading: false,
      error: null,
    });
    expect(result.current.resources.accountUsage).toEqual({
      data: null,
      loading: false,
      error: null,
    });
  });

  test("updates query and selection state with normalized values", () => {
    const { result } = renderHook(() => useCodexManagerData());

    act(() => {
      result.current.actions.setActiveTab("quota");
      result.current.actions.setAccountsQuery({ page: 0, pageSize: 999, query: " team-a " });
      result.current.actions.setUsageQuery({ page: 2, pageSize: 5, query: " usage " });
      result.current.actions.setSelectedAccountId(" acc-alpha ");
      result.current.actions.setSelectedAccountIds([" acc-alpha ", "", "acc-alpha", "acc-bravo"]);
      result.current.actions.toggleSelectedAccountId("acc-charlie");
      result.current.actions.toggleSelectedAccountId("acc-bravo");
    });

    expect(result.current.state.activeTab).toBe("quota");
    expect(result.current.state.accountsQuery).toEqual({ page: 1, pageSize: 100, query: "team-a" });
    expect(result.current.state.usageQuery).toEqual({ page: 2, pageSize: 5, query: "usage" });
    expect(result.current.state.selection.selectedAccountId).toBe("acc-alpha");
    expect(result.current.state.selection.selectedAccountIds).toEqual(["acc-alpha", "acc-charlie"]);
  });

  test("load actions call codexManagerApi methods and store returned data", async () => {
    mocks.listAccounts.mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      pageSize: 5,
      maxPageSize: 100,
    });
    mocks.getAccount.mockResolvedValue({
      accountId: "acc-alpha",
      label: "Alpha",
      groupName: "team-a",
      status: "active",
      sort: 10,
      relayEnabled: true,
      runtimeSource: "codex_manager",
      runtimeIncluded: true,
      usageSummary: null,
      lastSyncedAt: null,
      stale: false,
      usageSnapshot: null,
    });
    mocks.listUsage.mockResolvedValue({
      items: [],
      total: 0,
      page: 3,
      pageSize: 10,
      maxPageSize: 100,
    });
    mocks.getAccountUsage.mockResolvedValue({
      accountId: "acc-alpha",
      usageSummary: { availabilityStatus: "available", usedPercent: 42, windowMinutes: 60 },
      snapshot: { accountId: "acc-alpha", usedPercent: 42, windowMinutes: 60 },
    });

    const { result } = renderHook(() => useCodexManagerData());

    act(() => {
      result.current.actions.setAccountsQuery({ page: 2, pageSize: 5, query: " alpha " });
      result.current.actions.setUsageQuery({ page: 3, pageSize: 10, query: " quota " });
      result.current.actions.setSelectedAccountId(" acc-alpha ");
    });

    await act(async () => {
      await result.current.actions.loadAccountsList();
      await result.current.actions.loadSelectedAccountDetail();
      await result.current.actions.loadUsageList();
      await result.current.actions.loadSelectedAccountUsage();
    });

    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenCalledWith({ page: 2, pageSize: 5, query: "alpha" });
      expect(mocks.getAccount).toHaveBeenCalledWith("acc-alpha");
      expect(mocks.listUsage).toHaveBeenCalledWith({ page: 3, pageSize: 10, query: "quota" });
      expect(mocks.getAccountUsage).toHaveBeenCalledWith("acc-alpha");
    });

    expect(result.current.resources.accountsList.data.page).toBe(2);
    expect(result.current.resources.accountDetail.data?.accountId).toBe("acc-alpha");
    expect(result.current.resources.usageList.data.page).toBe(3);
    expect(result.current.resources.accountUsage.data?.snapshot?.accountId).toBe("acc-alpha");
    expect(result.current.resources.accountsList.error).toBeNull();
    expect(result.current.resources.usageList.loading).toBe(false);
  });
});
