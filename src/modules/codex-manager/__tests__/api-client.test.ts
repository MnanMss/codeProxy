import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "@/lib/http/client";
import { codexManagerApi } from "@/lib/http/apis";

const fetchMock = vi.fn();

const createEnvelope = (data: unknown, overrides?: Partial<Record<string, unknown>>) => ({
  ok: true,
  code: "",
  message: "",
  retryable: false,
  data,
  ...overrides,
});

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const emptyResponse = (status = 204) => new Response(null, { status });

const lastRequest = () => {
  const [input, init] = fetchMock.mock.calls.at(-1) ?? [];
  return {
    url: String(input ?? ""),
    init: (init ?? {}) as RequestInit,
  };
};

describe("codexManagerApi", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    apiClient.setConfig({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "test-management-key",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("listAccounts requests the accounts endpoint with normalized query params and stable accountId fields", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        createEnvelope({
          items: [
            {
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
            },
          ],
          total: 1,
          page: 1,
          pageSize: 100,
          maxPageSize: 100,
        }),
      ),
    );

    const result = await codexManagerApi.listAccounts({ page: 0, pageSize: 999, query: "  team-a  " });

    expect(result.items[0]?.accountId).toBe("acc-alpha");
    expect("authIndex" in result.items[0] || "auth_index" in result.items[0]).toBe(false);

    const request = lastRequest();
    expect(request.url).toBe(
      "http://127.0.0.1:8317/v0/management/codex-manager/accounts?page=1&pageSize=100&query=team-a",
    );
    expect(request.init.method).toBeUndefined();
    expect(new Headers(request.init.headers).get("Authorization")).toBe("Bearer test-management-key");
  });

  test("getAccount and getAccountUsage call account-scoped GET endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
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
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
            accountId: "acc-alpha",
            usageSummary: { availabilityStatus: "available", usedPercent: 42, windowMinutes: 60 },
            snapshot: { accountId: "acc-alpha", usedPercent: 42, windowMinutes: 60 },
          }),
        ),
      );

    const detail = await codexManagerApi.getAccount(" acc-alpha ");
    expect(detail.accountId).toBe("acc-alpha");

    let request = lastRequest();
    expect(request.url).toBe("http://127.0.0.1:8317/v0/management/codex-manager/accounts/acc-alpha");

    const usage = await codexManagerApi.getAccountUsage("acc-alpha");
    expect(usage.snapshot?.accountId).toBe("acc-alpha");

    request = lastRequest();
    expect(request.url).toBe(
      "http://127.0.0.1:8317/v0/management/codex-manager/accounts/acc-alpha/usage",
    );
  });

  test("listUsage and refreshAccountUsage call the stable usage endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
            items: [],
            total: 0,
            page: 2,
            pageSize: 5,
            maxPageSize: 100,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
            accountId: "acc-alpha",
            usageSummary: { availabilityStatus: "available", usedPercent: 18, windowMinutes: 60 },
            snapshot: { accountId: "acc-alpha", usedPercent: 18, windowMinutes: 60 },
          }),
        ),
      );

    const list = await codexManagerApi.listUsage({ page: 2, pageSize: 5, query: " alpha " });
    expect(list.page).toBe(2);
    expect(list.pageSize).toBe(5);

    let request = lastRequest();
    expect(request.url).toBe(
      "http://127.0.0.1:8317/v0/management/codex-manager/usage?page=2&pageSize=5&query=alpha",
    );

    const usage = await codexManagerApi.refreshAccountUsage(" acc-alpha ");
    expect(usage.accountId).toBe("acc-alpha");

    request = lastRequest();
    expect(request.init.method).toBe("POST");
    expect(request.url).toBe(
      "http://127.0.0.1:8317/v0/management/codex-manager/accounts/acc-alpha/usage/refresh",
    );
  });

  test("refreshUsageBatch trims and deduplicates accountIds in the request body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(createEnvelope({ items: [], total: 0, successCount: 0, failedCount: 0 })),
    );

    await codexManagerApi.refreshUsageBatch([" acc-alpha ", "", "acc-alpha", "acc-bravo"]);

    const request = lastRequest();
    expect(request.init.method).toBe("POST");
    expect(request.url).toBe(
      "http://127.0.0.1:8317/v0/management/codex-manager/usage/refresh-batch",
    );
    expect(JSON.parse(String(request.init.body))).toEqual({ accountIds: ["acc-alpha", "acc-bravo"] });
  });

  test("login methods call the correct paths and payloads", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
            loginId: "login-1",
            authUrl: "http://example.test/auth",
            loginType: "device",
            issuer: "codex",
            clientId: "client-1",
            redirectUri: "http://127.0.0.1/callback",
            warning: null,
            device: null,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
            loginId: "login-1",
            status: "in_progress",
            upstreamStatus: "pending",
            terminal: false,
            error: null,
            updatedAt: "2026-03-07T15:00:00Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(createEnvelope({ status: "success", completed: true })),
      );

    await codexManagerApi.startLogin({
      type: " device ",
      openBrowser: false,
      note: " note ",
      tags: " tag ",
      groupName: " group ",
      workspaceId: " ws-1 ",
    });

    let request = lastRequest();
    expect(request.init.method).toBe("POST");
    expect(request.url).toBe("http://127.0.0.1:8317/v0/management/codex-manager/login/start");
    expect(JSON.parse(String(request.init.body))).toEqual({
      type: "device",
      openBrowser: false,
      note: "note",
      tags: "tag",
      groupName: "group",
      workspaceId: "ws-1",
    });

    await codexManagerApi.getLoginStatus(" login-1 ");

    request = lastRequest();
    expect(request.url).toBe(
      "http://127.0.0.1:8317/v0/management/codex-manager/login/status/login-1",
    );

    await codexManagerApi.completeLogin({
      state: " state-1 ",
      code: " code-1 ",
      redirectUri: " http://127.0.0.1/callback ",
    });

    request = lastRequest();
    expect(request.init.method).toBe("POST");
    expect(request.url).toBe("http://127.0.0.1:8317/v0/management/codex-manager/login/complete");
    expect(JSON.parse(String(request.init.body))).toEqual({
      state: "state-1",
      code: "code-1",
      redirectUri: "http://127.0.0.1/callback",
    });
  });

  test("importAccounts, deleteAccount, and setRelayState use stable payload fields", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(createEnvelope({ total: 2, created: 1, updated: 1, failed: 0, errors: [] })),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
            accountId: "acc-alpha",
            removed: true,
            alreadyRemoved: false,
            notFoundButHandled: false,
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope({
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
          }),
        ),
      );

    await codexManagerApi.importAccounts({
      contents: ["  {\"auth\":1}  ", ""],
      content: "  {\"auth\":2}  ",
    });

    let request = lastRequest();
    expect(request.init.method).toBe("POST");
    expect(request.url).toBe("http://127.0.0.1:8317/v0/management/codex-manager/import");
    expect(JSON.parse(String(request.init.body))).toEqual({
      contents: ['{"auth":1}', '{"auth":2}'],
    });

    await codexManagerApi.deleteAccount(" acc-alpha ");

    request = lastRequest();
    expect(request.init.method).toBe("DELETE");
    expect(request.url).toBe("http://127.0.0.1:8317/v0/management/codex-manager/accounts/acc-alpha");

    await codexManagerApi.setRelayState(" acc-alpha ", false);

    request = lastRequest();
    expect(request.init.method).toBe("PATCH");
    expect(request.url).toBe(
      "http://127.0.0.1:8317/v0/management/codex-manager/accounts/acc-alpha/relay-state",
    );
    expect(JSON.parse(String(request.init.body))).toEqual({ relayEnabled: false });
  });

  test("unwraps envelope errors and falls back to empty list data for empty responses", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          createEnvelope(null, {
            ok: false,
            code: "upstream_unavailable",
            message: "codex-manager upstream unavailable",
            retryable: true,
          }),
        ),
      )
      .mockResolvedValueOnce(emptyResponse());

    await expect(codexManagerApi.listAccounts()).rejects.toThrow("codex-manager upstream unavailable");

    const result = await codexManagerApi.listUsage({ page: 3, pageSize: 5, query: "  " });
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 3,
      pageSize: 5,
      maxPageSize: 100,
    });
  });
});
