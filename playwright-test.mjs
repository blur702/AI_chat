import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SITE = process.env.SITE || "https://ssdd.kevinalthaus.com";
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;
const QUESTION =
  process.env.TEST_QUESTION ||
  "What is the capital of France? Reply in one sentence.";

if (!USERNAME || !PASSWORD) {
  console.error(
    "FATAL: TEST_USERNAME and TEST_PASSWORD environment variables are required."
  );
  process.exit(1);
}

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || process.cwd();

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  // 1. Navigate to site
  console.log(">> Navigating to", SITE);
  await page.goto(SITE, { waitUntil: "networkidle" });
  console.log(">> Loaded:", await page.title());

  // 2. Login via API
  console.log(">> Logging in via API...");
  const loginResult = await page.evaluate(async ({ site, username, password }) => {
    const resp = await fetch(`${site}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: username, password }),
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}`, body: await resp.text() };
    const data = await resp.json();
    localStorage.setItem("workstation_token", data.access_token);
    return { token: data.access_token, userId: data.user?.id };
  }, { site: SITE, username: USERNAME, password: PASSWORD });

  if (loginResult.error) {
    console.log(">> Login failed:", loginResult.error, loginResult.body);
    await browser.close();
    return;
  }
  console.log(">> Login succeeded. User ID:", loginResult.userId);

  // 3. List user's projects to get a project ID
  console.log(">> Fetching projects...");
  const projects = await page.evaluate(async (token) => {
    const resp = await fetch("/api/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}`, body: await resp.text() };
    return resp.json();
  }, loginResult.token);

  console.log(">> Projects:", JSON.stringify(projects, null, 2).slice(0, 500));

  // 4. Get chats for the first project or list all chats
  let chatId = null;

  if (projects.projects && projects.projects.length > 0) {
    const projectId = projects.projects[0].id;
    console.log(">> Using project:", projectId);

    const chats = await page.evaluate(async ({ token, projectId }) => {
      const resp = await fetch(`/api/context/project/${projectId}/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return { error: `HTTP ${resp.status}`, body: await resp.text() };
      return resp.json();
    }, { token: loginResult.token, projectId });

    console.log(">> Chats:", JSON.stringify(chats, null, 2).slice(0, 800));

    if (chats.chats && chats.chats.length > 0) {
      chatId = chats.chats[0].id;
    }
  }

  if (!chatId) {
    console.log(">> No existing chat found. Creating one...");
    // Try to get or create default chat
    const defaultChat = await page.evaluate(async ({ token, projectId }) => {
      const resp = await fetch(`/api/context/project/${projectId}/default-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) return { error: `HTTP ${resp.status}`, body: await resp.text() };
      return resp.json();
    }, { token: loginResult.token, projectId: projects.projects?.[0]?.id });

    console.log(">> Default chat:", JSON.stringify(defaultChat, null, 2));
    chatId = defaultChat.chat_id || defaultChat.id;
  }

  if (!chatId) {
    console.log(">> FATAL: Could not find or create a chat.");
    await browser.close();
    return;
  }

  console.log(">> Using chat UUID:", chatId);

  // 5. Send message via streaming API
  console.log(">> Sending question:", QUESTION);

  const streamResult = await page.evaluate(async ({ token, chatId, question }) => {
    const resp = await fetch(`/api/context/conversations/${chatId}/messages/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: question }),
    });

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}`, body: await resp.text() };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let messageId = "";
    let model = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "token") fullResponse += event.content;
          if (event.type === "done") {
            messageId = event.message_id;
            model = event.model;
          }
          if (event.type === "error") return { error: event.message };
        } catch {}
      }
    }

    return { response: fullResponse, messageId, model };
  }, { token: loginResult.token, chatId, question: QUESTION });

  // 6. Navigate to the chat in the UI and take a screenshot
  await page.goto(`${SITE}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  // Click first chat
  const chatLink = page.locator('a[href*="/chat/"]').first();
  if (await chatLink.count() > 0) {
    await chatLink.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
  }
  const screenshotPath = resolve(SCREENSHOT_DIR, "pw-response.png");
  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // 7. Report
  console.log("\n" + "=".repeat(60));
  console.log("E2E TEST RESULTS");
  console.log("=".repeat(60));
  console.log("Site:      ", SITE);
  console.log("User:      ", USERNAME);
  console.log("Chat ID:   ", chatId);
  console.log("=".repeat(60));
  console.log("\nQUESTION:  ", QUESTION);
  console.log("=".repeat(60));

  if (streamResult.error) {
    console.log("\nERROR:     ", streamResult.error);
    if (streamResult.body) console.log("Details:   ", streamResult.body);
  } else {
    console.log("\nRESPONSE:  ", streamResult.response);
    console.log("\nModel:     ", streamResult.model);
    console.log("Message ID:", streamResult.messageId);
  }

  console.log("=".repeat(60));

  await browser.close();
  console.log("\n>> Test complete.");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
