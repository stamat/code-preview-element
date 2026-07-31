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

## [1.0.0] - 2026-07-31

### Fixed

- **A sample's own `<script>` stopped running after the first edit.** A js demo keeps its
  script inside the sample, because the element takes one fence — and an edit was applied
  to the loaded frame with `innerHTML`, which never executes a script it inserts. The
  first paint went through `srcdoc` and worked, so the demo only died from the first
  keystroke on: still rendered, still correctly marked up, nothing in the console. Only
  `js` urls and the `reload` attribute forced the rebuild; the sample's own script was
  not looked at.

  A sample containing a `<script>` now rebuilds the frame rather than patching it, on the
  same longer debounce a `js` url already used. Nothing to change in a page: samples with
  no script in them still patch, and keep their scroll position and stylesheets as before.

- **A sample's own elements never came alive** when `js` pointed at a custom element
  bundle — which is most of what this element is for. The scripts went into `<head>`
  undeferred, so `customElements.define` ran *before* the body was parsed and the parser
  then upgraded each element the instant it opened its tag, with none of its light-DOM
  children there yet. Every element that reads its own children on connect found nothing
  and bailed.

  The failure was silent and total: the sample rendered, the markup was right, the
  stylesheet applied, nothing appeared in the console — and not one element was wired.
  Native behaviour inside the sample (a `<details>` toggling) still worked, which is
  exactly what made it read as "the preview is a bit unresponsive" rather than as a bug.
  It also made the options panel look broken from the outside: its knobs were writing
  correctly the whole time, into elements that were not listening.

  `js` scripts now carry `defer`, which is what these libraries already document as their
  requirement, and which keeps execution order across several urls. An inline `<script>`
  in the sample is untouched — that one is the author's, and it is in body where they
  wrote it.

- **The editable code block was a keyboard trap.** Tab indents in there, which left a
  keyboard user who tabbed in with nothing to press — [WCAG 2.1.2 Level
  A](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html), and the one
  failure here with no workaround from the outside. **Esc now hands Tab back**: the next
  Tab moves focus, and leaving the block re-arms it, so tab-to-indent is unchanged for
  anyone who does not need to leave by keyboard.

- **The editor says what it is.** CodeJar leaves a block that is editable and nothing
  else, so the element now adds `role="textbox"`, `aria-multiline="true"`,
  `aria-keyshortcuts="Escape"` and an `aria-label` naming the language. An `aria-label`
  or `aria-labelledby` already on the block is left alone.

- **The focus ring follows focus.** It hung off `code-preview:focus-within`, so clicking
  a width button or a tab lit the code block up instead. It is now on the block.

- **Switching tab no longer drops focus on the floor.** Setting `tab` from a script or
  from markup while the reader was inside the pane being hidden left focus on an element
  that was about to disappear, which the browser answers by moving it to the body — the
  next Tab starts again at the top of the page, with the whole document between a screen
  reader and the widget it was just in. Focus now moves to the tab being switched to,
  which is where clicking or arrowing to that tab had already left it. Focus outside the
  pane is not touched, so the frame's own load — which calls the same code — cannot yank a
  reader into the tab strip.

- **A keystroke that changed nothing reloaded the preview.** CodeJar reports an update on
  every keyup, not only the ones that edited the text — the arrows, Tab, every modifier,
  and now the Esc this element asks people to press — and each one rebuilt the frame a
  quarter-second later for a sample that had not moved. That reload throws away everything
  live inside the preview: a script's state, and the focus a keyboard user had put on a
  control in there. So an accessible component could not be demonstrated in its own
  preview — Tab into the frame, focus a control, and it vanished under you a moment later.
  The frame is now rendered only when the source it would render has actually changed.

  Editing the sample still rebuilds, and still costs whatever was live in there. That one
  is the sample changing, which is the point.

- **An Escape pressed outside the editor released its Tab.** The listener sits on the
  element, so an Escape in an options-panel field or on a width button also flipped the
  editor's tab-to-indent off and rewrote the keyboard hint — about an editor the reader
  was not in. Leaving the editor re-armed it, so no trap could result, but the hint could
  claim a state that was no longer true. Only an Escape from inside the editor counts now.

- **A failed manifest fetch was cached for the life of the page.** One transient network
  error cost every preview sharing that url its options panel until a reload. A rejected
  fetch is now evicted from the cache, so a preview mounting later tries again.

- **An attribute `<select>` now says its default.** Its empty option reads
  `default (quiet)` when the manifest documents one, the same way a custom property's
  already did — it used to say only `default`, with the manifest's answer dropped.

- **A duplicate width in `viewport-widths` no longer renders a duplicate button.**

- **The colour swatch treats an alpha it cannot parse as unknown** — the swatch stays
  where it was, like every other value it cannot be sure about, rather than showing the
  colour as opaque.

- **An attribute name containing a `.` is matched literally** when the options panel
  reads or rewrites the sample, rather than as a regex wildcard.

- **Publishing runs the tests.** CI runs on branches and pull requests, not on tags, so
  the publish workflow ran none at all — a tag cut from a broken commit would have
  published untested code. `npm test` now runs before `npm publish`.

### Added

- **The options panel lists what the sample fires.** A third group, `Events`, built from
  the manifest's `events[]` — every documented event is listed whether or not it has fired,
  with a count and the last `detail` beside it once it has. An element whose whole API is a
  `CustomEvent` was otherwise a preview that appears to do nothing when you click it.

  The rows are `<div class="code-preview-event">` with a
  `<span class="code-preview-event-value">` readout, and the `<fieldset>` around them
  carries `aria-live="polite"`. Nothing here is a control, so nothing writes to the sample
  or to the frame's stylesheet.

  The listeners go on the frame's **document**, in the capture phase: capture is what hears
  an event that does not bubble — most of them, dispatched on the element itself — and the
  document is what survives the `innerHTML` patch a keystroke does. A rebuilt frame is a
  new document with a new sample in it, so its counts start again from `—`.

  They are also attached whichever tab is open, which is a behaviour change inside the
  panel: the controls used to be re-read only when the Options tab was activated, and an
  event fired while the reader is looking at the code still has to be counted.

- **The event readout is highlighted, and says when it changed.** A `detail` is now written
  as spans carrying highlight.js's own token classes — `hljs-attr` for a key, `hljs-string`,
  `hljs-number`, `hljs-literal`, `hljs-tag` for a node — so a docs page that already ships a
  syntax theme colours it with no extra css. `dist/code-preview-hljs.css` scopes its rules to
  `:is(pre code, .code-preview-event-value)` for the same reason; a theme of your own that
  targeted the `pre code` form still wins on any real code block. The readout's text is
  unchanged, so anything reading `textContent` reads what it read before.

  A `detail` is one line and stays one line: a string over 42 characters is clipped, a
  function is `ƒ`, anything nested is `{…}` and an array is its length. The sample's own
  console is where a full payload is read.

  The readout is now two cells — `<span class="code-preview-event-count">` and
  `<span class="code-preview-event-detail">` inside the same
  `.code-preview-event-value` — and the row no longer borrows the knobs' column grid. A
  knob's second column is a field wide, which put a two-character count an inch from the
  name it belongs to; the name takes what it needs and the count follows it, with the
  `detail`s lined up in a column of their own.

- **An event says so over the preview.** The name of a documented event appears in a
  `<div class="code-preview-toast">` inside `.code-preview-viewport` for about a second and a
  half whenever the sample fires one — that is where the reader is looking when they click
  the thing that fires it. One box per element, reused, and opacity only, so there is
  nothing in it for `prefers-reduced-motion` to object to. **`no-toast`** on the element
  turns it off, for a sample that fires on every `pointermove`; the panel still counts.

  `.code-preview-viewport` is now `position: relative` — it is the toast's containing block,
  so the notice lands on the sample rather than on the toolbar. A sample tall enough to
  scroll (past `max-height: 70vh`) scrolls its toast with it, until anchor positioning is
  available everywhere.

  The row also flashes when its count goes up, and if the event landed in the hidden pane
  the element takes `data-event-fired` until the Options tab is opened — the stylesheet
  draws that as a dot on the tab.

- **A keyboard hint**, `<p class="code-preview-hint">`, appended to the element for every
  editable sample: `Press Esc, then Tab, to leave the editor`, becoming `Tab now leaves
  the editor` once Esc has been pressed. It is the `aria-describedby` of the editor and a
  `role="status"` live region, so the same sentence reaches a screen reader and the
  screen. The stylesheet keeps it invisible until the block has focus and positions it
  absolutely, so it costs no layout — which is why `code-preview` is now
  `position: relative`.

  An editable block gets `padding-block-end: var(--code-preview-hint-space, 2.25rem)` to
  hold the room the hint sits in. Reserved from upgrade rather than added on focus:
  growing the block at the moment someone clicks into it would shift the page under their
  cursor. Set `--code-preview-hint-space` to the block's normal padding to turn the
  reservation off.

  It is a child of the element rather than of the code block, because a copy-button script
  that reads the block's `innerText` would otherwise put the sentence on the clipboard —
  so the tab strip hides it itself, with `display: none` on any tab but `code`. Left
  showing it would be a live region describing an editor the reader has switched away
  from.

### Changed

- **The colour swatch is the colour.** `<input type="color">` draws the value as a square
  inset inside its own padding and border, which at 1.75rem is more chrome than colour, and
  the chrome was already drawn around it by this stylesheet. The value now fills the button
  (`::-webkit-color-swatch-wrapper`, `::-webkit-color-swatch`, `::-moz-color-swatch`, one
  rule each — a selector list containing a pseudo-element the engine does not know is a
  list it drops whole).

  That only pays if the colour is true, so the swatch now follows the field: the value is
  resolved by setting it on the swatch and reading the computed colour back, which is what
  turns a named colour, `hsl(…)` or a `color-mix(…)` into channels. A value nothing can
  resolve leaves the swatch where it was, rather than claiming a colour the sample does not
  have.

- **`transparent` is drawn as a crossed-out square**, a thin red cross over black, the way
  a mac shows no colour. There is no transparent in a colour picker: `<input type="color">`
  holds an opaque `#rrggbb` and nothing else, and the newer `alpha` attribute only buys
  `#rrggbbaa` — still not the keyword, which is a real default in a themeable library. The
  text field remains the control; the swatch stops lying about it. The class is
  `.code-preview-swatch.is-transparent`, and the cross takes `--danger`.

- **The `<select>` caret is drawn rather than left to the platform**, which put it hard
  against the field's right edge with 0.375rem of padding on the other side. It now sits at
  the same 0.375rem, and takes `currentColor` — two gradients making one triangle, so there
  is no data uri to recolour per theme and no extra element.

- **Group titles are uppercased** — `Attributes`, `Custom properties`, `Events`. Only the
  legends: the names below them are verbatim attribute and custom-property names, where
  case is meaning.

## [0.2.0] - 2026-07-31

### Added

- **An options panel**, as a third bundle you opt into —
  `dist/code-preview-options.min.js`, 7KB, carrying no copy of the element. A `manifest`
  attribute pointing at a
  [`custom-elements.json`](https://github.com/webcomponents/custom-elements-manifest) turns on
  a second tab beside the code, with controls generated from it: `attributes[]` become
  attribute knobs, `cssProperties[]` become custom-property knobs, and each control's kind
  comes from the type or Houdini syntax the manifest already declares.

  ```html
  <script src="dist/code-preview-options.min.js"></script>

  <code-preview manifest="dist/custom-elements.json" tab="options"> … </code-preview>
  ```

  The two halves of the panel write to two different places, which is the one real design
  decision in it. An **attribute** belongs to an element in the sample, so its knob rewrites
  the code block — spliced into the opening tag with a regex rather than parsed and
  re-serialized, because on a documentation page the markup *is* the documentation and
  reformatting it on the first knob turn is not acceptable. Edit it back by hand and the
  controls re-read the source next time the tab is opened. A **custom property** is not part
  of the sample at all: it goes into one `<style>` appended last in the frame's head, whose
  selector is the element's own tag and never `:root` — and that rule is printed at the
  bottom of the panel to be copied, which is worth more than the knobs are.

  An untouched knob writes nothing at all. Defaults are placeholders, not values, so
  emptying a control is how you reset it.

  **No manifest, no tabs** — a page that does not use one renders byte-identically to before,
  and a page that never loads the bundle pays nothing for the attribute existing.

### Changed

- **The DOM of the bar** above the preview. `viewport-widths` used to put `role="group"` on
  `.code-preview-bar` itself; the buttons now sit in a `.code-preview-widths` group inside it,
  and the bar is a plain strip that the options panel's tab list shares. One bar means one
  border, one set of top corners and one height to reserve however many things end up in it.
  Only affects CSS or scripts that targeted `.code-preview-bar[role="group"]` directly.
- `code-preview:not(:defined)[viewport-widths]::before` is now
  `code-preview:not(:defined):is([viewport-widths], [manifest])::before`, since `manifest`
  puts a bar there too. `--code-preview-options-height` (default `12rem`) joins
  `--code-preview-height` and `--code-preview-bar-height`, and matters only with
  `tab="options"` — the one case where upgrading hides something, so the code block is hidden
  from the start and the panel's space held instead.

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

[Unreleased]: https://github.com/stamat/code-preview-element/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/stamat/code-preview-element/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/stamat/code-preview-element/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/stamat/code-preview-element/releases/tag/v0.1.0
