import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { CodexManagerPage } from "@/modules/codex-manager/CodexManagerPage";

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location-display" data-search={location.search} data-pathname={location.pathname}>
      {location.search}
    </div>
  );
}

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
        <Route path="/codex-manager" element={<><CodexManagerPage /><LocationDisplay /></>} />
        <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CodexManager route and shell integration", () => {
  beforeEach(() => {
    mocks.listAccounts.mockReset();
    mocks.getAccount.mockReset();
    mocks.listUsage.mockReset();
    mocks.getAccountUsage.mockReset();

    // Default mock responses
    mocks.listAccounts.mockResolvedValue({
      items: [],
      total: 0,
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
  });

  test("renders codex-manager page with stable testid", async () => {
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-manager-page")).toBeInTheDocument();
    });
  });

  test("renders tab buttons with stable testids", async () => {
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-tab-accounts")).toBeInTheDocument();
      expect(screen.getByTestId("codex-tab-quota")).toBeInTheDocument();
    });
  });

  test("renders accounts table container with stable testid", async () => {
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-table")).toBeInTheDocument();
    });
  });

  test("default tab is accounts and URL query is normalized to tab=accounts", async () => {
    render(<TestRouter />);

    const accountsTab = await screen.findByTestId("codex-tab-accounts");
    expect(accountsTab).toHaveClass("bg-slate-900", "text-white");

    const locationDisplay = await screen.findByTestId("location-display");
    await waitFor(() => {
      expect(locationDisplay.getAttribute("data-search")).toContain("tab=accounts");
    });
  });

  test("tab switching updates URL query to tab=quota and active state", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    const quotaTab = await screen.findByTestId("codex-tab-quota");
    await user.click(quotaTab);

    await waitFor(() => {
      expect(quotaTab).toHaveClass("bg-slate-900", "text-white");
    });

    const locationDisplay = await screen.findByTestId("location-display");
    await waitFor(() => {
      expect(locationDisplay.getAttribute("data-search")).toContain("tab=quota");
    });
  });

  test("account detail skeleton exists in component tree", async () => {
    mocks.listAccounts.mockResolvedValue({
      items: [
        {
          accountId: "test-account-1",
          email: "test@example.com",
          label: "Test Account",
          groupName: "test-group",
          status: "active",
          sort: 1,
          relayEnabled: true,
          runtimeSource: "codex_manager",
          runtimeIncluded: true,
          usageSummary: null,
          lastSyncedAt: null,
          stale: false,
          usageSnapshot: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      maxPageSize: 100,
    });

    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByText("Test Account")).toBeInTheDocument();
    });

    // Verify the page structure is rendered
    expect(screen.getByTestId("codex-tab-accounts")).toBeInTheDocument();
    expect(screen.getByTestId("codex-tab-quota")).toBeInTheDocument();
    expect(screen.getByTestId("codex-accounts-table")).toBeInTheDocument();
  });

  test("renders accounts search input with stable testid", async () => {
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-search-input")).toBeInTheDocument();
    });
  });

  test("renders accounts pagination controls with stable testids", async () => {
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-pagination-info")).toBeInTheDocument();
      expect(screen.getByTestId("codex-accounts-prev-page")).toBeInTheDocument();
      expect(screen.getByTestId("codex-accounts-next-page")).toBeInTheDocument();
    });
  });

  test("renders quota search input with stable testid", async () => {
    render(<TestRouter />);

    const user = userEvent.setup();
    const quotaTab = await screen.findByTestId("codex-tab-quota");
    await user.click(quotaTab);

    await waitFor(() => {
      expect(screen.getByTestId("codex-quota-search-input")).toBeInTheDocument();
    });
  });

  test("renders quota pagination controls with stable testids", async () => {
    render(<TestRouter />);

    const user = userEvent.setup();
    const quotaTab = await screen.findByTestId("codex-tab-quota");
    await user.click(quotaTab);

    await waitFor(() => {
      expect(screen.getByTestId("codex-quota-pagination-info")).toBeInTheDocument();
      expect(screen.getByTestId("codex-quota-prev-page")).toBeInTheDocument();
      expect(screen.getByTestId("codex-quota-next-page")).toBeInTheDocument();
    });
  });

  test("accounts search input updates query state on enter", async () => {
    const user = userEvent.setup();
    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-search-input")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("codex-accounts-search-input");
    await user.type(searchInput, "test-query");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "test-query" })
      );
    });
  });

  test("accounts pagination prev button is disabled on first page", async () => {
    render(<TestRouter />);

    await waitFor(() => {
      const prevButton = screen.getByTestId("codex-accounts-prev-page");
      expect(prevButton).toBeDisabled();
    });
  });

  test("accounts pagination next button is disabled when on last page", async () => {
    mocks.listAccounts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      maxPageSize: 100,
    });

    render(<TestRouter />);

    await waitFor(() => {
      const nextButton = screen.getByTestId("codex-accounts-next-page");
      expect(nextButton).toBeDisabled();
    });
  });

  test("clicking next page loads page 2 data with correct page parameter", async () => {
    const user = userEvent.setup();
    
    mocks.listAccounts.mockImplementation((query) => {
      if (query?.page === 2) {
        return Promise.resolve({
          items: Array.from({ length: 5 }, (_, i) => ({
            accountId: `account-${i + 21}`,
            email: `account${i + 21}@example.com`,
            label: `Team Alpha ${i + 21}`,
            groupName: "test-group",
            status: "active",
            sort: i + 21,
            relayEnabled: false,
            runtimeSource: "codex_manager",
            runtimeIncluded: true,
            usageSummary: null,
            lastSyncedAt: null,
            stale: false,
            usageSnapshot: null,
          })),
          total: 25,
          page: 2,
          pageSize: 20,
          maxPageSize: 100,
        });
      }
      return Promise.resolve({
        items: Array.from({ length: 20 }, (_, i) => ({
          accountId: `account-${i + 1}`,
          email: `account${i + 1}@example.com`,
          label: `Account ${i + 1}`,
          groupName: "test-group",
          status: "active",
          sort: i + 1,
          relayEnabled: false,
          runtimeSource: "codex_manager",
          runtimeIncluded: true,
          usageSummary: null,
          lastSyncedAt: null,
          stale: false,
          usageSnapshot: null,
        })),
        total: 25,
        page: 1,
        pageSize: 20,
        maxPageSize: 100,
      });
    });

    render(<TestRouter />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-pagination-info")).toBeInTheDocument();
    });

    // Verify initial page shows page 1
    expect(screen.getByTestId("codex-accounts-pagination-info")).toHaveTextContent("第 1 页");

    // Click next page
    const nextButton = screen.getByTestId("codex-accounts-next-page");
    await user.click(nextButton);

    // Verify page 2 was requested with correct page parameter
    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });

    // Verify pagination info shows page 2
    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-pagination-info")).toHaveTextContent("第 2 页");
    });

    // Verify page 2 content is displayed (Team Alpha 21 should appear)
    await waitFor(() => {
      expect(screen.getByText("Team Alpha 21")).toBeInTheDocument();
    });

    // Verify page stays on page 2 (not reverting to page 1)
    expect(screen.getByTestId("codex-accounts-pagination-info")).toHaveTextContent("第 2 页");
  });

  test("clicking prev page loads previous page data with correct page parameter", async () => {
    const user = userEvent.setup();
    
    mocks.listAccounts.mockImplementation((query) => {
      const page = query?.page || 1;
      if (page === 2) {
        return Promise.resolve({
          items: Array.from({ length: 5 }, (_, i) => ({
            accountId: `account-${i + 21}`,
            email: `account${i + 21}@example.com`,
            label: `Page 2 Account ${i + 21}`,
            groupName: "test-group",
            status: "active",
            sort: i + 21,
            relayEnabled: false,
            runtimeSource: "codex_manager",
            runtimeIncluded: true,
            usageSummary: null,
            lastSyncedAt: null,
            stale: false,
            usageSnapshot: null,
          })),
          total: 25,
          page: 2,
          pageSize: 20,
          maxPageSize: 100,
        });
      }
      return Promise.resolve({
        items: Array.from({ length: 20 }, (_, i) => ({
          accountId: `account-${i + 1}`,
          email: `account${i + 1}@example.com`,
          label: `Account ${i + 1}`,
          groupName: "test-group",
          status: "active",
          sort: i + 1,
          relayEnabled: false,
          runtimeSource: "codex_manager",
          runtimeIncluded: true,
          usageSummary: null,
          lastSyncedAt: null,
          stale: false,
          usageSnapshot: null,
        })),
        total: 25,
        page: 1,
        pageSize: 20,
        maxPageSize: 100,
      });
    });

    render(<TestRouter />);

    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-pagination-info")).toBeInTheDocument();
    });

    const nextButton = screen.getByTestId("codex-accounts-next-page");
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-pagination-info")).toHaveTextContent("第 2 页");
    });

    const prevButton = screen.getByTestId("codex-accounts-prev-page");
    await user.click(prevButton);

    await waitFor(() => {
      expect(mocks.listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("codex-accounts-pagination-info")).toHaveTextContent("第 1 页");
    });
  });

  test("quota tab pagination loads correct page data", async () => {
    const user = userEvent.setup();
    
    mocks.listUsage.mockImplementation((query) => {
      const page = query?.page || 1;
      if (page === 2) {
        return Promise.resolve({
          items: Array.from({ length: 5 }, (_, i) => ({
            accountId: `quota-account-${i + 21}`,
            email: `quota${i + 21}@example.com`,
            label: `Quota Page 2 Account ${i + 21}`,
            groupName: "test-group",
            status: "active",
            sort: i + 21,
            relayEnabled: false,
            runtimeSource: "codex_manager",
            runtimeIncluded: true,
            usageSummary: null,
            lastSyncedAt: null,
            stale: false,
            usageSnapshot: null,
          })),
          total: 25,
          page: 2,
          pageSize: 20,
          maxPageSize: 100,
        });
      }
      return Promise.resolve({
        items: Array.from({ length: 20 }, (_, i) => ({
          accountId: `quota-account-${i + 1}`,
          email: `quota${i + 1}@example.com`,
          label: `Quota Account ${i + 1}`,
          groupName: "test-group",
          status: "active",
          sort: i + 1,
          relayEnabled: false,
          runtimeSource: "codex_manager",
          runtimeIncluded: true,
          usageSummary: null,
          lastSyncedAt: null,
          stale: false,
          usageSnapshot: null,
        })),
        total: 25,
        page: 1,
        pageSize: 20,
        maxPageSize: 100,
      });
    });

    render(<TestRouter />);

    const quotaTab = await screen.findByTestId("codex-tab-quota");
    await user.click(quotaTab);

    await waitFor(() => {
      expect(screen.getByTestId("codex-quota-pagination-info")).toBeInTheDocument();
    });

    expect(screen.getByTestId("codex-quota-pagination-info")).toHaveTextContent("第 1 页");

    const nextButton = screen.getByTestId("codex-quota-next-page");
    await user.click(nextButton);

    await waitFor(() => {
      expect(mocks.listUsage).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("codex-quota-pagination-info")).toHaveTextContent("第 2 页");
    });

    await waitFor(() => {
      expect(screen.getByText("quota-account-21")).toBeInTheDocument();
    });

    expect(screen.getByTestId("codex-quota-pagination-info")).toHaveTextContent("第 2 页");
  });
});
