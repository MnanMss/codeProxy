import { expect, test, type Page } from "@playwright/test";

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
      }),
    );
    localStorage.setItem("cli-proxy-sidebar-collapsed", "0");
  });
};

const setupMocks = async (page: Page) => {
  await page.route(/.*\/v0\/management\/config/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
};

const gotoMonitorAndOpenCodexManager = async (page: Page) => {
  await page.goto("/#/monitor");
  await page.waitForURL(/#\/monitor/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("codex-manager-nav")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("codex-manager-nav").click();
  await page.waitForURL(/#\/codex-manager/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
};

test.describe.configure({ mode: "serial" });

test.describe("Codex Manager core loop", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);
  });

  test("should navigate to codex-manager via shell nav and display navigation tabs", async ({ page }) => {
    await setupMocks(page);
    await page.route(/.*\/v0\/management\/codex-manager\/accounts.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            items: [
              {
                accountId: "test-account-1",
                label: "Test Account 1",
                status: "active",
                runtimeIncluded: true,
                relayEnabled: true,
              },
              {
                accountId: "test-account-2",
                label: "Test Account 2",
                status: "inactive",
                runtimeIncluded: false,
                relayEnabled: false,
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          },
        }),
      });
    });

    await gotoMonitorAndOpenCodexManager(page);
    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId("codex-tab-accounts")).toBeVisible();
    await expect(page.getByTestId("codex-tab-quota")).toBeVisible();

    await expect(page.getByTestId("codex-accounts-table")).toBeVisible();

    await expect(page).toHaveURL(/tab=accounts/);

    await page.unrouteAll();
  });

  test("should open import panel when import button is clicked", async ({ page }) => {
    await page.route(/.*\/v0\/management\/codex-manager\/accounts.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
          },
        }),
      });
    });

    await page.goto("/#/codex-manager");
    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    await page.getByTestId("codex-import-button").click();

    await expect(page.getByTestId("codex-import-panel")).toBeVisible();
    await expect(page.getByTestId("codex-import-textarea")).toBeVisible();

    await page.unrouteAll();
  });

  test("should open account detail drawer when view button is clicked", async ({ page }) => {
    await setAuthed(page);

    await page.route(/.*\/v0\/management\/codex-manager\/accounts.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            items: [
              {
                accountId: "test-account-1",
                label: "Test Account 1",
                status: "active",
                runtimeIncluded: true,
                relayEnabled: true,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          },
        }),
      });
    });

    await page.route(/.*\/v0\/management\/codex-manager\/accounts\/test-account-1/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            accountId: "test-account-1",
            label: "Test Account 1",
            status: "active",
          },
        }),
      });
    });

    await page.route(/.*\/v0\/management\/codex-manager\/accounts\/test-account-1\/usage/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            accountId: "test-account-1",
            usage: 100,
            quota: 1000,
          },
        }),
      });
    });

    await page.goto("/#/codex-manager");
    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Test Account 1")).toBeVisible();
    await page.getByTestId("codex-view-button-test-account-1").click();

    await expect(page.getByTestId("codex-account-detail-drawer")).toBeVisible();

    await page.unrouteAll();
  });

  test("should enable refresh selected button when accounts are checked", async ({ page }) => {
    await setAuthed(page);

    await page.route(/.*\/v0\/management\/codex-manager\/accounts.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            items: [
              {
                accountId: "test-account-1",
                label: "Test Account 1",
                status: "active",
                runtimeIncluded: true,
                relayEnabled: true,
              },
              {
                accountId: "test-account-2",
                label: "Test Account 2",
                status: "inactive",
                runtimeIncluded: false,
                relayEnabled: false,
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          },
        }),
      });
    });

    await page.goto("/#/codex-manager");
    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Test Account 1")).toBeVisible();

    const refreshSelectedButton = page.getByTestId("codex-refresh-selected");

    await expect(refreshSelectedButton).toBeDisabled();

    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    await firstCheckbox.check();

    await expect(refreshSelectedButton).toBeEnabled();

    const secondCheckbox = page.locator('input[type="checkbox"]').nth(1);
    await secondCheckbox.check();

    await expect(refreshSelectedButton).toBeEnabled();

    await firstCheckbox.uncheck();
    await secondCheckbox.uncheck();

    await expect(refreshSelectedButton).toBeDisabled();

    await page.unrouteAll();
  });

  test("should show login status panel after starting login", async ({ page }) => {
    await setupMocks(page);
    await page.route(/.*\/v0\/management\/codex-manager\/accounts.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
          },
        }),
      });
    });

    await page.route("**/v0/management/codex-manager/login/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            loginId: "test-login-123",
            authUrl: "http://example.test/auth",
            loginType: "device",
            issuer: "codex",
            clientId: "client-1",
            redirectUri: "http://127.0.0.1/callback",
            warning: null,
            device: null,
          },
        }),
      });
    });

    await page.route(/.*\/v0\/management\/codex-manager\/login\/status\/[^/?]+(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            loginId: "test-login-123",
            status: "in_progress",
            upstreamStatus: "pending",
            terminal: false,
            error: null,
            updatedAt: "2026-03-08T02:30:00Z",
          },
        }),
      });
    });

    await gotoMonitorAndOpenCodexManager(page);
    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId("codex-login-status-panel")).not.toBeVisible();

    const loginStatusRequestPromise = page.waitForRequest(
      /\/v0\/management\/codex-manager\/login\/status\/test-login-123(?:\?.*)?$/,
    );

    await page.getByTestId("codex-login-start").click();
    await loginStatusRequestPromise;

    await expect(page.getByTestId("codex-login-status-panel")).toBeVisible({ timeout: 10000 });

    await page.unrouteAll();
  });
});
