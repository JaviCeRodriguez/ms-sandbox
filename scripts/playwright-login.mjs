/**
 * End-to-end MSAL popup login against the local demo + authority.
 */
import { chromium } from "playwright";

const DEMO = process.env.DEMO_URL ?? "http://localhost:5173";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

try {
  await page.goto(DEMO, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Iniciar sesión con MSAL/i }).waitFor();

  const popupPromise = page.waitForEvent("popup", { timeout: 20000 });
  await page.getByRole("button", { name: /Iniciar sesión con MSAL/i }).click();
  const popup = await popupPromise;

  await popup.waitForLoadState("domcontentloaded");
  await popup.waitForURL(/localhost:8443/, { timeout: 20000 });

  // Login form (pre-filled); submit.
  await popup.locator('input[name="username"]').waitFor({ timeout: 15000 });
  await popup.locator('input[name="password"]').fill("Password1!");
  await popup.getByRole("button", { name: /Continuar/i }).click();

  // Popup should close after MSAL finishes; main page shows Login OK.
  await page.getByText("Login OK", { exact: false }).waitFor({ timeout: 30000 });
  const account = await page.locator("main").innerText();

  if (!account.includes("alice@contoso.test") && !account.includes("Alice")) {
    throw new Error(`Login OK but unexpected account text:\n${account}`);
  }
  if (account.match(/nonce_mismatch|hash_empty_error|error:/i)) {
    throw new Error(`Error still visible:\n${account}`);
  }

  console.log("PLAYWRIGHT LOGIN OK");
  console.log(account.slice(0, 500));
  if (errors.length) {
    console.log("console noise:", errors.slice(0, 5));
  }
  await browser.close();
  process.exit(0);
} catch (err) {
  const shot = "scripts/playwright-login-failure.png";
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.error("PLAYWRIGHT LOGIN FAILED:", err instanceof Error ? err.message : err);
  console.error("errors:", errors);
  await browser.close().catch(() => {});
  process.exit(1);
}
