// Dependency-free Chromium QA. Uses a fresh temporary profile and keeps the
// browser sandbox enabled. Never connects to an existing browser or desktop.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mount = "/copilot-kubuntu-desktop-kit/";
const executable = process.env.BROWSER || "/usr/bin/google-chrome-stable";
await access(executable, constants.X_OK);
const temporary = await mkdtemp(path.join(os.tmpdir(), "desktop-kit-site-qa-"));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!url.pathname.startsWith(mount)) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("This test server only serves the Pages project path.");
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(mount.length)) || "index.html";
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root) || (await lstat(filename)).isSymbolicLink()) {
      response.writeHead(403);
      response.end();
      return;
    }
    const body = await readFile(filename);
    response.writeHead(200, {
      "Content-Type": mime[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": mime[".html"] });
    response.end(await readFile(path.join(root, "404.html")));
  }
});

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      } else {
        for (const handler of this.handlers.get(message.method) || []) handler(message);
      }
    });
    socket.addEventListener("close", () => {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("The isolated browser connection closed."));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CDP(socket);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) || new Set();
    handlers.add(handler);
    this.handlers.set(method, handlers);
    return () => handlers.delete(handler);
  }

  event(method, sessionId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`Browser event timed out: ${method}`));
      }, 20_000);
      const remove = this.on(method, (message) => {
        if (message.sessionId !== sessionId) return;
        clearTimeout(timer);
        remove();
        resolve(message.params);
      });
    });
  }
}

let chrome;
let client;
let passed = 0;
const errors = [];
const requests = [];

async function check(name, run) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = `${origin}${mount}`;
  const flags = [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--disable-breakpad",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-pings",
    "--password-store=basic",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${path.join(temporary, "profile")}`,
    "about:blank",
  ];
  assert.equal(flags.includes("--no-sandbox"), false);
  chrome = spawn(executable, flags, {
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(temporary, "config"),
      XDG_CACHE_HOME: path.join(temporary, "cache"),
    },
  });
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Headless Chrome did not become ready.")), 20_000);
    chrome.once("error", (error) => { clearTimeout(timer); reject(error); });
    chrome.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Isolated Chrome exited (${code}): ${output.slice(-1500)}`));
    });
    chrome.stderr.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  client = await CDP.connect(endpoint);
  const version = await client.send("Browser.getVersion");
  console.log(`${version.product} · sandbox enabled · temporary profile · project-path HTTP server`);
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}) => client.send(method, params, sessionId);
  for (const domain of ["Page", "Runtime", "Network", "Log", "Accessibility"]) await send(`${domain}.enable`);
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  client.on("Runtime.exceptionThrown", ({ params }) => errors.push(params.exceptionDetails.text));
  client.on("Log.entryAdded", ({ params }) => {
    if (params.entry.level === "error" && !params.entry.text.includes("404")) errors.push(params.entry.text);
  });
  client.on("Network.requestWillBeSent", ({ params, sessionId: eventSession }) => {
    if (eventSession === sessionId) requests.push(params.request.url);
  });

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async function navigate(url = home) {
    const loaded = client.event("Page.loadEventFired", sessionId);
    await send("Page.navigate", { url });
    await loaded;
    await evaluate("document.fonts.ready.then(() => true)");
  }

  async function viewport(width, color = "light", reduced = "reduce") {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [
        { name: "prefers-color-scheme", value: color },
        { name: "prefers-reduced-motion", value: reduced },
      ],
    });
  }

  async function press(key, code, windowsVirtualKeyCode, modifiers = 0) {
    const value = { key, code, windowsVirtualKeyCode, modifiers };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...value });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...value });
  }

  async function until(expression) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Browser condition did not become true: ${expression}`);
  }

  await viewport(1440);
  await navigate();

  await check("HTML and every runtime asset return 200 beneath the project subpath", async () => {
    const assets = await evaluate(`[
      ...Array.from(document.querySelectorAll("link[rel=stylesheet],link[rel=icon],script[src],img"))
        .map(element => element.href || element.src),
      ...Array.from(document.querySelectorAll("source")).map(element => new URL(element.srcset, location.href).href),
      new URL("sitemap.xml", location.href).href,
      new URL("robots.txt", location.href).href
    ]`);
    for (const url of [home, ...assets]) {
      const response = await fetch(url);
      assert.equal(response.status, 200, url);
      assert.ok(response.headers.get("content-type"));
    }
    assert.equal((await fetch(`${origin}/assets/site.css`)).status, 404, "Test must not hide root-path mistakes");
  });

  await check("parsed headings, landmarks, image names and buttons are accessible", async () => {
    const semantics = await evaluate(`(() => {
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
      const levels = headings.map(heading => Number(heading.tagName[1]));
      return {
        language: document.documentElement.lang,
        main: document.querySelectorAll("main").length,
        h1: document.querySelectorAll("h1").length,
        skippedHeading: levels.some((level, index) => index > 0 && level > levels[index - 1] + 1),
        unnamedLinks: [...document.querySelectorAll("a[href]")].filter(link =>
          !(link.getAttribute("aria-label") || link.textContent).trim()).length,
        unnamedButtons: [...document.querySelectorAll("button")].filter(button =>
          !(button.getAttribute("aria-label") || button.textContent).trim()).length,
        missingAlt: [...document.images].filter(image => !image.hasAttribute("alt")).length,
        copies: document.querySelectorAll("button[data-copy]:not([hidden])").length,
        errors: document.querySelectorAll("[aria-labelledby]").length
      };
    })()`);
    assert.equal(semantics.language, "en");
    assert.equal(semantics.main, 1);
    assert.equal(semantics.h1, 1);
    assert.equal(semantics.skippedHeading, false);
    assert.equal(semantics.unnamedLinks, 0);
    assert.equal(semantics.unnamedButtons, 0);
    assert.equal(semantics.missingAlt, 0);
    assert.equal(semantics.copies, 8);
    const tree = await send("Accessibility.getFullAXTree");
    assert.ok(tree.nodes.some((node) => node.role?.value === "main"));
    assert.ok(tree.nodes.some((node) => node.role?.value === "status"));
    assert.ok(tree.nodes.some((node) => node.role?.value === "image" && node.name?.value.includes("local stdio")));
  });

  for (const color of ["light", "dark"]) {
    for (const width of [320, 390, 480, 768, 1024, 1440, 1920]) {
      await check(`${width}px ${color}: reflow, containment, control size and text contrast`, async () => {
        await viewport(width, color);
        // Wait for the responsive picture and fonts, without taking over a live session.
        const pictureName = width <= 480 ? "control-path-narrow.svg" : "control-path.svg";
        await until(`document.querySelector(".route-figure img").currentSrc.endsWith("${pictureName}")`);
        await evaluate("Promise.all([...document.images].map(image => image.decode())).then(() => true)");
        const layout = await evaluate(`(() => {
          const visible = element => element.checkVisibility({
            visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true
          });
          const overflow = [...document.querySelectorAll("body *")].filter(element => {
            if (!visible(element) || element.closest("pre,svg") ||
              element.classList.contains("skip-link") || element.classList.contains("visually-hidden")) return false;
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > innerWidth + 1;
          }).map(element => element.tagName + "." + element.className);
          const controls = [...document.querySelectorAll(".main-nav a,button:not([hidden]),summary,.button")];
          const smallControls = controls.filter(element => {
            if (!visible(element)) return false;
            const rect = element.getBoundingClientRect();
            return rect.width < 24 || rect.height < 24;
          }).map(element => element.textContent);
          const clippedControls = controls.filter(element => visible(element) &&
            (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2))
            .map(element => element.textContent);
          return {
            width: innerWidth, documentWidth: document.documentElement.scrollWidth,
            overflow, smallControls, clippedControls,
            codeKeyboard: [...document.querySelectorAll("pre")].every(element =>
              element.tabIndex === 0 && getComputedStyle(element).overflowX === "auto"),
            picture: document.querySelector(".route-figure img").currentSrc,
            pageHeight: document.documentElement.scrollHeight
          };
        })()`);
        assert.ok(layout.documentWidth <= width, JSON.stringify(layout));
        assert.deepEqual(layout.overflow, [], JSON.stringify(layout));
        assert.deepEqual(layout.smallControls, []);
        assert.deepEqual(layout.clippedControls, []);
        assert.equal(layout.codeKeyboard, true);
        assert.ok(layout.picture.endsWith(width <= 480 ? "control-path-narrow.svg" : "control-path.svg"));

        const failures = await evaluate(`(() => {
          const rgba = value => (value.match(/[\\d.]+/g) || []).map(Number);
          const composite = (fg, bg) => {
            const alpha = fg[3] ?? 1;
            return fg.slice(0, 3).map((channel, index) => channel * alpha + bg[index] * (1 - alpha));
          };
          const background = element => {
            const lineage = [];
            for (let parent = element; parent; parent = parent.parentElement) lineage.unshift(parent);
            return lineage.reduce((color, parent) => composite(rgba(getComputedStyle(parent).backgroundColor), color), [255,255,255]);
          };
          const luminance = color => color.map(channel => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          }).reduce((total, channel, index) => total + channel * [0.2126,0.7152,0.0722][index], 0);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const failures = [];
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const element = node.parentElement;
            if (!node.textContent.trim() || !element?.getClientRects().length ||
              element.closest("script,style,svg,.visually-hidden,.skip-link")) continue;
            const style = getComputedStyle(element);
            if (style.visibility === "hidden") continue;
            const bg = background(element);
            const fg = composite(rgba(style.color), bg);
            const first = luminance(fg);
            const second = luminance(bg);
            const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
            const size = parseFloat(style.fontSize);
            const large = size >= 24 || (size >= 18.667 && Number(style.fontWeight) >= 700);
            if (ratio + 0.01 < (large ? 3 : 4.5)) failures.push({
              text: node.textContent.trim().slice(0, 75), ratio: ratio.toFixed(2), color: style.color,
              background: bg.map(Math.round), size
            });
          }
          return failures;
        })()`);
        assert.deepEqual(failures, [], `${width}px ${color} text contrast`);
      });
    }
  }

  await viewport(1440);
  await navigate();
  await check("the complete Tab order is reachable, visible and visibly focused", async () => {
    const expected = await evaluate(`(() => {
      window.qaTargets = [...document.querySelectorAll("a[href],button,summary,pre[tabindex],blockquote[tabindex]")]
        .filter(element => element.checkVisibility({
          visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true
        }) && !element.hidden && !element.disabled);
      return window.qaTargets.length;
    })()`);
    for (let index = 0; index < expected; index += 1) {
      await press("Tab", "Tab", 9);
      const focus = await evaluate(`(() => {
        const element = document.activeElement;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          index: window.qaTargets.indexOf(element),
          name: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 60),
          outline: parseFloat(style.outlineWidth),
          visible: rect.top >= -1 && rect.bottom <= innerHeight + 1
        };
      })()`);
      assert.equal(focus.index, index, JSON.stringify(focus));
      assert.ok(focus.outline >= 2, JSON.stringify(focus));
      assert.equal(focus.visible, true, JSON.stringify(focus));
    }
  });

  await check("skip link, anchor navigation and native disclosures work from the keyboard", async () => {
    await navigate();
    await press("Tab", "Tab", 9);
    assert.equal(await evaluate("document.activeElement.className"), "skip-link");
    await press("Enter", "Enter", 13);
    assert.equal(await evaluate("document.activeElement.id"), "main");
    for (const id of ["start", "boundaries", "evidence"]) {
      await evaluate(`document.querySelector('.main-nav a[href="#${id}"]').focus()`);
      await press("Enter", "Enter", 13);
      assert.equal(await evaluate("location.hash"), `#${id}`);
      const top = await evaluate(`document.getElementById("${id}").getBoundingClientRect().top`);
      assert.ok(top >= 0 && top < 60, `Anchor ${id} is visible: ${top}`);
    }
    await evaluate('document.querySelector("summary").focus()');
    await press(" ", "Space", 32);
    assert.equal(await evaluate('document.querySelector("details").open'), true);
    await press(" ", "Space", 32);
    assert.equal(await evaluate('document.querySelector("details").open'), false);
  });

  await check("all eight copy controls copy only their exact command or prompt", async () => {
    await client.send("Browser.grantPermissions", {
      origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
    });
    const copies = await evaluate(`Array.from(document.querySelectorAll("[data-copy]")).map(button => ({
      id: button.dataset.copy,
      label: button.dataset.label,
      text: document.getElementById(button.dataset.copy).textContent.trim()
    }))`);
    for (const copy of copies) {
      await evaluate(`document.querySelector('[data-copy="${copy.id}"]').focus()`);
      await press(" ", "Space", 32);
      await until(`document.querySelector('[data-copy="${copy.id}"]').dataset.state === "success"`);
      assert.equal(await evaluate("navigator.clipboard.readText()"), copy.text);
      assert.equal(await evaluate('document.getElementById("copy-status").textContent'), `${copy.label} copied.`);
      assert.equal(await evaluate("document.activeElement.dataset.copy"), copy.id, "Copy preserves keyboard focus");
    }
  });

  await check("clipboard denial has an announced, selected, keyboard-accessible fallback", async () => {
    await evaluate(`Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => { throw new DOMException("Denied in isolated QA", "NotAllowedError"); }
    })`);
    await evaluate('document.querySelector(\'[data-copy="plan-command"]\').focus()');
    await press(" ", "Space", 32);
    await until('document.querySelector(\'[data-copy="plan-command"]\').dataset.state === "error"');
    assert.match(await evaluate('document.getElementById("copy-status").textContent'), /denied.*manually/);
    assert.equal(await evaluate("window.getSelection().toString()"), "python3 scripts/desktop_backend.py install");
    assert.equal(await evaluate("document.activeElement.tagName"), "PRE");
  });

  await check("without the Clipboard API, copy buttons stay hidden and commands stay readable", async () => {
    const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: 'Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })',
    });
    await navigate();
    assert.equal(await evaluate('document.querySelectorAll("button:not([hidden])").length'), 0);
    assert.equal(await evaluate('document.getElementById("plan-command").textContent'), "python3 scripts/desktop_backend.py install");
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  });

  await check("with JavaScript disabled, setup, the task, rollback and disclosures remain usable", async () => {
    await send("Emulation.setScriptExecutionDisabled", { value: true });
    await navigate();
    assert.equal(await evaluate('document.querySelectorAll("button:not([hidden])").length'), 0);
    const text = await evaluate("document.body.innerText");
    for (const phrase of ["git rev-parse HEAD", "437", "Permission denied? Stop.", "uninstall --apply"]) {
      assert.ok(text.includes(phrase), phrase);
    }
    await evaluate('document.querySelector("summary").focus()');
    await press(" ", "Space", 32);
    assert.equal(await evaluate('document.querySelector("details").open'), true);
    await send("Emulation.setScriptExecutionDisabled", { value: false });
    await navigate();
  });

  await check("reduced motion disables smooth scrolling and animated transitions", async () => {
    await viewport(390, "dark", "reduce");
    assert.equal(await evaluate("getComputedStyle(document.documentElement).scrollBehavior"), "auto");
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".primary-button")).transitionDuration'), "0s");
    await viewport(390, "light", "no-preference");
    assert.equal(await evaluate("getComputedStyle(document.documentElement).scrollBehavior"), "smooth");
    await viewport(390);
  });

  await check("forced-colors and print retain the guide without horizontal clipping", async () => {
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }, { name: "prefers-reduced-motion", value: "reduce" }],
    });
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".primary-button")).borderTopStyle'), "solid");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await send("Emulation.setEmulatedMedia", { media: "print", features: [] });
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".copy-button")).display'), "none");
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".section-intro")).position'), "static");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await viewport(1440);
  });

  await check("a nested missing URL returns a self-contained, responsive, noindex 404", async () => {
    const url = `${home}missing/nested/page`;
    assert.equal((await fetch(url)).status, 404);
    await viewport(320);
    await navigate(url);
    assert.equal(await evaluate('document.querySelector(\'meta[name="robots"]\').content'), "noindex, follow");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    assert.equal(await evaluate('document.querySelector("a").href'), "https://arjith.github.io/copilot-kubuntu-desktop-kit/");
    await press("Tab", "Tab", 9);
    assert.equal(await evaluate("document.activeElement.tagName"), "A");
  });

  for (const [asset, width, height] of [
    ["control-path.svg", 520, 430],
    ["control-path-narrow.svg", 300, 430],
    ["social.svg", 1200, 630],
  ]) {
    await check(`${asset}: all authored text stays inside the illustration`, async () => {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await navigate(`${home}assets/${asset}`);
      const clipped = await evaluate(`(() => {
        const box = document.documentElement.viewBox.baseVal;
        return [...document.querySelectorAll("text")].filter(element => {
          const bounds = element.getBBox();
          return bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > box.width ||
            bounds.y + bounds.height > box.height;
        }).map(element => element.textContent);
      })()`);
      assert.deepEqual(clipped, []);
    });
  }

  if (process.argv.includes("--render-social")) {
    await check("render the original social SVG as a 1200 × 630 PNG", async () => {
      const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(path.join(root, "assets/social.png"), Buffer.from(screenshot.data, "base64"));
    });
  }

  await check("no uncaught errors, CSP failures or external runtime requests", async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter((url) => !url.startsWith(origin) && url !== "about:blank"), []);
  });
  console.log(`\n${passed} browser checks passed. Browser and HTTP server will now stop.`);
} finally {
  if (client) {
    await client.send("Browser.close").catch(() => {});
    client.socket.close();
  }
  if (chrome && chrome.exitCode === null) {
    const exited = once(chrome, "exit");
    const terminate = setTimeout(() => chrome.kill("SIGTERM"), 2000);
    const force = setTimeout(() => chrome.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(terminate);
    clearTimeout(force);
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
