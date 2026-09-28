// Auth journeys: register → signed-in header → logout; login errors; and the
// admin-gated queue dashboard (redirect for anonymous, board for the admin).
// The admin credentials come from tests/e2e/env.ts.
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@e2e.test";
const ADMIN_PASSWORD = "admin-secret-123";

async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("customer accounts", () => {
  test("register, see the account in the header, then log out", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await gotoHydrated(page, "/register");
    await page.getByLabel("Full name").fill("Grace Hopper");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("longenough");
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page.getByText("Grace Hopper")).toBeVisible(); // header shows the session
    await page.getByRole("button", { name: /Sign out|Logout|Log out/i }).click();
    await expect(page.getByRole("link", { name: /Sign in/ })).toBeVisible();
  });

  test("login rejects wrong credentials with a visible error", async ({ page }) => {
    await gotoHydrated(page, "/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText(/Invalid email or password/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("queue dashboard gating", () => {
  test("anonymous visitors are redirected to /login and returned after signing in", async ({ page }) => {
    await page.goto("/admin/queues");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fqueues/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/admin\/queues/);
    await expect(page.getByText("Hubex queues")).toBeVisible();
  });

  test("a signed-in non-admin gets 404, not the board @desktop-only", async ({ page }) => {
    const email = `e2e-nonadmin-${Date.now()}@example.com`;
    await gotoHydrated(page, "/register");
    await page.getByLabel("Full name").fill("Normal User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("longenough");
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByText("Normal User")).toBeVisible();

    const res = await page.goto("/admin/queues");
    expect(res!.status()).toBe(404);
  });
});
