import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { chromium } from "playwright";

const extensionPath = resolve(import.meta.dirname, "../../dist");
const chromiumPath =
  process.env.CHROMIUM_PATH ?? execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();

let context: BrowserContext;
let extensionId: string;
let userDataDir: string;

test.beforeAll(async () => {
  execFileSync("npm", ["run", "build"], {
    cwd: resolve(import.meta.dirname, "../.."),
    stdio: "inherit",
  });
});

test.beforeEach(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "webgpu-upscaler-e2e-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromiumPath,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--enable-unsafe-webgpu",
      "--ignore-gpu-blocklist",
      "--enable-features=Vulkan",
      "--use-angle=vulkan",
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
});

test.afterEach(async () => {
  await context?.close();
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
  context = undefined as unknown as BrowserContext;
  userDataDir = "";
});

test("loads as MV3 extension and processes a live video without mutating playback", async () => {
  await setSettings({
    enabled: true,
    profile: "anime",
    quality: "high",
    target: "2x",
    comparison: 100,
    showHud: true,
  });

  const page = await createYouTubeFixture();
  const webgpuSupported = await page.evaluate(() => Boolean(navigator.gpu));
  expect(webgpuSupported).toBe(true);

  const video = page.locator("video");
  await expect(video).toHaveJSProperty("paused", false);
  const before = await video.evaluate((element: HTMLVideoElement) => ({
    muted: element.muted,
    volume: element.volume,
    playbackRate: element.playbackRate,
  }));

  const canvas = page.locator('canvas[data-webgpu-upscaler="canvas"]');
  await expect(canvas).toBeAttached({ timeout: 20_000 });
  await expect(canvas).toHaveCSS("opacity", "1", { timeout: 20_000 });
  await expect(canvas).toHaveJSProperty("width", 1280);
  await expect(canvas).toHaveJSProperty("height", 720);
  await expect(canvas).toHaveCSS("pointer-events", "none");

  const after = await video.evaluate((element: HTMLVideoElement) => ({
    muted: element.muted,
    volume: element.volume,
    playbackRate: element.playbackRate,
  }));
  expect(after).toEqual(before);

  const hud = page.locator('[data-webgpu-upscaler="hud"]');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("640×360 → 1280×720");

  await setSettings({
    enabled: false,
    profile: "safe",
    quality: "medium",
    target: "2x",
    comparison: 100,
    showHud: true,
  });
  await expect(canvas).not.toBeAttached({ timeout: 10_000 });
  await page.close();
});

test("tracks a replacement video during YouTube-style SPA navigation", async () => {
  await setSettings({
    enabled: true,
    profile: "anime",
    quality: "low",
    target: "2x",
    comparison: 55,
    showHud: false,
  });
  const page = await createYouTubeFixture();

  const firstCanvas = page.locator('canvas[data-webgpu-upscaler="canvas"]');
  await expect(firstCanvas).toHaveCSS("opacity", "1", { timeout: 20_000 });
  await expect(firstCanvas).toHaveCSS("clip-path", "inset(0px 45% 0px 0px)");

  await setSettings({
    enabled: true,
    profile: "anime",
    quality: "low",
    target: "2x",
    comparison: 0,
    showHud: false,
  });
  await expect(firstCanvas).toHaveCSS("clip-path", "inset(0px 100% 0px 0px)");
  await setSettings({
    enabled: true,
    profile: "anime",
    quality: "low",
    target: "2x",
    comparison: 100,
    showHud: false,
  });
  await expect(firstCanvas).toHaveCSS("clip-path", "inset(0px 0% 0px 0px)");

  await page.evaluate(async () => {
    const oldVideo = document.querySelector("video");
    oldVideo?.remove();
    const replacement = document.createElement("video");
    replacement.autoplay = true;
    replacement.muted = true;
    replacement.loop = true;
    replacement.style.cssText = "display:block;width:800px;height:450px;background:#111";
    document.querySelector(".html5-video-container")?.prepend(replacement);
    const source = document.querySelector<HTMLCanvasElement>("#source");
    if (!source) throw new Error("Fixture canvas missing");
    replacement.srcObject = source.captureStream(30);
    await replacement.play();
    window.dispatchEvent(new Event("yt-navigate-finish"));
  });

  await expect(page.locator('canvas[data-webgpu-upscaler="canvas"]')).toHaveCount(1);
  await expect(page.locator('canvas[data-webgpu-upscaler="canvas"]')).toHaveCSS("opacity", "1", {
    timeout: 20_000,
  });
  await page.close();
});

test("reacts to a same-element source resolution change without duplicating the overlay", async () => {
  await setSettings({
    enabled: true,
    profile: "anime",
    quality: "low",
    target: "2x",
    comparison: 100,
    showHud: true,
  });
  const page = await createYouTubeFixture();
  const video = page.locator("video");
  const canvas = page.locator('canvas[data-webgpu-upscaler="canvas"]');
  await expect(canvas).toHaveCSS("opacity", "1", { timeout: 20_000 });

  const identity = await video.evaluate((element) => {
    const source = element as HTMLVideoElement & { fixtureIdentity?: string };
    source.fixtureIdentity = "same-source-video";
    return source.fixtureIdentity;
  });
  const before = await video.evaluate((element: HTMLVideoElement) => ({
    muted: element.muted,
    volume: element.volume,
    playbackRate: element.playbackRate,
  }));

  await page.evaluate(async () => {
    const video = document.querySelector("video");
    if (!video) throw new Error("Fixture video missing");
    const nextSource = document.createElement("canvas");
    nextSource.width = 800;
    nextSource.height = 450;
    nextSource.style.display = "none";
    document.body.append(nextSource);
    const context = nextSource.getContext("2d");
    if (!context) throw new Error("Fixture canvas context missing");
    let frame = 0;
    const draw = () => {
      context.fillStyle = "#153a5f";
      context.fillRect(0, 0, nextSource.width, nextSource.height);
      context.fillStyle = "#d8f36c";
      context.fillRect((frame * 7) % 740, 150, 60, 60);
      frame += 1;
      requestAnimationFrame(draw);
    };
    draw();
    const nextStream = nextSource.captureStream(30);
    video.srcObject = nextStream;
    await video.play();
  });

  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return video?.videoWidth === 800 && video.videoHeight === 450;
    },
    undefined,
    { timeout: 20_000 },
  );
  await expect(page.locator('canvas[data-webgpu-upscaler="canvas"]')).toHaveCount(1);
  await expect(canvas).toHaveCSS("opacity", "1", { timeout: 20_000 });

  const after = await video.evaluate((element: HTMLVideoElement) => {
    const source = element as HTMLVideoElement & { fixtureIdentity?: string };
    return {
      identity: source.fixtureIdentity,
      muted: source.muted,
      volume: source.volume,
      playbackRate: source.playbackRate,
    };
  });
  expect(after).toEqual({ identity, ...before });
  await page.close();
});

test("preserves user playback, captions, fullscreen, and control state", async () => {
  await setSettings({
    enabled: true,
    profile: "anime",
    quality: "low",
    target: "2x",
    comparison: 50,
    showHud: false,
  });
  const page = await createYouTubeFixture();
  const video = page.locator("video");
  const canvas = page.locator('canvas[data-webgpu-upscaler="canvas"]');
  await expect(canvas).toHaveCSS("opacity", "1", { timeout: 20_000 });

  await page.evaluate(() => {
    const element = document.querySelector("video");
    if (!element) throw new Error("Fixture video missing");
    element.pause();
    element.currentTime = 0;
    element.playbackRate = 0.75;
    element.volume = 0.37;
    element.muted = false;
    document.dispatchEvent(new Event("fullscreenchange"));
  });

  const userState = await video.evaluate((element: HTMLVideoElement) => ({
    currentTime: element.currentTime,
    paused: element.paused,
    muted: element.muted,
    volume: element.volume,
    playbackRate: element.playbackRate,
    textTracks: element.textTracks.length,
    controls: document.querySelectorAll(".ytp-chrome-bottom [role='button']").length,
  }));
  await page.waitForTimeout(250);
  const after = await video.evaluate((element: HTMLVideoElement) => ({
    currentTime: element.currentTime,
    paused: element.paused,
    muted: element.muted,
    volume: element.volume,
    playbackRate: element.playbackRate,
    textTracks: element.textTracks.length,
    controls: document.querySelectorAll(".ytp-chrome-bottom [role='button']").length,
  }));

  expect(after).toEqual(userState);
  await expect(canvas).toHaveCSS("pointer-events", "none");
  await expect(page.locator(".ytp-chrome-bottom [role='button']")).toHaveCount(1);
  await page.close();
});

async function setSettings(settings: Record<string, unknown>): Promise<void> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(async (value) => {
    await chrome.storage.local.set({ upscalerSettings: value });
  }, settings);
  await popup.close();
}

async function createYouTubeFixture(): Promise<Page> {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      process.stderr.write(`[fixture:${message.type()}] ${message.text()}\n`);
    }
  });
  await page.route("https://www.youtube.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: FIXTURE_HTML,
    });
  });
  await page.goto("https://www.youtube.com/watch?v=webgpu-test");
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  });
  return page;
}

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; background: #05080c; }
      .html5-video-container { position: relative; width: 640px; height: 360px; }
      video { display: block; width: 640px; height: 360px; background: #111; }
      #source { display: none; }
    </style>
  </head>
  <body>
    <div class="html5-video-container">
      <video autoplay muted loop></video>
      <track kind="captions" label="English" srclang="en" default>
    </div>
    <div class="ytp-chrome-bottom"><div class="ytp-play-button" role="button"></div></div>
    <canvas id="source" width="640" height="360"></canvas>
    <script>
      const source = document.querySelector('#source');
      const context = source.getContext('2d');
      let frame = 0;
      function draw() {
        const gradient = context.createLinearGradient(0, 0, 640, 360);
        gradient.addColorStop(0, '#063b59');
        gradient.addColorStop(1, '#e8552c');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = '#fff';
        context.font = 'bold 34px sans-serif';
        context.fillText('WebGPU ' + frame, 32, 62);
        context.fillStyle = '#42e8a5';
        context.fillRect((frame * 5) % 580, 145, 60, 60);
        frame += 1;
        requestAnimationFrame(draw);
      }
      draw();
      const video = document.querySelector('video');
      video.srcObject = source.captureStream(30);
      video.volume = 0.42;
      video.playbackRate = 1.25;
      video.play();
    </script>
  </body>
</html>`;
