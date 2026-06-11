import type { Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./fixtures";

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const emailInput = page
    .locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]')
    .first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(ADMIN_EMAIL);
  await passwordInput.fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /connexion|login|se connecter/i }).click();

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10_000 });
}

// Module-level token cache — survives across tests in the same worker
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

/**
 * Get a JWT token via direct API call (faster, no UI overhead).
 * Caches the token for 10 minutes to avoid rate limits.
 */
export async function getAdminToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) {
    return _cachedToken;
  }

  // Retry on rate limit with backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch("http://localhost:3001/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (resp.status === 429) {
      const waitMs = (attempt + 1) * 62_000; // wait 62s, 124s, 186s
      const retryAfterHeader = resp.headers.get("retry-after");
      const waitSec = retryAfterHeader ? parseInt(retryAfterHeader) + 2 : 62;
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    if (!resp.ok) {
      throw new Error(`Login failed: ${resp.status} ${await resp.text()}`);
    }
    const json = (await resp.json()) as { data?: { accessToken?: string } };
    const token = json?.data?.accessToken;
    if (!token) throw new Error(`No accessToken in response: ${JSON.stringify(json)}`);
    _cachedToken = token;
    _tokenExpiry = now + 10 * 60 * 1000; // cache 10 min
    return token;
  }
  throw new Error("Failed to get token after retries (rate limited)");
}
