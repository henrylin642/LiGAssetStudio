import { test, expect, Page, Request } from "@playwright/test";

const sampleAssets = [
  {
    id: "asset-1",
    type: "image",
    name: "Sample Image 1",
    url: "https://cdn.lig.com.tw/assets/1.jpg",
    size: 1024,
    previewUrl: "https://cdn.lig.com.tw/assets/1-thumb.jpg",
    ext: "jpg",
  },
  {
    id: "asset-2",
    type: "image",
    name: "Sample Image 2",
    url: "https://cdn.lig.com.tw/assets/2.jpg",
    size: 2048,
    previewUrl: "https://cdn.lig.com.tw/assets/2-thumb.jpg",
    ext: "jpg",
  },
  {
    id: "asset-3",
    type: "image",
    name: "Sample Image 3",
    url: "https://cdn.lig.com.tw/assets/3.jpg",
    size: 4096,
    previewUrl: "https://cdn.lig.com.tw/assets/3-thumb.jpg",
    ext: "jpg",
  },
];

async function mockLogin(page: Page, token = "mock-token") {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token, user: { email: "tester@lig.com.tw" } }),
    });
  });
}

async function mockAssets(page: Page, assets = sampleAssets) {
  await page.route("**/api/assets**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: assets, page: 1, pageSize: 24, total: assets.length }),
    });
  });
}

async function mockScenes(page: Page) {
  await page.route("**/api/scenes", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 11, name: "Lobby", description: "AR lobby" },
        { id: 12, name: "Showroom", description: "Product zone" },
      ]),
    });
  });
}

async function ensureLoggedIn(page: Page) {
  await mockLogin(page);
  await mockAssets(page);
  await mockScenes(page);
  await page.goto("/login");
  await page.fill("input#email", "tester@lig.com.tw");
  await page.fill("input#password", "password123");
  await Promise.all([
    page.waitForURL("**/"),
    page.click("button[type=submit]"),
  ]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("e2e-auth-1: successful login stores token and redirects", async ({ page }) => {
  await mockLogin(page, "token-123");
  await mockAssets(page);
  await mockScenes(page);

  await page.goto("/login");
  await page.fill("input#email", "user@lig.com.tw");
  await page.fill("input#password", "supersecret");
  await Promise.all([
    page.waitForURL("**/"),
    page.click("button[type=submit]"),
  ]);

  const token = await page.evaluate(() => window.localStorage.getItem("assets-studio-token"));
  expect(token).toBe("token-123");
});

test("e2e-auth-2: unauthenticated user is redirected to login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login");
});

test("e2e-gallery-1: gallery requests assets and renders pagination", async ({ page }) => {
  await ensureLoggedIn(page);

  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
  await expect(page.getByText("Sample Image 1")).toBeVisible();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Batch actions" })).toBeDisabled();
});

test("e2e-job-1: batch downscale job flows to Jobs list with ZIP", async ({ page }) => {
  const jobId = "job-xyz";
  let jobCreated = false;

  await mockLogin(page);
  await mockAssets(page);
  await mockScenes(page);
  await page.route("**/api/jobs", async (route) => {
    const request = route.request();
    if (request.method().toUpperCase() === "POST") {
      const payload = await request.postDataJSON();
      expect(payload.kind).toBe("downscale");
      expect(payload.assetIds.length).toBeGreaterThan(0);
      jobCreated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: jobId,
          state: "queued",
          progress: 0,
          message: "Job queued",
          results: [],
          kind: "downscale",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          options: payload.options,
          assetIds: payload.assetIds,
        }),
      });
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: jobId,
          state: "done",
          progress: 100,
          message: "Job completed",
          kind: "downscale",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          options: { target: "image", keepAspectRatio: true },
          assetIds: ["asset-1", "asset-2", "asset-3"],
          results: [
            {
              id: `${jobId}-zip`,
              jobId,
              kind: "zip",
              filename: `${jobId}.zip`,
              size: 1024,
              url: `/api/jobs/${jobId}/download`,
            },
          ],
        },
      ]),
    });
  });

  await page.goto("/login");
  await page.fill("input#email", "batcher@lig.com.tw");
  await page.fill("input#password", "pass1234");
  await Promise.all([
    page.waitForURL("**/"),
    page.click("button[type=submit]"),
  ]);

  await page.getByText("Batch actions (0)");
  await page.getByText("Sample Image 1");

  for (let i = 0; i < sampleAssets.length; i += 1) {
    await page.getByRole("checkbox").nth(i).click();
  }

  await page.getByRole("button", { name: /Batch actions/ }).click();
  await page.getByRole("button", { name: /Create Downscale job/ }).click();
  await expect.poll(() => jobCreated).toBeTruthy();

  await page.getByRole("link", { name: "Jobs" }).click();
  await expect(page.getByText("Job job-xyz")).toBeVisible();
  await expect(page.getByText("Job completed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute("href", `/api/jobs/${jobId}/download`);
});

test("e2e-upload-1: asset detail uploads to scene", async ({ page }) => {
  await ensureLoggedIn(page);

  await page.route("**/api/assets/asset-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "asset-1",
        type: "model",
        name: "AR Model",
        url: "https://cdn.lig.com.tw/assets/model.glb",
        size: 8096,
        ext: "glb",
        meta: { format: "glb" },
      }),
    });
  });

  let uploadRequest: Request | null = null;
  await page.route("**/api/scenes/upload-from-asset", async (route) => {
    uploadRequest = route.request();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/asset/asset-1");
  await page.waitForSelector("text=AR Model");

  await page.locator("button[role='combobox']").first().click();
  await page.getByRole("option", { name: "Lobby" }).click();
  await page.fill("#sceneName", "AR Model Scene");
  await page.getByRole("button", { name: "Upload" }).click();

  expect(uploadRequest).not.toBeNull();
  const payload = await uploadRequest!.postDataJSON();
  expect(payload).toMatchObject({ assetId: "asset-1", sceneId: 11, name: "AR Model Scene" });
});
