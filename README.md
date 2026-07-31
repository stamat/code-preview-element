# 🪟 code-preview-element [![npm version](https://img.shields.io/npm/v/code-preview-element)](https://www.npmjs.com/package/code-preview-element) [![ci](https://img.shields.io/github/actions/workflow/status/stamat/code-preview-element/ci.yml?branch=main&label=ci)](https://github.com/stamat/code-preview-element/actions/workflows/ci.yml) [![license mit](https://img.shields.io/badge/license-MIT-green)](https://github.com/stamat/code-preview-element/blob/main/LICENSE)

A code block that renders itself. `<code-preview>` wraps a highlighted
`<pre><code>` in a live preview: an iframe above the code, the code editable, edits
applied as you type. The sample is the only source of truth, so a documented example
and what it actually does cannot drift.

**[Live demo →](https://stamat.github.io/code-preview-element/)** — the element,
demonstrated by the element.

- [Install](#install)
- [How it works](#how-it-works)
- [Why this one](#why-this-one)
- [Attributes](#attributes)
- [Responsive samples](#responsive-samples)
- [Wiring it up](#wiring-it-up)
- [Editing](#editing)
- [Several fences, several tabs](#several-fences-several-tabs)
- [The options panel](#the-options-panel) — [Where a knob writes](#where-a-knob-writes), [Controls](#controls)
- [Three builds](#three-builds)
- [From JavaScript](#from-javascript)
- [Styling](#styling) — [Reserved height](#reserved-height)
- [Known limits](#known-limits)
- [Development](#development)

## Install

```sh
npm install code-preview-element
```

A stylesheet and a script, and any `<pre><code>` you wrap is live:

```html
<link
  rel="stylesheet"
  href="node_modules/code-preview-element/dist/code-preview.min.css"
/>
<script src="node_modules/code-preview-element/dist/code-preview.min.js"></script>

<code-preview css="dist/my-library.css">
  <pre><code class="language-html">&lt;button class="btn"&gt;Hi&lt;/button&gt;</code></pre>
</code-preview>
```

That build is 11KB and brings no highlighter, because it expects the page to already
have one — a docs site loading a second copy of highlight.js is 42KB spent on nothing.
If yours has none, swap in `dist/code-preview-hljs.min.js`, which carries its own. See
[Three builds](#three-builds).

Or skip the install and take the same two files from a CDN:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/code-preview-element@1/dist/code-preview.min.css"
/>
<script src="https://cdn.jsdelivr.net/npm/code-preview-element@1/dist/code-preview.min.js"></script>
```

From a bundler, import for the side effect — every entry defines the element itself,
so there is nothing to call:

```js
import "code-preview-element"; // default build; uses window.hljs if the page has one
import "code-preview-element/hljs"; // the same element, highlight.js bundled in
import "code-preview-element/options"; // the options panel, on top of either
import "code-preview-element/style"; // required css
import "code-preview-element/theme"; // optional highlight.js token colors
```

Import one of the first two, not both. The last two are stylesheets, so they need a
bundler that accepts a css import; `dist/code-preview.css` and
`dist/code-preview-hljs.css` are the same files for anything that would rather link
them.

## How it works

The sample can arrive plain, as above — the element highlights it on upgrade. A block
that is already highlighted (a fence a site generator ran hljs over at build time) is
left exactly as it is: re-running hljs would be work for an identical result, and any
version skew between build and runtime shows up as the whole block reshuffling on
load.

An iframe, rather than markup inlined into the page, because a docs page cannot host
a sample of a CSS library safely: tag-level rules for `html`, `body` or `*` restyle
the docs around it, `@layer base` rules lose to the theme, and scoping the stylesheet
under a wrapper selector takes `:root` with it and kills the custom properties. The
frame is the isolation — and for a CSS library it is also the honest demo, a real
page loading the real stylesheet.

## Why this one

Live-code components are not a new idea. What is specific here:

**It wraps the code block you already have.** Every other tool in this space asks you
to author demos in its own format — a JS function, a multi-file manifest, a custom
fence. This takes the `<pre><code>` your site generator already emitted, hljs classes
and all, and upgrades it in place. Nothing to port, and the page is a plain code block
if the script never loads.

**Emulated viewport widths.** `viewport-width` gives the frame a genuine CSS width and
scales the result down to fit, so a sample's desktop media queries actually apply
inside a 700px docs column. `viewport-widths` turns that into a row of buttons.

**It lives in the light DOM.** The code block keeps the host page's syntax theme and
prose styles instead of being sealed off from them by a shadow root, and the host
page's `[data-theme]` is mirrored into the frame, so a demo goes dark with the docs
around it. A tool that sandboxes its preview onto a separate origin structurally
cannot do that second part.

**Two script tags and no build step.** 11KB on a docs site that already ships
highlight.js, 53KB standalone — see [Three builds](#three-builds). No service worker, no
bundler config, no origin to serve demo files from.

Reach for something else when the shape of the problem is different:

| Instead                                                                | When                                                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [playground-elements](https://github.com/google/playground-elements)   | multi-file samples, TypeScript compiled in the browser, bare `import`s resolved from npm. Costs a service worker and a few hundred KB. |
| [Sandpack](https://sandpack.codesandbox.io/)                           | demoing React components rather than markup and CSS.                                                                                   |
| [@mdjs/mdjs-preview](https://www.npmjs.com/package/@mdjs/mdjs-preview) | you are already on the mdjs/rocket toolchain and write demos as JS functions.                                                          |
| StackBlitz / CodePen embeds                                            | the reader should be able to fork the sample and keep it.                                                                              |

## Attributes

| Attribute         | Effect                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `css`             | whitespace-separated stylesheet urls for the frame                                |
| `js`              | whitespace-separated script urls for the frame                                    |
| `head`            | extra head html, replacing the default `body{margin:0;padding:1rem}`              |
| `theme-attribute` | attribute the host page's `[data-theme]` is mirrored onto, inside the frame       |
| `viewport-width`  | render at this css width and scale it down to fit                                 |
| `viewport-widths` | whitespace-separated widths to offer as buttons                                   |
| `manifest`        | url of a `custom-elements.json` — its presence turns the options panel on         |
| `manifest-tag`    | which declaration in it to drive. Default: the first declared tag the sample uses |
| `tab`             | which pane is open, and the live state: `code` (default), `css`, `js`, `options`  |
| `no-edit`         | render the preview, leave the code read-only                                      |
| `no-toast`        | no event name over the preview — the panel still counts what fires                |
| `no-shrink`       | never size the preview below its tallest measurement                              |
| `reload`          | always rebuild the frame on edit, never patch it                                  |

Relative urls in `css`/`js` resolve against the **host page** — that is what a
`srcdoc` document inherits as its base url — so a page two directories down needs
`../../dist/my-library.css`, exactly as it would in its own markup.

`head` replaces the frame's default head, which is nothing but
`<style>body{margin:0;padding:1rem}</style>` — the padding that keeps a sample off the
frame's edge. Replacing means replacing, so re-state it if you still want it:

```html
<code-preview
  head="&lt;style&gt;body{margin:0;padding:2rem;font-family:system-ui}&lt;/style&gt;"
>
  <pre><code class="language-html">&lt;p&gt;Roomier, and not Times New Roman.&lt;/p&gt;</code></pre>
</code-preview>
```

It is the escape hatch for what `css` and `js` cannot say — a `<meta>`, a font `<link>`,
an import map. It lands after the `css` links and before the `js` scripts, so a rule
here outranks one from a stylesheet at equal specificity. A sample that is already a
whole `<html>` document is used verbatim, and all three attributes are ignored.

## Responsive samples

A preview frame in a text column is a ~700px viewport, and media queries inside it
read that width honestly — so a responsive sample only ever demonstrates its narrow
layout. `viewport-width` fixes that by giving the frame a real width and scaling the
rendered result down to fit:

```html
<code-preview css="dist/my-library.css" viewport-width="1024"></code-preview>
```

CSS `zoom` is not an alternative — it shrinks the rendering without changing the
viewport the media queries are asked about. This does change it: the frame genuinely
is 1024px wide, then `transform: scale()` makes it fit, and a `ResizeObserver`
recomputes the factor when the column resizes. A container already that wide is left
alone rather than scaled up.

Keep the emulated width modest — 1024 rather than 1600. Everything in the frame
shrinks by the same factor, text included, and a preview nobody can read is not a
better preview.

To let a reader compare breakpoints instead of picking one for them, add
`viewport-widths`:

```html
<code-preview
  css="dist/my-library.css"
  viewport-widths="375 768 1024"
></code-preview>
```

That renders a row of buttons — `Fit`, then one per width — which do nothing but set
`viewport-width` on the element. The attribute stays the single source of truth, so a
hand-written attribute, a click and a script all take the same path, and combining
the two attributes just decides which button starts out pressed. `Fit` removes the
attribute: natural width, no scaling.

## Wiring it up

The element reads the code out of its own child `<pre><code>`, so anything that
produces a highlighted code block can feed it. Three shapes that has taken:

**By hand**, as above — fine for a handful of samples.

**From a build step**, for docs generated from markdown. Have the generator wrap
already-highlighted fences after the markup stage, which is also where the per-page
url prefix is known. A marker in the markdown keeps it opt-in:

```js
// <!-- demo --> followed by an html fence, in the built html
const marker =
  /<!-- demo -->\s*(<pre><code class="hljs language-html">[\s\S]*?<\/code><\/pre>)/g;
html = html.replace(
  marker,
  (_, fence) =>
    `<!-- demo --><code-preview css="${prefix}dist/my-library.css">${fence}</code-preview>`,
);
```

Leave the marker in the output and put the element _between_ it and the fence: the
pattern then no longer matches, so a re-run is a no-op — which matters for watch
modes that recompile only the pages that changed and then post-process all of them.

**From highlight.js itself**, if the page highlights at runtime — docsify, a
hand-written page, anything without a markup build to hook into. hljs takes plugins,
and `after:highlightElement` fires once per block with the `<code>` in hand:

```js
hljs.addPlugin({
  "after:highlightElement": ({ el }) => {
    // Opt in per block, and never wrap twice. Whichever signal your generator can
    // put on a fence works — a class here, because it survives the most of them.
    if (!el.classList.contains("demo") || el.closest("code-preview")) return;

    const pre = el.parentElement;
    const preview = document.createElement("code-preview");
    preview.setAttribute("css", "/dist/my-library.css");

    // Assembled off-DOM and inserted whole. The element upgrades the instant it is
    // connected and looks for its `<pre><code>` right then, so a wrapper connected
    // empty and filled afterwards never builds a preview at all.
    const anchor = document.createComment("code-preview");
    pre.replaceWith(anchor);
    preview.appendChild(pre);
    anchor.replaceWith(preview);
  },
});
hljs.highlightAll();
```

Register the plugin before `highlightAll`; the element's own script tag can come in
either order. Two things are easier here than in a build step: the `css` url is
resolved by the browser, so one absolute path serves every page at any depth, and the
opt-in check is a predicate rather than a regex over html — `data-` attributes, the
language, the sample's own content, whatever the block already carries.

Opting in is the whole difficulty, and it is a markdown problem rather than an hljs
one: a docs page is full of html fences that are not demos, so _every_ html fence is
the wrong default. What gets a class onto a fence depends on the generator —
`markdown-it-attrs` takes ` ```html {.demo} `, several others pass the info string
through as extra classes, and a plugin-less setup has the marker-comment route above.

## Editing

The editor is [CodeJar](https://github.com/antonmedv/codejar), which is in both bundles
— it is 2KB, and it is the reason the block can be typed into at all. Recoloring on
every keystroke means replacing the block's innerHTML, which drops the caret and shreds
the undo stack; restoring both through IME composition and Firefox's contenteditable
quirks is why that library exists. A bare `contenteditable` would not have been less
code here, only worse.

highlight.js is pinned to v11 to match what static site generators emit at build
time. If runtime and build-time output disagree, the block visibly reshuffles the
first time it is focused.

Edits apply on a debounce with no Run button — 250ms when the frame can be patched,
600ms when it has to reload. Patching keeps stylesheets loaded and the scroll
position; a reload is forced by `js` assets, a js pane, the `reload` attribute, an
inline `<script>` in the sample, or a sample that is a whole document. All of those are
the same trap from different ends: `innerHTML` never executes scripts it inserts, and a
script that already ran does not re-run against markup replacing what it initialised.

An edit to the [css pane](#several-fences-several-tabs) is neither: the pane is one
`<style>` in a head this element built, so it is a write to that element's text. Nothing
reloads and nothing reparses, which means the sample keeps everything a rebuild would
cost it — a script's variables, an open menu, the control that had focus.

## Several fences, several tabs

A sample that needs a stylesheet or a script is written as the separate blocks it is,
and each one becomes a tab:

```html
<code-preview css="dist/lib.css" js="dist/lib.js">
  <pre><code class="language-html">&lt;aside class="drawer"&gt;…&lt;/aside&gt;</code></pre>
  <pre><code class="language-css">.drawer { transition: transform 0.2s; }</code></pre>
  <pre><code class="language-js">document.querySelector(".drawer");</code></pre>
</code-preview>
```

There is nothing to configure. The language comes off the `language-*` class your site
generator already writes on the block, `html` is the sample, `css` goes in the frame's
head and `js` at the end of its body. A block in anything else — `scss` beside the css
it compiles to, a `json` config the sample reads — still gets a tab, read-only, because
there is nothing in the frame to type it into.

| Pane   | Tab    | Where it lands                                        |
| ------ | ------ | ----------------------------------------------------- |
| `html` | `HTML` | the frame's `<body>`                                   |
| `css`  | `CSS`  | `<style>` last in `<head>`, so it wins over `css` urls |
| `js`   | `JS`   | `<script type="module">` last in `<body>`              |

The js pane is a module, and that is not about scoping. A classic inline script runs
while the parser is still going — before the deferred bundles from `js` have defined
anything — so a sample that writes a property on a custom element gets one that has not
upgraded yet, and the write installs an own property that shadows the accessor the class
is about to bring. It fails silently and permanently. Modules are deferred and deferred
scripts run in document order, so the pane runs after every url in `js`.

One fence is still one code block: no tab strip, no roles, nothing hidden. The markup
pane is named `code` rather than `html`, so `tab="code"` keeps meaning the sample.

Two more panes are read-only for the same nowhere-to-type reason: any fence beside a
sample that is a whole document — it owns its head and body, so the element has no place
in it to write a stylesheet or a script — and a second fence in a language that already
has a pane, which gets a numbered tab (`CSS2`) while the frame is built from the first.

## The options panel

A second tab beside the code, with controls generated from a
[Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest). It is
opt-in — one more script tag, and nothing in either element bundle:

```html
<script src="node_modules/code-preview-element/dist/code-preview-hljs.min.js"></script>
<script src="node_modules/code-preview-element/dist/code-preview-options.min.js"></script>

<code-preview
  css="dist/switch.css dist/switch-theme.css"
  js="dist/switch.js"
  manifest="dist/custom-elements.json"
  tab="options"
>
  <pre><code class="language-html">&lt;switch-elemental&gt;…&lt;/switch-elemental&gt;</code></pre>
</code-preview>
```

`custom-elements.json` is not a format invented here — it is the one the ecosystem already
has, generated from your JSDoc by
[`@custom-elements-manifest/analyzer`](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/),
and it already carries everything a panel needs. `cssProperties[].syntax` is the
[Houdini syntax string](https://developer.mozilla.org/en-US/docs/Web/CSS/@property/syntax)
(`<color>`, `<time>`, `ease | linear`), which is exactly a control type — so the CSS side is
already typed and nobody has to agree with us about how. Shipping one also buys editor
autocomplete and a Storybook args table, which a format of ours would not.

**No manifest, no tabs.** Every page that does not use one renders byte-identically.

### Where a knob writes

The element's premise is that the code block's text is the single source of truth. A knob
that quietly mutated the live DOM inside the frame would break it — the code tab would then
describe something that is not what is rendered. So the two kinds of knob get two different
answers:

| Manifest field    | Control from                          | Writes to                                           |
| ----------------- | ------------------------------------- | --------------------------------------------------- |
| `attributes[]`    | `type.text` — boolean, number, union  | **the sample source**, spliced into its opening tag |
| `cssProperties[]` | `syntax` — `<color>`, `<time>`, union | **a stylesheet in the frame**, plus a rule to copy  |
| `events[]`        | nothing — it is a readout             | **nothing.** It counts what the sample fires        |

An attribute belongs to an element in the sample, so its knob rewrites the code above and
the code tab keeps telling the truth. The splice is a regex over the opening tag rather
than a parse-and-serialize: on a documentation page the markup _is_ the documentation, and
reformatting it on the first knob turn is not acceptable. Edit an attribute back by hand
and the controls re-read it the next time the Options tab is opened.

A custom property is not part of the sample — a consumer setting one does it in their own
stylesheet, so the panel does the same: one `<style>` appended last in the frame's head,
holding one rule whose selector is the element's own tag. Never `:root`; a property set on
an element beats one inherited from an ancestor, so a themed element would ignore it. That
rule is printed at the bottom of the panel to be copied, which is worth more than the knobs
are.

An event is not a knob at all. Everything in `events[]` is listed whether or not it has
fired, and counted as it does, with the last `detail` beside the count — an element whose
whole API is a `CustomEvent` is otherwise a preview that appears to do nothing when you
click it. The listeners go on the frame's _document_, in the capture phase: capture is what
hears an event that does not bubble, which is most of them, and the document is what
survives the `innerHTML` patch a keystroke does. A rebuilt frame is a new document with a
new sample in it, so the counts start again.

**An untouched knob writes nothing.** No attribute, no declaration. The manifest's default
is a placeholder, not a value, so emptying a control is how you reset it.

### Controls

| Manifest says              | Control                                        |
| -------------------------- | ---------------------------------------------- |
| attribute, `boolean`       | checkbox — on writes it bare, off removes it   |
| attribute, `'a' \| 'b'`    | `<select>`, plus an empty option meaning unset |
| attribute, `number`        | `<input type="number">`                        |
| cssProperty, `<color>`     | text field **plus** a swatch beside it         |
| cssProperty, `a \| b \| c` | `<select>`                                     |
| anything else, or nothing  | `<input type="text">`                          |

`<input type="color">` is deliberately never the color control on its own. `currentcolor`,
`Canvas`, `transparent` and `color-mix(in srgb, currentcolor 22%, transparent)` are all real
defaults in a themeable library, a native color input can hold none of them, and swapping
one out for a hex value is how a knob silently destroys a theme that was correct. The text
field is the control; the picker sits beside it and writes into it.

The swatch does follow the field, though, because it fills the whole button and a button
showing black beside a field that says `oklch(…)` is a lie the size of the control. The
value is resolved by setting it on the swatch and reading the computed color back, which
is what turns a named color, `hsl(…)` or a `color-mix(…)` into channels. Two cases cannot
be shown as a color, and neither is faked: **`transparent` is drawn as a thin red cross
over a black square**, the way a mac shows no color — there is no transparent in a picker,
and the `alpha` attribute newer browsers accept only buys `#rrggbbaa`, not the keyword —
and anything the engine cannot resolve leaves the swatch where it was.

A property the manifest documents without a `default` falls back to what the frame computes
for it, so an undocumented default still shows something true.

Anything the manifest cannot express goes in one namespaced key that every other tool
ignores — the CEM schema sets no `additionalProperties: false`:

```jsonc
{
  "name": "--switch-elemental-duration",
  "syntax": "<time>",
  "default": "250ms",
  "x-code-preview": { "control": "range", "min": 0, "max": 1000, "step": 25 },
}
```

`control` overrides the table above, `hidden` drops the entry entirely — though the better
place to leave a knob out is the manifest itself, by not documenting a property that is
`calc()`-derived from the others.

## Three builds

Same element in the first two, and the only difference is whether highlight.js rides along:

| Bundle                             |      |                                                                      |
| ---------------------------------- | ---- | -------------------------------------------------------------------- |
| `dist/code-preview.min.js`         | 11KB | the default. No highlighter; uses `window.hljs` if the page has one. |
| `dist/code-preview-hljs.min.js`    | 53KB | highlight.js bundled in, for a page with none.                       |
| `dist/code-preview-options.min.js` | 10KB | the options panel, on top of either. Carries no copy of the element. |

The default reads the global per call rather than once at startup, so the order of the
two script tags does not matter:

```html
<script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/highlight.min.js"></script>
<script src="node_modules/code-preview-element/dist/code-preview.min.js"></script>
```

A page that highlighted its fences at build time and ships no runtime hljs is the case
the default cannot cover: the preview and the editor still work, the block keeps
whatever color the generator baked in, and typing stops recoloring it. That page
wants the `-hljs` build — it is the whole install in one tag, and the reason to reach
for it is the _editor_, not the first paint.

The only thing the default build asks of that global is one method, so something other
than highlight.js can stand in — Prism, Shiki's browser build, your own — as long as it
is in place before the element registers:

```js
window.hljs = {
  highlightElement(element) {
    /* recolor it, leave textContent alone */
  },
};
```

The block arrives carrying `class="hljs language-<lang>"`, and the sample is its
`textContent` — a highlighter that rewrites that text breaks the preview it feeds.
`CodePreview.highlighter` is the same hook one level down, typed as `Highlighter`, for
code that registers the element itself rather than loading a bundle that does.

## From JavaScript

An element in the markup needs none of this — the bundles define it and it upgrades on
its own. What is exported is the seam the options panel itself is built on, so a second
panel, a different highlighter or a test can use the same one:

| Export                                 |                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `define()`                             | registers `code-preview`, a no-op if it already is                             |
| `CodePreview`                          | the class, for `instanceof` and for the two statics below                      |
| `CodePreview.highlighter`              | `(element, language) => void` — recolor a block, leave its text alone          |
| `CodePreview.options`                  | `(host) => void`, called once per element with a `manifest`. The panel sets it |
| `hljsHighlighter(hljs)`                | builds a `Highlighter` from any hljs-shaped object                             |
| `buildSrcdoc(html, { css, js, head })` | the frame document as a string, without an element                             |
| `scaleToFit(available, emulated)`      | the scale factor `viewport-width` applies                                      |

And per instance, the surface the panel drives:

| Member               |                                                                               |
| -------------------- | ----------------------------------------------------------------------------- |
| `source`                        | the markup pane's text. Assigning it retypes the block and re-renders         |
| `frameDocument`                 | the frame's document, once it holds one of ours — `undefined` until           |
| `setFrameStyle(css)`            | one stylesheet appended last in the frame's head                              |
| `toolbar`                       | the bar above the preview, created on first read                              |
| `codePanel`                     | the element's own child that holds the markup pane's block                    |
| `addPane(name, panel[, code, language])` | register a pane and its tab. The options bundle is one caller       |
| `onPanelSync`                   | assign a callback: "re-read what you are showing", on `tab` and on frame load |

```js
import { CodePreview } from "code-preview-element";

document.querySelector("code-preview").source = "<p>Set from a script.</p>";
```

Everything above is typed; `dist/*.d.ts` ships in the package.

## Styling

Two stylesheets ship in `dist`, both plain CSS, minified and not:

| File                         |                                                      |
| ---------------------------- | ---------------------------------------------------- |
| `dist/code-preview.css`      | required — the layout the element needs to work      |
| `dist/code-preview-hljs.css` | optional — highlight.js token colors, light and dark |

The second is separate on purpose: a docs site that already ships a syntax theme
should not have it overridden. Link it only if the code blocks would otherwise be
monochrome. It is scoped to `pre code`, so it cannot reach code blocks elsewhere on
the page. It shares a name with `dist/code-preview-hljs.js` and nothing else — one is
hljs's colors, the other is hljs itself. Under the package exports they are `./theme`
and `./hljs`.

The required sheet is the minimum plus as little taste as possible. Every color is a
custom property with a fallback, and every one of them is namespaced:

| Property                   | Default                    | What it colors                      |
| -------------------------- | -------------------------- | ----------------------------------- |
| `--code-preview-bg`        | `#fff`                     | bar, frame, options panel, controls |
| `--code-preview-fg`        | `inherit`                  | the selected tab, a hovered one     |
| `--code-preview-fg-muted`  | `#656d76`                  | tabs, buttons, labels, the hint     |
| `--code-preview-border`    | `#d8d8d8`                  | every border in the element          |
| `--code-preview-accent`    | `#0969da`                  | focus rings, the tooltip, checkboxes and ranges |
| `--code-preview-danger`    | `#cf222e`                  | the error banner and the transparent-swatch cross |
| `--code-preview-radius`    | `6px`                      | the outer corners; controls take half |
| `--code-preview-font-mono` | `ui-monospace, monospace`  | every bit of text in the chrome     |

`--code-preview-danger` is only the error banner, the strip below the code block that
appears when a sample's own script throws.

Each one falls back to its unprefixed name before its default — `--code-preview-bg` to
`--bg` to `#fff` — so a host page that already defines `--border`, `--bg`, `--accent`,
`--fg`, `--fg-muted`, `--danger`, `--radius` or `--font-mono` still gets its own look
for free, and a page that wants to move this element alone sets the prefixed name:

```css
:root {
  --bg: #0d1117;
} /* themes the page, and this element with it */

code-preview {
  --code-preview-bg: #161b22;
} /* moves this element only */
```

The element and the code block are meant to read as one object, so the preview has no
bottom border (the code block below brings its own) and the block inside gets no
margin. If a gap survives anyway, a host theme is outranking the package: its
`.prose :is(figure, .code-wrap)` is two classes against the package's one class and
one type. Win it back from the host side:

```css
.prose code-preview > :is(pre, .code-wrap) {
  margin: 0;
}
```

`max-height` on the frame is load-bearing, not taste: the element sizes the frame
from its content, so a sample measured in viewport units would grow the frame, which
grows the viewport, which grows the sample. The cap makes that converge.

### Reserved height

A preview's real height is its sample's, and nothing knows that until the frame has
rendered. Every preview would therefore land after first paint and push whatever is
below it down — the layout shift. So space is held for it before the element has
upgraded and before the frame has loaded, from one variable:

```css
code-preview {
  --code-preview-height: 8rem;
} /* the default */
```

`--code-preview-bar-height` (default `2.25rem`) is the same for the bar above the
preview, reserved alongside it whenever `viewport-widths` or `manifest` will put one
there.

`--code-preview-options-height` (default `12rem`) is the third, and only matters with
`tab="options"` — that is the one case where upgrading _hides_ something, since the code
block is visible until the panel exists to replace it. The stylesheet hides it from the
start and holds room for the panel instead. It is a floor rather than a height, so it also
covers the gap between the element upgrading and the manifest arriving.

The default is a guess centred on real samples rather than a round number — it
measured lowest across the demo page. Set it per element wherever the height is
actually known, and there is nothing left to guess:

```html
<code-preview style="--code-preview-height: 320px"> … </code-preview>
```

Measured on the demo page, headless Chrome at 1200×900: CLS `0.0285` with the
reservation at `4rem`, `0.0167` at `12rem`, `0.0022` at the `8rem` default.

A second shift is possible after that one: a re-measure that comes back _shorter_
than the last — a webfont or an image landing late, a narrower column scaling the
frame down — pulls the page back up. `no-shrink` holds the tallest measurement
instead, trading some empty space below a sample for a preview that never moves what
is under it:

```html
<code-preview css="dist/my-library.css" no-shrink> … </code-preview>
```

It is per element and off by default, because a sample whose height genuinely varies
— an edit that deletes half the markup, a demo that toggles a panel — should follow
its content down. A new source or a new `viewport-width` resets the remembered height
either way.

Caching measured heights in `localStorage` was tried and removed. It bought nothing
over a well-centred reservation, and a key can only name a stylesheet's url, not its
contents — so editing a sample's css left every returning reader holding a remembered
height that was quietly wrong.

## Known limits

- **HTML samples only.** Editing css or js separately means a run of fences per demo
  plus a tab strip. Not built.
- **No `sandbox`.** Demo js runs and can reach the parent, same-origin. Fine for
  author-written docs plus self-typed edits — self-XSS only, nothing persisted or
  shared. Sharing a sample through a url would need `sandbox="allow-scripts"`, which
  goes cross-origin-opaque and kills both the height measurement and the theme write,
  forcing a postMessage protocol.
- **Demo code is never built.** It goes into a classic `<script>` verbatim: no
  TypeScript, no JSX, no bare imports, no top-level `await`.
- **Previews need JS.** Without it the page is a plain code block.
- **Sizing and the patch-on-edit path have no automated test.** jsdom has no layout
  and fires an iframe's `load` without rendering the `srcdoc`, so a test of either
  would assert fiction. `npm run dev` and the site are the check.

## Development

```
npm run dev        # site/ on :4040, live reload
npm run build      # dist/ + _site/
npm test           # typecheck + node --test
```

The site is the [`poops-docs-theme`](https://github.com/stamat/poops-docs-theme)
`prose` layout, a dev dependency — so the demo doubles as the check that the element
drops into a real docs theme: its tokens, its highlight.js colors, its copy buttons
wrapping every `pre`. The one thing it has to say out loud is the margin override that
`code-preview.css` documents.

## License

MIT
