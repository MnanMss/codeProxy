import { test, expect } from "@playwright/test";

const setAuthed = async (page) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
      })
    );
    localStorage.setItem("cli-proxy-sidebar-collapsed", "0");
  });
};

const setupMocks = async (page) => {
  await page.route(/.*\/v0\/management\/config/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route(/.*\/v0\/management\/codex-manager\/accounts(?!\/).*/, async (route) => {
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

  await page.route(/.*\/v0\/management\/codex-manager\/login-status.*/, async (route) => {
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
};

test.describe("Manual QA - Codex Manager", () => {
  test("QA: Page loads with tabs and accounts table", async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);

    // Capture console messages
    const consoleMessages = [];
    page.on("console", (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    await page.goto("http://localhost:5173/#/codex-manager");
    await page.waitForLoadState("networkidle");

    // Take screenshot
    await page.screenshot({ path: "qa-01-initial-load.png", fullPage: true });

    // Verify core elements
    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("codex-tab-accounts")).toBeVisible();
    await expect(page.getByTestId("codex-tab-quota")).toBeVisible();
    await expect(page.getByTestId("codex-accounts-table")).toBeVisible();

    // Verify accounts are displayed
    await expect(page.getByText("Test Account 1")).toBeVisible();
    await expect(page.getByText("Test Account 2")).toBeVisible();

    console.log("Console messages:", consoleMessages);
  });

  test("QA: Import panel opens and closes", async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);

    await page.goto("http://localhost:5173/#/codex-manager");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    // Click import button
    await page.getByTestId("codex-import-button").click();
    await page.screenshot({ path: "qa-02-import-panel-open.png", fullPage: true });

    // Verify import panel is visible
    await expect(page.getByTestId("codex-import-panel")).toBeVisible();
    await expect(page.getByTestId("codex-import-textarea")).toBeVisible();

    // Click cancel to close
    await page.getByTestId("codex-import-cancel").click();
    await page.screenshot({ path: "qa-03-import-panel-closed.png", fullPage: true });

    // Verify panel is closed
    await expect(page.getByTestId("codex-import-panel")).not.toBeVisible();
  });

  test("QA: Account detail drawer opens and closes", async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);

    await page.goto("http://localhost:5173/#/codex-manager");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Test Account 1")).toBeVisible();

    // Click view button
    await page.getByTestId("codex-view-button-test-account-1").click();
    await page.screenshot({ path: "qa-04-drawer-open.png", fullPage: true });

    // Verify drawer is visible
    await expect(page.getByTestId("codex-account-detail-drawer")).toBeVisible();

    // Close drawer by clicking backdrop
    await page.locator('[data-testid="codex-account-detail-drawer"] >> div >> nth=0').click();
    await page.screenshot({ path: "qa-05-drawer-closed.png", fullPage: true });
  });

  test("QA: Refresh selected button state", async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);

    await page.goto("http://localhost:5173/#/codex-manager");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    // Check initial state - button should be disabled
    const refreshButton = page.getByTestId("codex-refresh-selected");
    await expect(refreshButton).toBeDisabled();

    // Check first checkbox
    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    await firstCheckbox.check();
    await page.screenshot({ path: "qa-06-checkbox-checked.png", fullPage: true });

    // Button should now be enabled
    await expect(refreshButton).toBeEnabled();

    // Uncheck
    await firstCheckbox.uncheck();
    await expect(refreshButton).toBeDisabled();
  });

  test("QA: Login status panel appears", async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);

    await page.goto("http://localhost:5173/#/codex-manager");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    // Initially login status panel should not be visible
    await expect(page.getByTestId("codex-login-status-panel")).not.toBeVisible();

    // Click login start
    await page.getByTestId("codex-login-start").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "qa-07-login-status-visible.png", fullPage: true });

    // Login status panel should now be visible
    await expect(page.getByTestId("codex-login-status-panel")).toBeVisible({ timeout: 10000 });
  });

  test("QA: Tab switching works", async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);

    await page.goto("http://localhost:5173/#/codex-manager");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });

    // Initially on accounts tab
    await expect(page.getByTestId("codex-accounts-table")).toBeVisible();

    // Click quota tab
    await page.getByTestId("codex-tab-quota").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "qa-08-quota-tab.png", fullPage: true });

    // Verify URL changed
    await expect(page).toHaveURL(/tab=quota/);

    // Click back to accounts
    await page.getByTestId("codex-tab-accounts").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "qa-09-accounts-tab.png", fullPage: true });

    await expect(page).toHaveURL(/tab=accounts/);
  });

  test("QA: Responsive behavior at narrow width", async ({ page }) => {
    await setupMocks(page);
    await setAuthed(page);

    // Set narrow viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("http://localhost:5173/#/codex-manager");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "qa-10-mobile-view.png", fullPage: true });

    // Verify page still loads
    await expect(page.getByTestId("codex-manager-page")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("codex-tab-accounts")).toBeVisible();
    await expect(page.getByTestId("codex-tab-quota")).toBeVisible();
  });
});
