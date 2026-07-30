# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**How to use it:** land changes under `## [Unreleased]`, grouped under _Added_, _Changed_,
_Deprecated_, _Removed_, _Fixed_ or _Security_. Releasing means renaming that heading to the
version and date, running `npm version`, and starting a fresh `[Unreleased]`. Write entries for
the person upgrading, not for the person who wrote the code — and because this is a custom
element, call out anything that changes the **DOM the element produces**, the **CSS an author
may already be targeting**, or the **contents of the preview iframe**, since none of the three
shows up in a function signature.

## [Unreleased]

## [0.1.0]

Initial release.

### Added

- `<code-preview>` — wraps a `<pre><code>` block in a live preview: an iframe above the code,
  the code editable through [CodeJar](https://medv.io/codejar/), edits applied as you type.
  The sample in the code block is the only source of truth, so a documented example and what
  it actually renders cannot drift.

  ```html
  <code-preview css="dist/my-library.css">
    <pre><code class="language-html">&lt;button class="btn"&gt;Hi&lt;/button&gt;</code></pre>
  </code-preview>
  ```

  **DOM it produces:** the element stays in the light DOM. The existing `<pre><code>` is kept
  and made editable in place; an `<iframe>` is inserted before it, and — only when
  `viewport-widths` is set — a row of `<button>`s above that. The host page's syntax theme and
  prose styles therefore still apply to the code block, and `[data-theme]` on the host page is
  mirrored into the frame so a demo goes dark with the docs around it.

  **The frame:** built through `srcdoc`, with a doctype, so the sample renders in standards
  mode. Samples are parsed to decide what belongs in `head` and what in `body`; a sample that
  brings its own `<html>` document owns its head entirely. `css` and `js` take
  whitespace-separated urls, `head` replaces the default `body{margin:0;padding:1rem}`.

  **Attributes:** `css`, `js`, `head`, `theme-attribute`, `viewport-width`, `viewport-widths`,
  `no-edit`, `reload`. See the README for what each one does.

  **Highlighting:** a plain block is highlighted on upgrade; a block that already carries hljs
  markup is left exactly as it is, so a site generator's build-time highlighting is not redone
  at runtime.

- Two builds. `dist/code-preview.js` is the element and CodeJar with no highlighter, for a docs
  site that already loads highlight.js; `dist/code-preview-hljs.js` bundles highlight.js for a
  page that has none. Exposed as `code-preview-element` and `code-preview-element/hljs`.

- Shipped stylesheets. `dist/code-preview.css` (`./style`) is the layout the element needs;
  `dist/code-preview-hljs.css` (`./theme`) is optional syntax colours, kept separate so a site
  with its own theme is not overridden.

- TypeScript declarations for both builds.

[Unreleased]: https://github.com/stamat/code-preview-element/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/stamat/code-preview-element/releases/tag/v0.1.0
