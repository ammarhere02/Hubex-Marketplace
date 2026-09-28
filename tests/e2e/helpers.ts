// Shared e2e helpers. The whole storefront is behind authentication, so most
// specs start by registering a throwaway account.
import { expect, type Page } from "@playwright/test";

let counter = 0;

/** Registers a fresh account and lands on the (now accessible) home page. */
export async function signUp(page: Page, name = "Test Shopper"): Promise<string> {
  const email = `e2e-${Date.now()}-${++counter}@example.com`;
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("longenough");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText(name)).toBeVisible(); // header shows the session
  return email;
}

/** Waits for streaming + hydration before interacting. */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
