# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**How to use it:** land changes under `## [Unreleased]`, grouped under _Added_, _Changed_,
_Deprecated_, _Removed_, _Fixed_ or _Security_. Releasing is `script/publish` — it renames that
heading to the version and date, starts a fresh `[Unreleased]`, and uses the entry it cut as the
GitHub release body, so what you write here is what the release says. Write entries for
the person upgrading, not for the person who wrote the code — and because this is a custom
element, call out anything that changes the **DOM the element produces**, the **CSS an author
may already be targeting**, or the **contents of the preview iframe**, since none of the three
shows up in a function signature.

## [Unreleased]

### Fixed

- **The console no longer opens a seam under the code block.** The strip took `0.25rem`
  of padding on all four sides, and the top quarter of that landed exactly on the join
  the 3.0.0 layout works to hide — no top border, shared corners, two boxes meant to read
  as one — so a gap appeared right where the block was supposed to run into the strip. It
  is `padding: 0 0 0.25rem` now; the space below the last line stays.

  **CSS an author may be targeting:** `code-preview .code-preview-console`. A sheet that
  restores symmetric padding gets the seam back. The asymmetry is now stated in the
  comment above the rule so it does not read as an oversight worth tidying.

- **Upgrading no longer shifts the page twice while the manifest loads.** The pre-upgrade
  reservation counted the code strip and the options panel, then upgrade dropped it whole
  — but with `manifest` both boxes wait on a fetch, so the page rose by their height and
  came back down when they landed. Measured on a consumer's docs: upgrade at 224ms,
  arrival at 274ms, a layout shift each way, on every load. Three CSS rules now carry the
  reservation across the gap: the strip's row is held as top margin on the first pane
  until the tablist exists, the `tab="options"` panel's box is held by an `::after` until
  the panel exists, and an editable block wears `--code-preview-hint-space` from the
  start instead of growing by it when the editor attaches. The costs run the honest way:
  a page that names a `manifest` and never loads the options bundle keeps the held strip
  row for good, and a pane read-only by fence word wears the editor padding for the wait
  and gives it back.

## [3.0.0] - 2026-08-03

### Changed

- **The console strip moved from under the preview to under the code block, and the error
  banner has folded into it.** Two boxes said the same kind of thing in two places, and
  neither was where the reader was looking: the lines are logged by the js in the pane, so
  they belong against the pane, the way a devtools console sits under the source above it.
  The block gives up its bottom corners to the strip and the two read as one box.

  An uncaught throw is now a line in that strip rather than a banner below it — in sequence
  with everything the sample logged on the way there, which is what a broken sample is read
  from. It keeps everything the banner had: tinted from `--code-preview-danger`, a ⚠ glyph,
  and `role="alert"`, so it is still announced assertively out of a region (`role="log"`)
  that is otherwise polite. A logged `console.error` is red but is not an alert — the sample
  asked for that one.

  **`no-console` no longer silences errors.** It is the answer for a demo that logs on every
  frame, and no sample is asked to swallow the error that stopped it; the strip is built for
  that one line if it has to be.

  **DOM the element produces:** `div.code-preview-console[role="log"]` is now the last child
  of the host, under every pane. `p.code-preview-error` and `data-error` on the host are
  gone — an uncaught throw is a `p.code-preview-console-line.is-error[role="alert"]` in the
  strip. `--code-preview-tail` is new and written by the element: the strip's measured
  height, which the Edit and Run buttons in the block's corner are lifted clear by.

  **CSS an author may be targeting:** `code-preview .code-preview-error` and
  `code-preview[data-error]` style nothing now. The corner radii are keyed off
  `code-preview:has(> .code-preview-console:not([hidden]))` instead.

  **Contents of the preview iframe:** a second inline `<script>` in head, beside the console
  hook, listening for `error` and forwarding it as a `code-preview-error` CustomEvent on the
  iframe. It is written whether or not `no-console` is set.

### Fixed

- **A sample that threw during its first parse reported nothing.** The js pane is inlined as
  a `type="module"`, so a top-level throw is over before the frame's `load` event — which is
  where the host attached its `error` listener, so the one error the reader who just broke
  their edit needed to see was the one error never shown. The capture is now an inline
  script first in the frame's head, armed before anything can run. A sample that brings its
  own whole document owns its head and gets no hook, so that case is still heard on the
  frame's window as before.

- **Safari: a preview could vibrate by one pixel, forever.** WebKit lays an iframe's
  innards out a hair differently against each integral height it is given, so the height
  `measure` wrote could move the next measurement across the `Math.ceil` boundary — and
  the resize report that write fired triggered the next measure, so the two heights took
  turns indefinitely. Two defenses, either sufficient: a height-only resize report from
  the wrapper is now recognized as our own write coming back and does not re-measure
  (the wrapper is watched for its *width*, which is what an emulated viewport scales
  against), and the frame height write carries one pixel of dead-band — a real change is
  bigger, and a preview one pixel short is invisible where a vibrating one is not.
  Chrome and Firefox quantized the two measurements identically and never flapped;
  nothing changes there.

## [2.0.0] - 2026-08-03

### Added

- **The package ships a `custom-elements.json` of its own, at `dist/custom-elements.json`,
  under the `customElements` key and as the `code-preview-element/custom-elements.json`
  export.** The element has always read manifests; now it has
  one. It is generated in the build by
  [`@custom-elements-manifest/analyzer`](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/)
  from a JSDoc block on the `CodePreview` class — the same route the README asks of anyone
  writing a sample for the options panel, so the advice and the practice are now the same
  thing.

  Nothing about the element changes. What it buys is on the tooling side: attribute and
  custom-property autocomplete in editors that read the manifest, and the option of
  pointing this element's own `manifest` at it. Every documented attribute and every
  `--code-preview-*` custom property in the README is in there, with its type and default.
  `--code-preview-tail` deliberately is not: the element writes it, the page does not, and
  a knob for it would be overwritten by the next measurement.

- **A sample can be several fences — markup, its css, its js — and each becomes a tab.**
  Until now the element took one `<pre><code>`, so a demo that needed a stylesheet or a
  script had to bury both inside the html as `<style>` and `<script>`: unreadable as a
  sample, uneditable as css, and impossible to copy the interesting half out of. Write
  them as the separate blocks they are and the element pairs them up:

  ```html
  <code-preview css="dist/lib.css" js="dist/lib.js">
    <pre><code class="language-html">&lt;aside class="drawer"&gt;…&lt;/aside&gt;</code></pre>
    <pre><code class="language-css">.drawer { transition: transform 0.2s; }</code></pre>
    <pre><code class="language-js">document.querySelector(".drawer");</code></pre>
  </code-preview>
  ```

  The languages are read off the `language-*` class a site generator already writes, so
  there is no new markup vocabulary — three fences in the markdown, three tabs on the page.
  Anything the frame cannot run (a `scss` block beside the css it compiles to) still gets a
  tab, read-only. So does any fence beside a sample that is a whole document — it owns its
  head and body, so there is nowhere in it to write the pane — and a second fence in a
  language that already has one, under a numbered tab (`CSS2`), since the frame is built
  from the first.

  **The js pane is inlined as `<script type="module">`**, and that is not about scoping. A
  classic inline script runs while the parser is still going, before the deferred bundles
  in `js` have defined anything — so a sample that writes a property on a custom element
  gets one that has not upgraded, and the write installs an own property that shadows the
  accessor the class is about to bring. It fails silently and for good. A module is
  deferred, and deferred scripts run in document order, so the pane runs after every url in
  `js`.

  **A css edit no longer reloads the frame.** The pane is one `<style>` in a head this
  element built, so an edit is a write to its text: nothing reparses, and the sample keeps
  the state a rebuild would cost it — a script's variables, an open menu, the control the
  reader had focused. Markup edits patch or reload exactly as before, and a js pane always
  reloads, for the reason `js` urls always have.

  **DOM it produces:** each pane's box gets `role="tabpanel"`, `data-pane="<name>"` and
  `hidden="until-found"` while it is not showing; the strip is a `role="tablist"` of
  `.code-preview-tab` buttons in the existing `.code-preview-bar`. The markup pane is named
  `code`, not `html` — so `tab="code"` still means the sample, and every page already using
  this element is untouched. **One fence still produces exactly what it did:** no strip, no
  `role`, no `hidden`, byte for byte.

  **CSS an author may be targeting:** the rule that collapsed the hidden pane was
  `code-preview.is-tabbed[tab="options"] > :is(pre, .code-wrap)` and is now keyed off
  `[data-pane][hidden]`, which is one rule for two panes or for five. The editor's keyboard
  hint is hidden by `code-preview.is-tabbed:not(.is-code-pane)` rather than by naming the
  options tab.

- **`no-edit` can lock some panes and not others.** It was all-or-nothing, which for a
  three-fence sample meant choosing between an editable stylesheet you did not want touched
  and no editing at all. Two ways to say it, and they add up:

  ```html
  <code-preview no-edit="css js">…</code-preview>
  ```

  ```html
  <pre no-edit><code class="language-css">.drawer { transition: transform 0.2s; }</code></pre>
  ```

  Panes are named by what their tab says (`html`, `css`, `js`) or by the pane's own name
  (`code` for the markup one). In markdown the per-fence form needs no new vocabulary if
  your generator turns a bare word in the info string into a class on the block — ```` ```css
  no-edit ```` — since that class is what the element reads. Bare `no-edit` is unchanged:
  the whole sample stays read-only.

  **CSS an author may be targeting:** `code-preview.is-code-pane` now means the pane
  showing has an *editor* in it, not merely code — a pane locked by either form no longer
  gets the class, so the buttons and the keyboard hint are not left on a block nobody can
  type into.
  Unchanged for a sample that locks nothing.

- **Editing is opt-in: a block takes no keystrokes until you open it.** A block that can be
  edited is not editable at rest — no `contenteditable`, nothing announced as a text field.
  An **Edit** button in its bottom-left corner opens it, <kbd>Enter</kbd> on the focused
  block does the same, and <kbd>Esc</kbd> or a second press on the button closes it again.

  The reason is Tab. Tab has to indent inside a code editor, so it cannot also be the way
  out — which makes an always-editable block a keyboard trap sitting in a docs page, hit by
  every reader tabbing past a sample they never meant to type into, with the way out being
  a key they are told about only once they are already stuck. Opting in removes the trap
  rather than signposting it, and the <kbd>Esc</kbd> advice is then owed only to someone who
  asked to be there. The block keeps a tab stop at rest so that <kbd>Enter</kbd> has
  somewhere to be pressed: a keyboard user is offered the editor where they already are.

  Closing the editor is also a second way to apply a js edit, alongside **Run**.

  **DOM the element produces:** a `div.code-preview-actions` (`role="group"`) as a child of
  the host — not of the strip, and not of the code block — holding
  `button.code-preview-action`: `.code-preview-edit` (with `aria-pressed`) and
  `.code-preview-run`. Each holds an `aria-hidden` glyph and a `<span>` with the word for it
  — **Edit**, **Run** — and that word is the accessible name, so neither carries an
  `aria-label` or a `title`. The `<pre>` of an editable pane now carries `tabindex="0"` and an
  `aria-describedby` pointing at `p.code-preview-hint`; `role="textbox"`,
  `aria-multiline`, `aria-keyshortcuts` and `contenteditable` are written on the `<code>`
  only while the editor is open, and removed when it closes.

  Both buttons are on by default and neither is built on a sample with no editor in it.
  `no-actions` takes them away, spelled the way `no-edit` is: bare for both, or naming the
  one to drop (`no-actions="run"`). Dropping **Run** from a js sample leaves
  <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> and closing the editor as the ways to
  apply an edit — both are keyed to what the sample is, not to whether the button exists.

  The <kbd>Esc</kbd> hint is not drawn under `(hover: none) and (pointer: coarse)`: it names
  a key a touch device does not have, and the trap it warns about is a keyboard trap. Its
  `aria-describedby` is unaffected.

  **CSS an author may be targeting:** `code-preview.is-editing` is new and says the editor
  is open. `.is-editable` still says the element has one to open. The `--code-preview-hint-space`
  bottom padding on an editable block is now the room the buttons sit in as well as the hint.

- **No copy button of the element's own, and a docs theme's is left alone.** Copying a code
  block is something a docs theme already does, on every block on the page rather than only
  on the samples. The element's own copy button is gone and so is the rule that hid the
  theme's.

  **CSS an author may be targeting:** `code-preview :is(pre, .code-wrap) > button { display: none }`
  no longer ships. A theme that was relying on the element to hide its button gets it back;
  the `display: revert` override some pages added for exactly that is now a no-op and can go.
  `.code-preview-copy`, `.code-preview-note`, `.code-preview-icon-copy` and
  `.code-preview-icon-check` no longer exist, and `no-actions="copy"` names nothing.

- **The sample's console, under the preview.** `console.log`, `info`, `warn`, `error` and
  `debug` from inside the frame land in a strip directly under the preview — on screen
  while the reader types the js that causes them, which a tab of its own could not be.
  The strip appears with the first line and costs nothing before it: no box, no reserved
  height. It holds the last hundred lines, follows the tail unless the reader has
  scrolled up to read, and starts over when the frame rebuilds — a new document is a new
  run, the same bargain the event counts make. A patched frame keeps its document and so
  keeps its log. Lines still reach the browser's own console.

  The capture is an inline script written first into the frame's head, ahead of every
  deferred `js` url and of the sample's own module — so a top-level `console.log` on the
  first run is caught, which wrapping the console from the host on the frame's load event
  would miss: load fires after the sample has already said the interesting thing. Each
  call is forwarded to the host as a `code-preview-log` CustomEvent on the iframe.
  Values are formatted without `instanceof` — the frame is another realm, where its
  `Element` and `Error` are different classes — so an element prints as `<tag>`, an
  error as `name: message`, the rest as JSON where JSON can say it.

  `no-console` on the element turns it off, hook and all, for a sample that logs on
  every frame. A whole-document sample owns its head and gets no hook. Uncaught errors
  stay the error banner's job.

  **DOM the element produces:** `div.code-preview-console[role="log"]` between the
  viewport and whatever sits below, once something has logged; `p.code-preview-console-line`
  per line, with `.is-warn`/`.is-error` by level. `--code-preview-console-height`
  (default `10rem`) caps the strip.

  **Contents of the preview iframe:** one inline `<script>` first in head, rewiring the
  console. A sample asserting on its document's first script will see this one.

### Changed

- **The text that is code waits for a Run button; everything else applies as you type.**
  The 600ms reload debounce is gone — it was never the right tool. Markup and css are
  inert and keep the 250ms live path. Two edits are not: the js pane's own text, and
  markup carrying an inline `<script>` — a single-fence js demo is exactly that. Those
  apply on **Run** or on <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> and not
  before, because a `srcdoc` frame is same-origin and shares the page's event loop:
  half-typed js, `while (true` with the closing paren still to come, hangs the whole tab
  and not just the preview. A longer debounce only decides how long the reader gets first.

  A sample that runs js it is *not* typing — a `js` asset, the `reload` attribute — still
  follows the typing: the rebuild re-runs that js from its own file, complete and valid,
  never mid-statement. What the rebuild costs is the sample's live state, which is the
  price of a preview that moves while the reader types markup; where nothing ran at all,
  markup edits patch and cost nothing, as before.

  Run is always live and has no edited state. It re-runs the sample from whatever the
  blocks say when it is pressed, so pressing it on a sample nobody has touched still starts
  the demo over — the counter back to zero, the animation from the top. A button that greys
  itself out between edits is one whose job the reader has to keep track of. And it appears
  only where edits wait on it: on the js tab, or on a lone fence carrying its own
  `<script>`. Everywhere else it is not shown — edits there apply themselves, and a button
  with nothing to do is one the reader has to wonder about. It is also a plain button now,
  the same size and color as Edit: appearing at all is its statement, and the accent fill
  it had on the js tab said that twice. Edit's pressed fill stays — that one is a toggle.

  A whole-document sample is rebuilt rather than patched, as it always was, but that is a
  different question: with no script in it there is nothing to execute, so it keeps the
  live typing. Turning an options panel knob is exempt and applies immediately, as it did.

  **DOM the element produces:** `button.code-preview-run` only on samples with an editor
  whose text is code — a js pane, or markup with an inline `<script>` — and it carries no
  disabled state of any kind. A sample that merely reloads (`js` asset, `reload`) builds
  no Run button at all; <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> still restarts
  it from the editor.

  **CSS an author may be targeting:** editable blocks gained
  `aria-keyshortcuts="Escape Control+Enter Meta+Enter"`, where it was `Escape` alone.
  `.is-js-pane` now means "the pane showing is one whose edits wait on Run" — the js tab,
  or a single fence carrying its own `<script>` — and is what *shows* the Run button;
  without it the button is `display: none`. The accent rules on
  `.is-js-pane .code-preview-run` are gone.

- **The tab strip moved above the code, and the toolbar split in two.** The tabs and the
  new actions belong to the code — a tab strip has to sit against the thing it labels to
  read as its label — so they are now in their own strip between the preview and the panes.
  The width switcher stays above the preview it re-renders. Both are still
  `.code-preview-bar`; which one is which is decided by the side of the viewport they are
  on, and the stylesheet already had the rules for both.

  **DOM the element produces:** two `.code-preview-bar` strips where there was one, each
  built only when it has something to hold — the code's when the tabs are coming, the
  preview's with `viewport-widths`. A single-fence sample has neither. `toolbar` still means
  the preview's strip; the new `codeBar` is the code's.

  **CSS an author may be targeting:** the height reserved before upgrade counts each strip
  the markup can be seen to be asking for, through a new internal `--code-preview-bars`.
  `--code-preview-bar-height` is unchanged and still the knob. `.code-preview-widths` no
  longer carries `margin-inline-start: auto` — it is alone in its strip now.

- **The tab strip moved from the options bundle into the element.** It was built by
  `code-preview-options.js`, which could only ever know about two panes. `addPane()` is the
  contract now, and the options panel is one caller of it — so the roving tabindex, the
  APG arrow keys, the `beforematch` handling and the focus rescue are written once and are
  the same for two panes or five. No markup changes; the options panel behaves as it did.

- **The edit mode follows the reader across tabs.** Switching panes used to close the
  editor outright; now the reader is editing the sample, not one block, so moving from the
  markup tab to the css tab closes the hidden pane's editor and opens the new pane's own
  in the same gesture. Focus stays where the switch put it — on the tab a click pressed,
  or mid-flight along the strip on arrow keys — rather than being pulled into the block.
  A pane with no editor (the options panel, a read-only fence) still closes the mode, and
  <kbd>Esc</kbd> and the Edit toggle still end it from anywhere.

- **Read-only panes no longer reserve the button strip.** The bottom padding that makes
  room for Edit, Run and the keyboard hint (`--code-preview-hint-space`) is only held on
  blocks that have an editor behind the button — a `no-edit` sample, a `scss` fence or a
  numbered duplicate shows none of that furniture, and reserving a strip of nothing at
  the bottom of it was dead space.

  **CSS an author may be targeting:** the padding rule is now keyed off
  `.is-editable:not(.is-tabbed)` for the lone block and `.is-code-pane` in a strip,
  instead of `.is-editable` alone.

### Fixed

- **A script error is announced, not just drawn.** The error banner was CSS generated
  content (`::after` reading `data-error`), which changes silently — a screen-reader user
  who typed the edit that threw heard nothing. It is a real element with `role="alert"`
  now, so the moment it appears is a moment assistive tech reports; the message is also
  selectable at last, and an error message is the one string worth copying into a search.

  **DOM the element produces:** `p.code-preview-error[role="alert"]`, appended on the
  first error and kept (hidden) between errors. `data-error` on the host stays, and the
  corner-radius rules still key off it — but a stylesheet targeting
  `code-preview[data-error]::after` now styles nothing.

- **The frame's document declares its language and a title.** `buildSrcdoc` copies the
  host page's `<html lang>` into the frame — a screen reader picks its voice per
  document, and a frame that does not say is read in the user's default — and writes a
  `<title>Preview</title>` alongside the charset. A sample that brings its own document
  is passed through untouched, as before.

  **Contents of the preview iframe:** `<html lang="…">` whenever the host page has one,
  and a `<title>` in head.

- **Focus and state survive Windows High Contrast.** The focus ring on the code block is
  a box-shadow, which forced-colors mode strips — and the rule that kept host themes'
  outlines off the block used `outline: none`, leaving a focused block with no indicator
  at all. It is `outline: 2px solid transparent` now: invisible in normal rendering,
  repainted in a system color under forced colors. Selected tabs, pressed width buttons
  and the open Edit toggle likewise restate themselves in `SelectedItem`/`SelectedItemText`
  under `forced-colors: active`, where the border and fill they speak through flatten away.

- **The keyboard stop on a sample names itself.** The focusable `pre` was a generic
  element with no role and no name — a screen reader landing on it had nothing to
  announce. Where it is not already the tabpanel (the single-fence page, or a `pre`
  inside a copy-button script's wrapper) it is `role="group"` with the sample's label
  now. The label the `code` block used to carry permanently moved with it: `code` is an
  ARIA role that prohibits naming, so the block is labelled only while it is a
  `role="textbox"` — the one moment naming it is allowed. A markup-supplied `aria-label`
  on either element still wins.

  **DOM the element produces:** `role="group"` and `aria-label` on the editable block's
  `pre` outside tab strips; `aria-label` on the `code` block only while editing.

- **Every preview frame has its own name.** All iframes were `title="Rendered preview"`,
  so a screen reader's frame list on a page of twenty samples distinguished none of them.
  The title is derived per sample now — `Rendered html sample`, or the block's own
  `aria-label` when the markup gave one.

- **Knob descriptions reach the keyboard.** A manifest entry's `description` sat only on
  the row as a `title` tooltip, which never follows focus; it is on the control itself
  too now, where a screen reader reads it as the field's description.

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
  undeferred, so `customElements.define` ran _before_ the body was parsed and the parser
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

- **The color swatch treats an alpha it cannot parse as unknown** — the swatch stays
  where it was, like every other value it cannot be sure about, rather than showing the
  color as opaque.

- **An attribute name containing a `.` is matched literally** when the options panel
  reads or rewrites the sample, rather than as a regex wildcard.

- **Publishing runs the tests.** CI runs on branches and pull requests, not on tags, so
  the publish workflow ran none at all — a tag cut from a broken commit would have
  published untested code. `npm test` now runs before `npm publish`.

### Added

- **Every color and font the stylesheet reads now has a `--code-preview-` name.**
  `--code-preview-bg`, `--code-preview-fg`, `--code-preview-fg-muted`,
  `--code-preview-border`, `--code-preview-accent`, `--code-preview-danger`,
  `--code-preview-radius` and `--code-preview-font-mono` join the four
  `--code-preview-*` sizing properties that were already there, so nothing about the
  element's look is reachable except through its own namespace.

  Nothing to change in a page. Each one falls back to the unprefixed name it used to
  read before its default — `var(--code-preview-bg, var(--bg, #fff))` — so a host page
  themed through `--border`, `--bg`, `--accent`, `--fg`, `--fg-muted`, `--danger`,
  `--radius` or `--font-mono` looks exactly as it did. The prefixed name is only the
  first lookup, which is what makes it possible to move this element alone without
  moving the page around it:

  ```css
  code-preview {
    --code-preview-bg: #161b22;
  }
  ```

  `dist/code-preview-hljs.css` reads `--code-preview-fg-muted` the same way, so the
  optional syntax theme moves with the element rather than with the page.

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
  syntax theme colors it with no extra css. `dist/code-preview-hljs.css` scopes its rules to
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

  The row also flashes when its count goes up.

- **A keyboard hint**, `<p class="code-preview-hint">`, appended to the element for every
  editable sample: `Press Esc, then Tab, to leave the editor`, becoming `Tab now leaves
the editor` once Esc has been pressed. It is the `aria-describedby` of the editor and a
  `role="status"` live region, so the same sentence reaches a screen reader and the
  screen. The stylesheet keeps it invisible until the block has focus and positions it
  absolutely, so it costs no layout — which is why `code-preview` is now
  `position: relative`.

  It shows for a keyboard and not for a pointer, because it is advice about a key and
  someone who clicked in can click back out. The element sets **`.is-key-focus`** on
  itself when focus arrives on a keypress rather than a click, so the rule is
  `code-preview.is-key-focus:has(pre:focus-within)`; it is dropped again on `focusout`,
  and added late if someone who clicked in starts typing, since from that keystroke on
  they are in the same trap. Not `:focus-visible` — a `contenteditable` matches that on a
  mouse click too, because a browser assumes anything taking text input wants its focus
  ring — so intent is tracked with a `keydown`/`pointerdown` pair per document, added once
  however many editors a page has. A screen reader is unaffected either way:
  `aria-describedby` is read on arrival however focus got there.

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

- **The options panel's three groups collapse.** Attributes, Custom properties and Events
  each open on arrival and can be closed, so a panel documenting all three is no longer
  taller than the sample above it.

  Each group is a `<details class="code-preview-group" open>` with a `<summary>`, where
  the panel that shipped in 0.2.0 used a `<fieldset>` with a `<legend>`. A stylesheet of
  your own targeting `.code-preview-group > legend` wants `> summary` instead;
  `.code-preview-group` and `.code-preview-knobs` are unchanged. Nothing is lost naming
  the set — `<details>` maps to `role="group"` and its summary is that group's accessible
  name, exactly as the legend was — and the disclosure is the browser's, so there is no
  new ARIA and no new key handling. The Events group is still the `aria-live` region;
  closed, it announces nothing, which is the bargain the hidden pane already made — the
  toast is what says an event fired.

- **The tabs, the width buttons and the group summaries have a hover state**, which none
  of them had: a wash tinted from `--fg-muted` plus the full `--fg` text color, behind
  `@media (hover: hover)` so a tap does not leave it stuck on. A wash rather than the
  color alone, because the color is already how a tab says it is the selected one.

- **Spelling is en-US throughout** — `color`, not `colour`, in the docs, the comments and
  this file. No identifier, class or attribute changed: the API was already `--color-*`
  and `<input type="color">`.

- **The color swatch is the color.** `<input type="color">` draws the value as a square
  inset inside its own padding and border, which at 1.75rem is more chrome than color, and
  the chrome was already drawn around it by this stylesheet. The value now fills the button
  (`::-webkit-color-swatch-wrapper`, `::-webkit-color-swatch`, `::-moz-color-swatch`, one
  rule each — a selector list containing a pseudo-element the engine does not know is a
  list it drops whole).

  That only pays if the color is true, so the swatch now follows the field: the value is
  resolved by setting it on the swatch and reading the computed color back, which is what
  turns a named color, `hsl(…)` or a `color-mix(…)` into channels. A value nothing can
  resolve leaves the swatch where it was, rather than claiming a color the sample does not
  have.

- **`transparent` is drawn as a crossed-out square**, a thin red cross over black, the way
  a mac shows no color. There is no transparent in a color picker: `<input type="color">`
  holds an opaque `#rrggbb` and nothing else, and the newer `alpha` attribute only buys
  `#rrggbbaa` — still not the keyword, which is a real default in a themeable library. The
  text field remains the control; the swatch stops lying about it. The class is
  `.code-preview-swatch.is-transparent`, and the cross takes `--danger`.

- **The `<select>` caret is drawn rather than left to the platform**, which put it hard
  against the field's right edge with 0.375rem of padding on the other side. It now sits at
  the same 0.375rem, and takes `currentColor` — two gradients making one triangle, so there
  is no data uri to recolor per theme and no extra element.

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

  <code-preview manifest="dist/custom-elements.json" tab="options">
    …
  </code-preview>
  ```

  The two halves of the panel write to two different places, which is the one real design
  decision in it. An **attribute** belongs to an element in the sample, so its knob rewrites
  the code block — spliced into the opening tag with a regex rather than parsed and
  re-serialized, because on a documentation page the markup _is_ the documentation and
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
  `dist/code-preview-hljs.css` (`./theme`) is optional syntax colors, kept separate so a site
  with its own theme is not overridden.

- TypeScript declarations for both builds.

[Unreleased]: https://github.com/stamat/code-preview-element/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/stamat/code-preview-element/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/stamat/code-preview-element/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/stamat/code-preview-element/releases/tag/v0.1.0
