import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { flushRateLimits, resetLockout } from "../../helpers/db";
import { ADMIN_ID, ADMIN_PW } from "../../helpers/credentials";

const ORIGIN = process.env.BASE_URL ?? "https://ssdd.kevinalthaus.com";

test.describe("Video Studio — full e2e", () => {
  let projectId: string;

  test.beforeEach(async () => {
    flushRateLimits();
    resetLockout(ADMIN_ID);
  });

  test.afterAll(async ({ request }) => {
    // Clean up: delete the test project if it was created
    if (projectId) {
      try {
        // Login to get auth cookie
        await request.post("/api/auth/login", {
          data: { identifier: ADMIN_ID, password: ADMIN_PW },
        });
        await request.delete(`/api/studio/projects/${projectId}`, {
          headers: { Origin: ORIGIN },
        });
      } catch {
        // best-effort cleanup
      }
    }
  });

  test("Studio dashboard loads and shows empty state or project list", async ({ page }) => {
    await loginAsAdmin(page, "/studio");
    await page.waitForLoadState("networkidle");

    // Page should show "Video Studio" header
    await expect(page.getByText("Video Studio")).toBeVisible({ timeout: 10_000 });

    // Should show either "No projects yet" or a grid of project cards
    const newProjectBtn = page.getByRole("button", { name: /new project/i });
    await expect(newProjectBtn).toBeVisible({ timeout: 5_000 });

    // The button should be enabled
    await expect(newProjectBtn).toBeEnabled();
  });

  test("Create project, add text + subtitle timeline, save, and verify", async ({ page }) => {
    test.setTimeout(90_000);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("401")) {
        consoleErrors.push(msg.text());
      }
    });

    await loginAsAdmin(page, "/studio");
    await page.waitForLoadState("networkidle");

    // --- Step 1: Create a new project via API ---
    const createRes = await page.request.post("/api/studio/projects", {
      headers: { Origin: ORIGIN },
      data: { name: "E2E Test Video" },
    });
    expect(createRes.ok()).toBeTruthy();
    const project = await createRes.json();
    projectId = project.id;
    expect(project.name).toBe("E2E Test Video");
    expect(project.status).toBe("draft");

    // --- Step 2: Navigate to project editor ---
    await page.goto(`/studio/${projectId}`);
    await page.waitForLoadState("networkidle");

    // Editor should load with the project name visible
    await expect(page.getByText("E2E Test Video").first()).toBeVisible({ timeout: 10_000 });

    // --- Step 3: Build a timeline with text + subtitle clips via API ---
    const timelineData = {
      version: 1,
      settings: {
        width: 1920,
        height: 1080,
        fps: 30,
        background_color: "#1a1a2e",
      },
      tracks: [
        {
          id: "track-text-1",
          type: "text",
          name: "Title Text",
          order: 0,
          muted: false,
          locked: false,
          visible: true,
          clips: [
            {
              id: "clip-title-1",
              type: "text",
              media_asset_id: null,
              start_time: 0,
              duration: 5,
              properties: {
                text: "Welcome to the AI Workstation",
                font_size: 72,
                color: "#ffffff",
                position: { x: 0.5, y: 0.3 },
                opacity: 1,
              },
            },
            {
              id: "clip-title-2",
              type: "text",
              media_asset_id: null,
              start_time: 5,
              duration: 4,
              properties: {
                text: "Built with Next.js, FastAPI, and Docker",
                font_size: 36,
                color: "#94a3b8",
                position: { x: 0.5, y: 0.5 },
                opacity: 1,
              },
            },
          ],
        },
        {
          id: "track-subtitle-1",
          type: "subtitle",
          name: "Subtitles",
          order: 1,
          muted: false,
          locked: false,
          visible: true,
          clips: [
            {
              id: "clip-sub-1",
              type: "subtitle",
              media_asset_id: null,
              start_time: 0,
              duration: 5,
              properties: {
                subtitle_text: "This is the main title screen",
                subtitle_style: "bottom-center",
                color: "#ffffff",
                font_size: 24,
                background_opacity: 0.7,
              },
            },
            {
              id: "clip-sub-2",
              type: "subtitle",
              media_asset_id: null,
              start_time: 5,
              duration: 4,
              properties: {
                subtitle_text: "Powered by modern web technologies",
                subtitle_style: "bottom-center",
                color: "#ffffff",
                font_size: 24,
                background_opacity: 0.7,
              },
            },
          ],
        },
      ],
    };

    // Save timeline via API
    const saveRes = await page.request.put(`/api/studio/projects/${projectId}`, {
      headers: { Origin: ORIGIN },
      data: {
        name: "E2E Test Video — Text & Subtitles",
        timeline_data: timelineData,
        duration_seconds: 9,
      },
    });
    expect(saveRes.ok()).toBeTruthy();
    const savedProject = await saveRes.json();
    expect(savedProject.name).toBe("E2E Test Video — Text & Subtitles");
    expect(savedProject.duration_seconds).toBe(9);

    // --- Step 4: Verify timeline was saved correctly ---
    const getRes = await page.request.get(`/api/studio/projects/${projectId}`);
    expect(getRes.ok()).toBeTruthy();
    const fetchedProject = await getRes.json();
    expect(fetchedProject.timeline_data).toBeTruthy();
    expect(fetchedProject.timeline_data.tracks).toHaveLength(2);
    expect(fetchedProject.timeline_data.tracks[0].clips).toHaveLength(2);
    expect(fetchedProject.timeline_data.tracks[0].clips[0].properties.text).toBe(
      "Welcome to the AI Workstation",
    );
    expect(fetchedProject.timeline_data.settings.background_color).toBe("#1a1a2e");

    // --- Step 5: Reload editor and verify UI reflects the saved data ---
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Project name should update in the editor
    await expect(
      page.getByText("E2E Test Video — Text & Subtitles").first(),
    ).toBeVisible({ timeout: 10_000 });

    // --- Step 6: Verify the project appears in the project list ---
    await page.goto("/studio");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("E2E Test Video — Text & Subtitles").first(),
    ).toBeVisible({ timeout: 10_000 });

    // --- Step 7: Test export API (HTML format — no FFmpeg required) ---
    const exportRes = await page.request.post(
      `/api/studio/projects/${projectId}/export`,
      {
        headers: { Origin: ORIGIN },
        data: { format: "html" },
      },
    );
    // Export may succeed (returns export job) or fail if worker isn't running
    if (exportRes.ok()) {
      const exportJob = await exportRes.json();
      expect(exportJob.status).toBeTruthy();
      expect(exportJob.format).toBe("html");

      // Poll for export completion (up to 30s)
      const exportId = exportJob.id;
      let exportComplete = false;
      for (let i = 0; i < 15; i++) {
        const statusRes = await page.request.get(`/api/studio/exports/${exportId}`);
        if (statusRes.ok()) {
          const statusData = await statusRes.json();
          if (statusData.status === "completed") {
            exportComplete = true;
            expect(statusData.file_size_bytes).toBeGreaterThan(0);
            break;
          }
          if (statusData.status === "failed") {
            console.warn("Export failed:", statusData.error_message);
            break;
          }
        }
        await page.waitForTimeout(2_000);
      }
      if (exportComplete) {
        // Download the export
        const downloadRes = await page.request.get(
          `/api/studio/exports/${exportId}/download`,
        );
        expect(downloadRes.ok()).toBeTruthy();
        const body = await downloadRes.text();
        expect(body).toContain("<!DOCTYPE html");
        expect(body).toContain("Welcome to the AI Workstation");
      }
    } else {
      console.warn(`Export request returned ${exportRes.status()} — worker may not be running`);
    }

    // --- Step 8: Test media listing (should be empty for this project) ---
    const mediaRes = await page.request.get(`/api/studio/projects/${projectId}/media`);
    expect(mediaRes.ok()).toBeTruthy();
    const mediaData = await mediaRes.json();
    expect(mediaData.assets).toHaveLength(0);

    // Report console errors
    if (consoleErrors.length > 0) {
      console.warn("Console errors during test:", consoleErrors);
    }
  });

  test("Studio editor UI panels are present and interactive", async ({ page }) => {
    test.setTimeout(60_000);

    // Create a fresh project for UI testing
    await loginAsAdmin(page, "/studio");
    await page.waitForLoadState("networkidle");

    const createRes = await page.request.post("/api/studio/projects", {
      headers: { Origin: ORIGIN },
      data: { name: "UI Panel Test" },
    });
    expect(createRes.ok()).toBeTruthy();
    const project = await createRes.json();
    const uiProjectId = project.id;

    await page.goto(`/studio/${uiProjectId}`);
    await page.waitForLoadState("networkidle");

    // Verify all major UI panels load
    await expect(page.getByText("UI Panel Test").first()).toBeVisible({ timeout: 10_000 });

    // Media bin should be visible (left panel)
    await expect(page.getByText(/media|upload/i).first()).toBeVisible({ timeout: 5_000 });

    // Timeline area should be visible (bottom panel)
    await expect(page.getByText(/timeline|tracks/i).first()).toBeVisible({ timeout: 5_000 });

    // Take a screenshot for visual verification
    await page.screenshot({
      path: "test-results/studio-editor-panels.png",
      fullPage: true,
    });

    // Clean up
    await page.request.delete(`/api/studio/projects/${uiProjectId}`, {
      headers: { Origin: ORIGIN },
    });
  });
});
