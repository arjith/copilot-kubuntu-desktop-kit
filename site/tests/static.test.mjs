import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = path.dirname(root);
const canonical = "https://arjith.github.io/copilot-kubuntu-desktop-kit/";
const source = "https://github.com/arjith/copilot-kubuntu-desktop-kit";
const release = "02d3a7f653c6038e92729b709c64cdb3a4135d49";
const html = await readFile(path.join(root, "index.html"), "utf8");
const css = await readFile(path.join(root, "assets/site.css"), "utf8");
const js = await readFile(path.join(root, "assets/site.js"), "utf8");
const lock = JSON.parse(await readFile(path.join(repository, "backend.lock.json"), "utf8"));

// This small attribute reader tests our authored, double-quoted HTML. The browser
// suite checks the parsed DOM; an HTML5 parser is also used during release QA.
function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}

function meta(name) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/g)) {
    const values = attributes(tag[0]);
    if (values.name === name || values.property === name) return values.content;
  }
}

function command(id) {
  const match = html.match(new RegExp(`<code id="${id}">([\\s\\S]*?)</code>`));
  assert.ok(match, `Command ${id} exists`);
  return match[1];
}

async function files(directory = root) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, item.name);
    assert.equal((await lstat(fullPath)).isSymbolicLink(), false, `${fullPath} must not be a symlink`);
    if (item.isDirectory()) result.push(...await files(fullPath));
    else result.push(fullPath);
  }
  return result;
}

test("indexable HTML has a unique title, description, canonical and language", () => {
  const titles = [...html.matchAll(/<title>([^<]+)<\/title>/g)];
  assert.equal(titles.length, 1);
  assert.ok(titles[0][1].length <= 65);
  assert.match(titles[0][1], /Copilot Kubuntu Desktop Kit/);
  assert.ok(meta("description").length >= 100 && meta("description").length <= 165);
  assert.match(html, /<html lang="en">/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}">`));
  assert.equal(meta("robots"), "index, follow, max-image-preview:large");
  assert.equal(meta("referrer"), "no-referrer");
});

test("social metadata uses a real local 1200 × 630 PNG, with alternate text", async () => {
  assert.equal(meta("og:url"), canonical);
  assert.equal(meta("og:type"), "website");
  assert.equal(meta("twitter:card"), "summary_large_image");
  assert.equal(meta("og:image"), `${canonical}assets/social.png`);
  assert.equal(meta("twitter:image"), meta("og:image"));
  assert.ok(meta("og:image:alt").length > 30);
  assert.ok(meta("twitter:image:alt").length > 30);
  const png = await readFile(path.join(root, "assets/social.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.equal(meta("og:image:width"), "1200");
  assert.equal(meta("og:image:height"), "630");
  assert.ok(png.length < 200_000, `Social PNG is ${png.length} bytes`);
});

test("structured data describes source code without invented ratings or authorship", () => {
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data["@type"], "SoftwareSourceCode");
  assert.equal(data.name, "Copilot Kubuntu Desktop Kit");
  assert.equal(data.codeRepository, source);
  assert.equal(data.url, canonical);
  assert.equal(data.version, "0.1.0");
  assert.equal(data.license, `${source}/blob/${release}/LICENSE`);
  assert.equal(data.isBasedOn, "https://github.com/agent-sh/computer-use-linux");
  for (const forbidden of ["aggregateRating", "review", "offers", "author", "downloadCount"]) {
    assert.equal(forbidden in data, false, `Do not invent ${forbidden}`);
  }
});

test("all relative assets and in-page links resolve under the Pages project path", async () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "IDs are unique");
  const references = [...html.matchAll(/<(?:a|link|img|source|script)\b[^>]*>/g)];
  for (const reference of references) {
    const values = attributes(reference[0]);
    const raw = values.href || values.src || values.srcset;
    if (!raw) continue;
    assert.doesNotMatch(raw, /^\/|^(?:javascript|data):/, `Unsafe or root-relative URL: ${raw}`);
    const url = new URL(raw, canonical);
    if (url.origin !== new URL(canonical).origin) continue;
    assert.ok(url.pathname.startsWith(new URL(canonical).pathname));
    if (url.hash) assert.ok(ids.includes(url.hash.slice(1)), `Missing target ${url.hash}`);
    const relative = url.pathname.slice(new URL(canonical).pathname.length);
    const target = path.join(root, relative || "index.html");
    assert.ok((await lstat(target)).isFile(), `Missing local asset ${raw}`);
  }
  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(ids.includes(id), `Missing accessible label ${id}`);
  }
});

test("pinned source links exist in the immutable release, not just the current checkout", () => {
  const checked = new Set();
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const url = new URL(match[1], canonical);
    if (!url.href.startsWith(`${source}/blob/`) && !url.href.startsWith(`${source}/tree/`)) continue;
    const [, kind, revision, ...parts] = url.pathname.split("/").slice(2);
    assert.ok(kind === "tree" || kind === "blob");
    assert.equal(revision, release);
    const relative = parts.join("/");
    const object = relative ? `${release}:${relative}` : release;
    if (checked.has(object)) continue;
    execFileSync("git", ["cat-file", "-e", object], { cwd: repository, stdio: "pipe" });
    checked.add(object);
  }
  assert.ok(checked.size >= 10);
});

test("the install journey separates review, plan, apply, doctor and local loading", () => {
  assert.equal(command("clone-command"), `git clone --branch v0.1.0 --depth 1 \\\n  ${source}.git\ncd copilot-kubuntu-desktop-kit\ngit rev-parse HEAD`);
  assert.equal(command("plan-command"), "python3 scripts/desktop_backend.py install");
  assert.equal(command("apply-command"), "python3 scripts/desktop_backend.py install --apply\npython3 scripts/desktop_backend.py doctor");
  assert.equal(command("load-command"), 'copilot --plugin-dir "$PWD" skill list\ncopilot --plugin-dir "$PWD"');
  assert.equal(command("agent-command"), "/agent copilot-kubuntu-desktop-kit:desktop-operator");
  assert.equal(command("marketplace-command"), "copilot plugin marketplace add arjith/copilot-kubuntu-desktop-kit\ncopilot plugin install copilot-kubuntu-desktop-kit@kubuntu-desktop-kit");
  assert.equal(command("remove-plan-command"), "python3 scripts/desktop_backend.py uninstall");
  assert.equal(command("remove-apply-command"), "python3 scripts/desktop_backend.py uninstall --apply");
  assert.equal(lock.tag, "v0.7.53");
  assert.equal(lock.artifacts.length, 3);
  assert.match(html, /Python 3\.12\+/);
  assert.match(html, /Copilot CLI 1\.0\.112/);
  assert.match(html, /02d3a7f653c6038e92729b709c64cdb3a4135d49/);
});

test("the KCalc prompt is a bounded manual acceptance task, with visible-result verification", () => {
  const prompt = html.match(/id="kcalc-prompt"[^>]*>([^<]+)<\/blockquote>/)[1];
  assert.equal(prompt, "In the KCalc window, calculate 19 multiplied by 23 using the visible calculator controls. Read the result back. Do not use a shell, other applications, or change the calculator's settings. Stop if the target is ambiguous.");
  assert.match(html, /Open KCalc yourself/);
  assert.match(html, /not a recorded demonstration/);
  assert.match(html, /class="result-value">437/);
  assert.match(html, /correct answer in chat/);
  assert.match(html, /Permission denied\? Stop/);
  assert.match(html, /does <strong>not<\/strong> make model inference offline or private/);
  assert.match(html, /not automatically password-redacted/);
  assert.match(html, /issues\/new\?template=compatibility\.yml/);
  assert.match(html, /Awesome Copilot review is still pending/);
});

test("semantics and progressive enhancement do not depend on JavaScript", () => {
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.equal([...html.matchAll(/<main\b/g)].length, 1);
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  for (const match of html.matchAll(/<button\b[^>]*data-copy[^>]*>/g)) {
    const values = attributes(match[0]);
    assert.equal(values.type, "button");
    assert.match(match[0], /\bhidden/);
    assert.ok(values["data-label"]);
    assert.ok(html.includes(`id="${values["data-copy"]}"`));
  }
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /:focus-visible/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(js, /execCommand|localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon/);
});

test("there are no remote runtime dependencies, data-collection forms or executable inline scripts", () => {
  for (const match of html.matchAll(/<script\b([^>]*)>/g)) {
    const values = attributes(match[0]);
    assert.ok(values.type === "application/ld+json" || values.src === "assets/site.js");
  }
  assert.doesNotMatch(html, /<(?:iframe|form|input)\b/);
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/);
  assert.match(meta("Content-Security-Policy") || html, /connect-src 'none'/);
  assert.ok(Buffer.byteLength(html) < 40_000);
  assert.ok(Buffer.byteLength(css) < 35_000);
  assert.ok(Buffer.byteLength(js) < 4_000);
});

test("sitemap and robots use the exact project URL; 404 is noindex and nested-path safe", async () => {
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  const robots = await readFile(path.join(root, "robots.txt"), "utf8");
  const notFound = await readFile(path.join(root, "404.html"), "utf8");
  assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
  assert.ok(robots.includes(`Sitemap: ${canonical}sitemap.xml`));
  assert.match(notFound, /name="robots" content="noindex, follow"/);
  assert.ok(notFound.includes(`href="${canonical}"`));
  assert.doesNotMatch(notFound, /<script|<link|<img/);
});

test("the artifact has no symlinks, vendored dependencies or executable downloads", async () => {
  const names = (await files()).map((name) => path.relative(root, name));
  assert.ok(names.length >= 10);
  for (const name of names) {
    assert.doesNotMatch(name, /node_modules|package(?:-lock)?\.json|\.woff2?$|\.exe$|\.so$/);
  }
});
