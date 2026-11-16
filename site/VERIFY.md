# Static site handoff

This directory is the complete Pages artifact. It has no build step, package
manager, external fonts, remote runtime scripts, analytics or data-collection
forms. All commands and guidance are in the HTML. JavaScript only enhances
clipboard copying. The color scheme follows the user's system preference.

## Validate

From the repository root, using Node.js 22+ (validated on Node 24):

```sh
node --test site/tests/static.test.mjs
node site/tests/browser.mjs
```

The browser check uses `/usr/bin/google-chrome-stable` by default. Set `BROWSER`
to another installed Chromium-compatible executable if needed. It uses the
browser's DevTools protocol directly, with no automation package. It always
creates a temporary profile, leaves the sandbox enabled, serves only the
`/copilot-kubuntu-desktop-kit/` prefix over loopback HTTP, and stops the browser
and server in its cleanup path. It never runs the desktop backend or connects
to an existing browser profile, browser window or desktop session.

Checks cover the release commands and pinned source paths; metadata and
structured data; local assets and anchors; parsed accessibility semantics;
320–1920px reflow in light and dark schemes; text contrast; full keyboard
navigation; exact clipboard output, denial and missing-API fallbacks; no-JS
content; reduced motion; forced colors; print; and nested-path 404 behavior.

These are automated checks, not screen-reader certification or a claim of
testing physical mobile devices, every browser, or any KDE desktop workflow.
Public GitHub links are not fetched by the repeatable browser suite.

## Social image

`assets/social.svg` is the original authored source. Its raster counterpart
is included because social crawlers do not consistently accept SVG images.
To regenerate the 1200 × 630 PNG from the SVG using the isolated browser:

```sh
node site/tests/browser.mjs --render-social
node --test site/tests/static.test.mjs
```

The render uses installed system fonts. No private screen content, generated
image model or third-party media is used. Both social metadata formats include
alternate text. The wide and narrow architecture SVGs also have titles and
descriptions, with an HTML image alternative.

`assets/kcalc-result.png` is a separate, user-approved capture of a disposable
KCalc window after the packaged desktop agent completed the semantic AT-SPI
task. Its exact bytes are allowlisted by the publication test after visual
privacy review. It is not a recording or evidence of portal-pointer delivery.
The browser check scrolls this lazy-loaded image into view before decoding
images for layout checks.

## Deployment boundary

The parent-owned Pages workflow should upload the contents of `site/`, with
`index.html` at the artifact root, to:

`https://arjith.github.io/copilot-kubuntu-desktop-kit/`

No custom domain, root-host configuration, Node installation on Pages or
additional build is needed. Assets are project-relative. The 404 page is
self-contained so nested missing URLs cannot break its styling or home link.
There are no symlinks. Test sources and this note are safe to include in the
static artifact; they are not linked from the site or listed in the sitemap.

The canonical URL, sitemap and social metadata intentionally use the exact
HTTPS deployment URL. If it changes, update those references and the
corresponding static tests together.

**Robots limitation:** crawlers only treat an origin-root `/robots.txt` as
authoritative. The included project-path `robots.txt` documents the intended
policy and sitemap location but cannot set policy for `arjith.github.io`.
The home page has `index, follow` metadata; the 404 page has `noindex, follow`.
These directives and the sitemap do not promise indexing or ranking.

No deployment, commit, push, external posting or repository configuration is
performed by the site or its checks.
