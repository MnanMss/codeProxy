import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { CodexManagerPage } from "@/modules/codex-manager/CodexManagerPage";

const mocks = vi.hoisted(() => ({
  // useCodexManagerData mocks
  listAccounts: vi.fn(),
  getAccount: vi.fn(),
  listUsage: vi.fn(),
  getAccountUsage: vi.fn(),
  // useCodexManagerActions mocks
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

// Mock API client
vi.mock("@/lib/http/apis", () => ({
  codexManagerApi: {
    listAccounts: mocks.listAccounts,
    getAccount: mocks.getAccount,
    listUsage: mocks.listUsage,
    getAccountUsage: mocks.getAccountUsage,
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

// Mock AuthProvider
vi.mock("@/modules/auth/AuthProvider", () => ({
  useAuth: () => ({
    state: { isAuthenticated: true, user: null },
    actions: { login: vi.fn(), logout: vi.fn() },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock ToastProvider
vi.mock("@/modules/ui/ToastProvider", () => ({
  useToast: () => ({ notify: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function TestRouter({ initialEntries = ["/codex-manager"] }: { initialEntries?: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/codex-manager" element={<CodexManagerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const createMockAccount = (accountId: string, overrides: Record<string, unknown> = {}) => ({
  accountId,
  email: `${accountId}@example.com`,
  label: `Account ${accountId}`,
  groupName: "test-group",
  status: "active",
  sort: 1,
  relayEnabled: false,
  runtimeSource: "codex_manager" as const,
  runtimeIncluded: true,
  usageSummary: null,
  lastSyncedAt: null,
  stale: false,
  ...overrides,
});

describe("CodexManagerPage action flow wiring", () => {
  beforeEach(() => {
    // Reset all mocks
    mocks.listAccounts.mockReset();
    mocks.getAccount.mockReset();
    mocks.listUsage.mockReset();
    mocks.getAccountUsage.mockReset();
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

    // Default mock responses for data hook
    mocks.listAccounts.mockResolvedValue({
      items: [createMockAccount("acc-1"), createMockAccount("acc-2", { relayEnabled: true })],
      total: 2,
      page: 1,
      pageSize: 20,
      maxPageSize: 100,
    });
    mocks.listUsage.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      maxPageSize: 100,
    });

    // Default mock responses for action hook (success cases)
    mocks.startLogin.mockResolvedValue({
      loginId: "login-1",
      authUrl: "http://example.test/auth",
      loginType: "device",
      issuer: "codex",
      clientId: "client-1",
      redirectUri: "http://127.0.0.1/callback",
      warning: null,
      device: null,
    });
    mocks.getLoginStatus.mockResolvedValue({
      loginId: "login-1",
      status: "in_progress",
      upstreamStatus: "pending",
      terminal: false,
      error: null,
      updatedAt: "2026-03-08T02:30:00Z",
    });
    mocks.completeLogin.mockResolvedValue({
      status: "success",
      completed: true,
    });
    mocks.importAccounts.mockResolvedValue({
      total: 1,
      created: 1,
      updated: 0,
      failed: 0,
      errors: [],
    });
    mocks.exportAccounts.mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
    mocks.deleteUnavailableAccounts.mockResolvedValue({
      scanned: 2,
      deleted: 1,
      skippedAvailable: 1,
      skippedNonFree: 0,
      skippedMissingUsage: 0,
      skippedMissingToken: 0,
    });
    mocks.deleteAccount.mockResolvedValue({
      accountId: "acc-1",
      removed: true,
      alreadyRemoved: false,
      notFoundButHandled: false,
    });
    mocks.setRelayState.mockResolvedValue({
      accountId: "acc-1",
      label: "Account acc-1",
      groupName: "test-group",
      status: "active",
      sort: 1,
      relayEnabled: true,
      runtimeSource: "codex_manager",
      runtimeIncluded: true,
      usageSummary: null,
      lastSyncedAt: null,
      stale: false,
    });
    mocks.refreshAccountUsage.mockResolvedValue({
      accountId: "acc-1",
      usageSummary: {
        availabilityStatus: "available",
        usedPercent: 50,
        windowMinutes: 60,
      },
      snapshot: {
        accountId: "acc-1",
        usedPercent: 50,
        windowMinutes: 60,
      },
    });
    mocks.refreshUsageBatch.mockResolvedValue({
      items: [
        {
          accountId: "acc-1",
          success: true,
          reason: null,
          usageSummary: {
            availabilityStatus: "available",
            usedPercent: 50,
            windowMinutes: 60,
          },
          snapshot: {
            accountId: "acc-1",
            usedPercent: 50,
            windowMinutes: 60,
          },
        },
      ],
      total: 1,
      successCount: 1,
      failedCount: 0,
    });
  });

  test("clicking codex-login-start calls startLogin action", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-login-start")).toBeInTheDocument();
    });

    const loginButton = screen.getByTestId("codex-login-start");
    await user.click(loginButton);

    await waitFor(() => {
      expect(mocks.startLogin).toHaveBeenCalledWith({ openBrowser: true });
    });
  });

  test("clicking codex-import-button toggles import panel", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-button")).toBeInTheDocument();
    });

    // Initially import panel should not be visible
    expect(screen.queryByTestId("codex-import-panel")).not.toBeInTheDocument();

    // Click import button to show panel
    const importButton = screen.getByTestId("codex-import-button");
    await user.click(importButton);

    // Import panel should now be visible
    await waitFor(() => {
      expect(screen.getByTestId("codex-import-panel")).toBeInTheDocument();
    });

    // Textarea and submit button should be visible
    expect(screen.getByTestId("codex-import-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("codex-import-submit")).toBeInTheDocument();
  });

  test("import flow: open panel, enter content, submit calls importAccounts", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-button")).toBeInTheDocument();
    });

    // Open import panel
    const importButton = screen.getByTestId("codex-import-button");
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-panel")).toBeInTheDocument();
    });

    // Enter import content
    const textarea = screen.getByTestId("codex-import-textarea");
    await user.type(textarea, "test import content");

    // Submit import
    const submitButton = screen.getByTestId("codex-import-submit");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mocks.importAccounts).toHaveBeenCalledWith({ content: "test import content" });
    });
  });

  test("selecting multiple files triggers normalized batch import", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("codex-import-button"));

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-panel")).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId("codex-import-file-input") as HTMLInputElement;
    const legacyFlatFile = new File(
      [
        JSON.stringify({
          label: "Legacy Flat",
          access_token: "access-1",
          idToken: "id-1",
          refreshToken: "refresh-1",
          chatgpt_account_id: "acc-legacy",
        }),
      ],
      "legacy-flat.json",
      { type: "application/json" },
    );
    const legacyArrayFile = new File(
      [
        JSON.stringify([
          {
            label: "Legacy Array",
            accessToken: "access-2",
            id_token: "id-2",
            refresh_token: "refresh-2",
            accountId: "acc-array",
          },
        ]),
      ],
      "legacy-array.json",
      { type: "application/json" },
    );

    await user.upload(fileInput, [legacyFlatFile, legacyArrayFile]);

    await waitFor(() => {
      expect(mocks.importAccounts).toHaveBeenCalledWith({
        contents: [
          JSON.stringify({
            label: "Legacy Flat",
            access_token: "access-1",
            idToken: "id-1",
            refreshToken: "refresh-1",
            chatgpt_account_id: "acc-legacy",
            tokens: {
              access_token: "access-1",
              id_token: "id-1",
              refresh_token: "refresh-1",
              account_id: "acc-legacy",
            },
          }),
          JSON.stringify([
            {
              label: "Legacy Array",
              accessToken: "access-2",
              id_token: "id-2",
              refresh_token: "refresh-2",
              accountId: "acc-array",
              tokens: {
                access_token: "access-2",
                id_token: "id-2",
                refresh_token: "refresh-2",
                account_id: "acc-array",
              },
            },
          ]),
        ],
      });
    });
  });

  test("clicking codex-export-button starts a browser download", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:codex-export");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });

    try {
      render(<TestRouter />);

      await waitFor(() => {
        expect(screen.getByTestId("codex-export-button")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("codex-export-button"));

      await waitFor(() => {
        expect(mocks.exportAccounts).toHaveBeenCalledTimes(1);
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:codex-export");
      });
    } finally {
      clickSpy.mockRestore();
      Object.defineProperty(window.URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(window.URL, "revokeObjectURL", {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  test("clicking codex-delete-unavailable-button calls cleanup action and refreshes list", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-delete-unavailable-button")).toBeInTheDocument();
    });

    mocks.listAccounts.mockClear();

    await user.click(screen.getByTestId("codex-delete-unavailable-button"));

    await waitFor(() => {
      expect(mocks.deleteUnavailableAccounts).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenCalled();
    });
  });

  test("clicking codex-delete-button-{accountId} calls deleteAccount action", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-delete-button-acc-1")).toBeInTheDocument();
    });

    const deleteButton = screen.getByTestId("codex-delete-button-acc-1");
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mocks.deleteAccount).toHaveBeenCalledWith("acc-1");
    });
  });

  test("clicking codex-relay-toggle-{accountId} calls setRelayState action", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-relay-toggle-acc-1")).toBeInTheDocument();
    });

    const relayToggle = screen.getByTestId("codex-relay-toggle-acc-1");
    await user.click(relayToggle);

    await waitFor(() => {
      // acc-1 has relayEnabled: false initially, so toggling should set it to true
      expect(mocks.setRelayState).toHaveBeenCalledWith("acc-1", true);
    });
  });

  test("clicking codex-refresh-one-{accountId} calls refreshAccountUsage action", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-refresh-one-acc-1")).toBeInTheDocument();
    });

    const refreshButton = screen.getByTestId("codex-refresh-one-acc-1");
    await user.click(refreshButton);

    await waitFor(() => {
      expect(mocks.refreshAccountUsage).toHaveBeenCalledWith("acc-1");
    });
  });

  test("selecting accounts and clicking codex-refresh-selected calls refreshUsageBatch", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    // Wait for accounts to render
    await waitFor(() => {
      expect(screen.getByTestId("codex-refresh-selected")).toBeInTheDocument();
    });

    // Initially the button should be disabled (no selection)
    const refreshSelectedButton = screen.getByTestId("codex-refresh-selected");
    expect(refreshSelectedButton).toBeDisabled();

    // Select acc-1 by clicking its checkbox
    const acc1Checkbox = screen.getAllByRole("checkbox")[0];
    await user.click(acc1Checkbox);

    // Button should now be enabled
    await waitFor(() => {
      expect(refreshSelectedButton).not.toBeDisabled();
    });

    // Click the batch refresh button
    await user.click(refreshSelectedButton);

    await waitFor(() => {
      expect(mocks.refreshUsageBatch).toHaveBeenCalledWith(["acc-1"]);
    });
  });

  test("selecting multiple accounts and clicking codex-refresh-selected calls refreshUsageBatch with all selected", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    // Wait for accounts to render
    await waitFor(() => {
      expect(screen.getByTestId("codex-refresh-selected")).toBeInTheDocument();
    });

    // Get all checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);

    // Select both accounts
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    const refreshSelectedButton = screen.getByTestId("codex-refresh-selected");

    // Click the batch refresh button
    await user.click(refreshSelectedButton);

    await waitFor(() => {
      expect(mocks.refreshUsageBatch).toHaveBeenCalledWith(["acc-1", "acc-2"]);
    });
  });

  test("runtime badges show correct text for runtimeIncluded=true", async () => {
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-runtime-badge-acc-1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("codex-runtime-badge-acc-1")).toHaveTextContent(
      "已纳入 CliRelay 调用",
    );
  });

  test("runtime badges show '已本地禁用' for runtimeIncluded=false", async () => {
    mocks.listAccounts.mockResolvedValueOnce({
      items: [createMockAccount("acc-disabled", { runtimeIncluded: false, relayEnabled: false })],
      total: 1,
      page: 1,
      pageSize: 20,
      maxPageSize: 100,
    });

    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-runtime-badge-acc-disabled")).toBeInTheDocument();
    });

    expect(screen.getByTestId("codex-runtime-badge-acc-disabled")).toHaveTextContent("已本地禁用");
  });

  test("runtime badges show '来源不可用' for stale=true", async () => {
    mocks.listAccounts.mockResolvedValueOnce({
      items: [createMockAccount("acc-stale", { stale: true, runtimeIncluded: true })],
      total: 1,
      page: 1,
      pageSize: 20,
      maxPageSize: 100,
    });

    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-runtime-badge-acc-stale")).toBeInTheDocument();
    });

    expect(screen.getByTestId("codex-runtime-badge-acc-stale")).toHaveTextContent("来源不可用");
  });

  test("relay toggle updates from enabled to disabled when clicked", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-relay-toggle-acc-2")).toBeInTheDocument();
    });

    // acc-2 has relayEnabled: true initially, so toggling should set it to false
    const relayToggle = screen.getByTestId("codex-relay-toggle-acc-2");
    await user.click(relayToggle);

    await waitFor(() => {
      expect(mocks.setRelayState).toHaveBeenCalledWith("acc-2", false);
    });
  });

  test("delete action refreshes account list and clears selection state after completion", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-delete-button-acc-1")).toBeInTheDocument();
    });

    const acc1Checkbox = screen.getAllByRole("checkbox")[0];
    await user.click(acc1Checkbox);

    const refreshSelectedButton = screen.getByTestId("codex-refresh-selected");
    await waitFor(() => {
      expect(refreshSelectedButton).not.toBeDisabled();
    });

    mocks.listAccounts.mockClear();

    const deleteButton = screen.getByTestId("codex-delete-button-acc-1");
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mocks.deleteAccount).toHaveBeenCalledWith("acc-1");
    });

    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(refreshSelectedButton).toBeDisabled();
    });
  });

  test("relay toggle refreshes account list after completion", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-relay-toggle-acc-1")).toBeInTheDocument();
    });

    // Clear previous calls from initial load
    mocks.listAccounts.mockClear();

    const relayToggle = screen.getByTestId("codex-relay-toggle-acc-1");
    await user.click(relayToggle);

    // Wait for setRelayState to complete
    await waitFor(() => {
      expect(mocks.setRelayState).toHaveBeenCalled();
    });

    // After toggle completes, loadAccountsList should be called to refresh
    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenCalled();
    });
  });

  test("clicking codex-complete-login-toggle shows complete login panel", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-toggle")).toBeInTheDocument();
    });

    // Initially complete login panel should not be visible
    expect(screen.queryByTestId("codex-complete-login-panel")).not.toBeInTheDocument();

    // Click toggle to show panel
    const toggleButton = screen.getByTestId("codex-complete-login-toggle");
    await user.click(toggleButton);

    // Complete login panel should now be visible
    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-panel")).toBeInTheDocument();
    });

    // State and code inputs should be visible
    expect(screen.getByTestId("codex-login-state-input")).toBeInTheDocument();
    expect(screen.getByTestId("codex-login-code-input")).toBeInTheDocument();
    expect(screen.getByTestId("codex-complete-login-submit")).toBeInTheDocument();
  });

  test("complete login flow: open panel, enter state/code, submit calls completeLogin", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-toggle")).toBeInTheDocument();
    });

    // Open complete login panel
    const toggleButton = screen.getByTestId("codex-complete-login-toggle");
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-panel")).toBeInTheDocument();
    });

    // Enter state and code
    const stateInput = screen.getByTestId("codex-login-state-input");
    const codeInput = screen.getByTestId("codex-login-code-input");

    await user.type(stateInput, "test-state-123");
    await user.type(codeInput, "test-code-456");

    // Submit complete login
    const submitButton = screen.getByTestId("codex-complete-login-submit");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mocks.completeLogin).toHaveBeenCalledWith({
        state: "test-state-123",
        code: "test-code-456",
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("codex-complete-login-panel")).not.toBeInTheDocument();
    });
  });

  test("complete login failure keeps panel open and preserves input", async () => {
    mocks.completeLogin.mockResolvedValueOnce(null);

    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-toggle")).toBeInTheDocument();
    });

    const toggleButton = screen.getByTestId("codex-complete-login-toggle");
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-panel")).toBeInTheDocument();
    });

    const stateInput = screen.getByTestId("codex-login-state-input");
    const codeInput = screen.getByTestId("codex-login-code-input");

    await user.type(stateInput, "test-state-123");
    await user.type(codeInput, "test-code-456");

    const submitButton = screen.getByTestId("codex-complete-login-submit");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mocks.completeLogin).toHaveBeenCalled();
    });

    expect(screen.getByTestId("codex-complete-login-panel")).toBeInTheDocument();
    expect(screen.getByTestId("codex-login-state-input")).toHaveValue("test-state-123");
    expect(screen.getByTestId("codex-login-code-input")).toHaveValue("test-code-456");
  });

  test("complete login structured failure (completed:false) keeps panel open and preserves input", async () => {
    mocks.completeLogin.mockResolvedValueOnce({
      status: "failed",
      completed: false,
    });

    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-toggle")).toBeInTheDocument();
    });

    const toggleButton = screen.getByTestId("codex-complete-login-toggle");
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-complete-login-panel")).toBeInTheDocument();
    });

    const stateInput = screen.getByTestId("codex-login-state-input");
    const codeInput = screen.getByTestId("codex-login-code-input");

    await user.type(stateInput, "test-state-123");
    await user.type(codeInput, "test-code-456");

    const submitButton = screen.getByTestId("codex-complete-login-submit");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mocks.completeLogin).toHaveBeenCalled();
    });

    expect(screen.getByTestId("codex-complete-login-panel")).toBeInTheDocument();
    expect(screen.getByTestId("codex-login-state-input")).toHaveValue("test-state-123");
    expect(screen.getByTestId("codex-login-code-input")).toHaveValue("test-code-456");
  });

  test("import failure keeps panel open and preserves content", async () => {
    mocks.importAccounts.mockResolvedValueOnce(null);

    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-button")).toBeInTheDocument();
    });

    const importButton = screen.getByTestId("codex-import-button");
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-panel")).toBeInTheDocument();
    });

    const textarea = screen.getByTestId("codex-import-textarea");
    await user.type(textarea, "test import content");

    const submitButton = screen.getByTestId("codex-import-submit");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mocks.importAccounts).toHaveBeenCalled();
    });

    expect(screen.getByTestId("codex-import-panel")).toBeInTheDocument();
    expect(screen.getByTestId("codex-import-textarea")).toHaveValue("test import content");
  });

  test("import structured failure (failed>0) keeps panel open and preserves content", async () => {
    mocks.importAccounts.mockResolvedValueOnce({
      total: 3,
      created: 1,
      updated: 0,
      failed: 2,
      errors: [
        { index: 1, message: "Invalid format" },
        { index: 2, message: "Duplicate entry" },
      ],
    });

    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-button")).toBeInTheDocument();
    });

    const importButton = screen.getByTestId("codex-import-button");
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-import-panel")).toBeInTheDocument();
    });

    const textarea = screen.getByTestId("codex-import-textarea");
    await user.type(textarea, "test import content");

    const submitButton = screen.getByTestId("codex-import-submit");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mocks.importAccounts).toHaveBeenCalled();
    });

    expect(screen.getByTestId("codex-import-panel")).toBeInTheDocument();
    expect(screen.getByTestId("codex-import-textarea")).toHaveValue("test import content");
  });

  test("login status panel is displayed after starting login", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-login-start")).toBeInTheDocument();
    });

    // Initially login status panel should not be visible
    expect(screen.queryByTestId("codex-login-status-panel")).not.toBeInTheDocument();

    // Start login
    const loginButton = screen.getByTestId("codex-login-start");
    await user.click(loginButton);

    // Wait for startLogin to be called
    await waitFor(() => {
      expect(mocks.startLogin).toHaveBeenCalled();
    });

    // Login status panel should now be visible
    await waitFor(() => {
      expect(screen.getByTestId("codex-login-status-panel")).toBeInTheDocument();
    });
  });

  test("clicking 查看 button opens account detail drawer on first click", async () => {
    // Setup mock for account detail and usage
    mocks.getAccount.mockResolvedValue({
      accountId: "acc-1",
      email: "acc-1@example.com",
      label: "Account acc-1",
      groupName: "test-group",
      status: "active",
      sort: 1,
      relayEnabled: false,
      runtimeSource: "codex_manager",
      runtimeIncluded: true,
      usageSummary: null,
      lastSyncedAt: null,
      stale: false,
    });
    mocks.getAccountUsage.mockResolvedValue({
      accountId: "acc-1",
      usageSummary: {
        availabilityStatus: "available",
        usedPercent: 50,
        windowMinutes: 60,
      },
      snapshot: {
        accountId: "acc-1",
        usedPercent: 50,
        windowMinutes: 60,
      },
    });

    const user = userEvent.setup();
    render(<TestRouter />);

    // Wait for accounts to render
    await waitFor(() => {
      expect(screen.getByText("Account acc-1")).toBeInTheDocument();
    });

    // Initially drawer should not be visible
    expect(screen.queryByTestId("codex-account-detail-drawer")).not.toBeInTheDocument();

    // Find and click the 查看 button for acc-1
    const viewButton = screen.getAllByRole("button").find((btn) => btn.textContent === "查看");
    expect(viewButton).toBeDefined();
    await user.click(viewButton!);

    // Drawer should immediately appear on first click
    await waitFor(() => {
      expect(screen.getByTestId("codex-account-detail-drawer")).toBeInTheDocument();
    });

    // Should trigger detail and usage loading
    await waitFor(() => {
      expect(mocks.getAccount).toHaveBeenCalledWith("acc-1");
      expect(mocks.getAccountUsage).toHaveBeenCalledWith("acc-1");
    });
  });

  test("refresh one action reloads account list after completion", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-refresh-one-acc-1")).toBeInTheDocument();
    });

    mocks.listAccounts.mockClear();

    const refreshButton = screen.getByTestId("codex-refresh-one-acc-1");
    await user.click(refreshButton);

    await waitFor(() => {
      expect(mocks.refreshAccountUsage).toHaveBeenCalledWith("acc-1");
    });

    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenCalled();
    });
  });

  test("batch refresh action reloads account list after completion", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-refresh-selected")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    mocks.listAccounts.mockClear();

    const refreshSelectedButton = screen.getByTestId("codex-refresh-selected");
    await waitFor(() => {
      expect(refreshSelectedButton).not.toBeDisabled();
    });
    await user.click(refreshSelectedButton);

    await waitFor(() => {
      expect(mocks.refreshUsageBatch).toHaveBeenCalledWith(["acc-1"]);
    });

    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenCalled();
    });
  });

  test("batch refresh result is rendered with success/failure items", async () => {
    mocks.refreshUsageBatch.mockResolvedValueOnce({
      items: [
        {
          accountId: "acc-1",
          success: true,
          reason: null,
          usageSummary: {
            availabilityStatus: "available",
            usedPercent: 50,
            windowMinutes: 60,
          },
          snapshot: {
            accountId: "acc-1",
            usedPercent: 50,
            windowMinutes: 60,
          },
        },
        {
          accountId: "acc-2",
          success: false,
          reason: "Network timeout",
          usageSummary: null,
          snapshot: null,
        },
      ],
      total: 2,
      successCount: 1,
      failedCount: 1,
    });

    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-refresh-selected")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    const refreshSelectedButton = screen.getByTestId("codex-refresh-selected");
    await waitFor(() => {
      expect(refreshSelectedButton).not.toBeDisabled();
    });
    await user.click(refreshSelectedButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-batch-refresh-result")).toBeInTheDocument();
    });

    expect(screen.getByTestId("codex-batch-refresh-item-acc-1")).toBeInTheDocument();
    expect(screen.getByTestId("codex-batch-refresh-item-acc-2")).toBeInTheDocument();
    expect(screen.getByTestId("codex-batch-refresh-reason-acc-2")).toHaveTextContent(
      "Network timeout",
    );
  });

  test("login timeout: verifies 2-second polling and 5-minute timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mocks.startLogin.mockResolvedValueOnce({
      loginId: "login-timeout-test",
      authUrl: "http://example.test/auth",
      loginType: "device",
      issuer: "codex",
      clientId: "client-1",
      redirectUri: "http://127.0.0.1/callback",
      warning: null,
      device: null,
    });

    mocks.getLoginStatus.mockResolvedValue({
      loginId: "login-timeout-test",
      status: "in_progress",
      upstreamStatus: "pending",
      terminal: false,
      error: null,
      updatedAt: "2026-03-08T02:30:00Z",
    });

    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-login-start")).toBeInTheDocument();
    });

    const loginButton = screen.getByTestId("codex-login-start");
    await user.click(loginButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-login-status-panel")).toBeInTheDocument();
    });

    expect(screen.getByTestId("codex-login-status-panel")).toHaveTextContent("进行中");

    const statusPanel = screen.getByTestId("codex-login-status-panel");
    expect(statusPanel).toBeInTheDocument();
    expect(statusPanel).toHaveTextContent("登录状态");

    const initialCallCount = mocks.getLoginStatus.mock.calls.length;

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => {
      expect(mocks.getLoginStatus).toHaveBeenCalledTimes(initialCallCount + 1);
    });

    await vi.advanceTimersByTimeAsync(4000);
    await waitFor(() => {
      expect(mocks.getLoginStatus).toHaveBeenCalledTimes(initialCallCount + 3);
    });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    await waitFor(() => {
      expect(screen.getByTestId("codex-login-status-panel")).toHaveTextContent("超时");
    });

    vi.useRealTimers();
  });
});
