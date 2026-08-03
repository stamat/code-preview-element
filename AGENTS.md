# code-preview-element — agent notes

A custom element that turns a `<pre><code>` already on the page into a live, editable
sample rendered in an iframe above it.

My standing conventions — principles, boundaries, the feature checklist, commit and
changelog rules — live in `~/.claude/CLAUDE.md` and apply here without being repeated. This
file carries only what is specific to this repo.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for what belongs in the project and what a pull
request needs.

## Commands

```bash
script/server    # poops dev server with live reload, serves the demo site
script/build     # builds dist/ and _site/
script/test      # lint, typecheck, then node --test
script/lint      # eslint (the authority; CI runs it)
npm run manifest # regenerate dist/custom-elements.json from the JSDoc
```

## Layout

- **`src/element.ts` is the element** — class, panes, frame, editor, console strip.
  Everything else in `src/` is an entry point around it.
- **Three entry points, three bundles.** `code-preview.ts` (default; expects the page to
  bring a highlighter), `code-preview-hljs.ts` (highlight.js bundled in),
  `code-preview-options.ts` (the manifest-driven options panel, on top of either).
- **`src/code-preview-options.ts` imports the element with `import type` on purpose.** It
  is a separate bundle; a value import would put a second copy of the whole element inside
  it. What it needs at runtime arrives through the `host` it is handed.
- **`site/` is the demo page and the test bed.** It uses nearly every feature, so
  `script/build` failing is a real signal. `site/index.md` is the page; the loose files
  beside it (`sample.css`, `sample.js`, `strings-sr.js`, `self.css`) are loaded *inside*
  preview frames, not by the page.
- **`dist/` and `_site/` are generated and gitignored.**
- **`dist/custom-elements.json` is generated** from the JSDoc block on the `CodePreview`
  class. Edit the JSDoc, never the JSON — and the demo page points its own `manifest` at
  that file, so a JSDoc change surfaces there.

## Design decisions specific to this element

- **The sample is the only source of truth.** The preview renders the exact text of the
  code block. Anything that lets the two drift is the bug.
- **It wraps what the page already has.** A block the generator highlighted is left alone;
  if the script never loads, the page is still a plain code block.
- **Light DOM, deliberately.** The block keeps the host page's syntax theme and prose
  styles, and the host's `[data-theme]` is mirrored into the frame. A shadow root would
  cost both.
- **Ask before** changing the DOM the element produces, changing or removing a
  `--code-preview-*` custom property, or changing what goes into the frame. None of the
  three shows up in a function signature, and all three are things a docs page may already
  target.

## Non-obvious rules

- **Scripts in the frame are deferred and run in document order.** `buildSrcdoc` emits
  every url in `js` with `defer`, so first in the list is first to run. Load-bearing: a
  custom-element bundle running before the body is parsed finds no light-DOM children and
  bails silently.
- **Labels are written once, when the block is built.** A block already in the markup is
  built the instant `define()` runs, so `CodePreview.strings` must be in place before that —
  which is why the entry files read `globalThis.codePreviewStrings` on the way past.
  Anything else read at first paint carries the same constraint.
- **`npm run manifest` runs twice in a build, on purpose.** poops runs `exec` last, but the
  copy into `_site` that hands the manifest to the demo page runs well before that — on a
  fresh checkout it would copy a file that does not exist yet. `package.json` runs it ahead
  of poops; `poops.json`'s `exec` runs it again so a watch rebuild picks up a JSDoc edit.
- **`no-edit` has two spellings and both are read.** An attribute on the element or the
  `<pre>`, and a bare word in a markdown fence's info string, which arrives as a class on
  the block. The class is read once when the pane is registered, because highlight.js
  rewrites `className` wholesale and would drop it.
- **The frame is same-origin with no `sandbox`.** That is what buys height measurement and
  the theme write. It also means a sample can reach the page — right for prose you wrote,
  wrong for samples arriving in a URL.
- **jsdom cannot test sizing or the patch-on-edit path.** No layout engine, and it fires an
  iframe's load event without rendering the srcdoc. Those need a real browser:
  `script/server` and the demo site. `test/code-preview.test.js`'s header says the rest.
- **The markup's own `aria-label` always wins.** A `<pre>` or `<code>` carrying one keeps
  it. Never add a default that overrides markup.
- **A new file that demo frames load must go in `poops.json`'s copy list.** Relative urls
  in `css`/`js` resolve against the host page, so the frame reaches them at the same path —
  but only once they are in `_site`.
