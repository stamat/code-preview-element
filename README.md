# code-preview-element

A code block that renders itself. `<code-preview>` wraps a highlighted
`<pre><code>` in a live preview: an iframe above the code, the code editable, edits
applied as you type. The sample is the only source of truth, so a documented example
and what it actually does cannot drift.

```html
<link rel="stylesheet" href="node_modules/code-preview-element/dist/code-preview.min.css">
<script src="node_modules/code-preview-element/dist/code-preview.min.js"></script>

<code-preview css="dist/my-library.css">
  <pre><code class="language-html">&lt;button class="btn"&gt;Hi&lt;/button&gt;</code></pre>
</code-preview>
```

That build is 11KB and brings no highlighter, because it expects the page to already
have one — a docs site loading a second copy of highlight.js is 42KB spent on nothing.
If yours has none, swap in `dist/code-preview-hljs.min.js`, which carries its own. See
[Two builds](#two-builds).

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
highlight.js, 53KB standalone — see [Two builds](#two-builds). No service worker, no
bundler config, no origin to serve demo files from.

Reach for something else when the shape of the problem is different:

| Instead | When |
|---|---|
| [playground-elements](https://github.com/google/playground-elements) | multi-file samples, TypeScript compiled in the browser, bare `import`s resolved from npm. Costs a service worker and a few hundred KB. |
| [Sandpack](https://sandpack.codesandbox.io/) | demoing React components rather than markup and CSS. |
| [@mdjs/mdjs-preview](https://www.npmjs.com/package/@mdjs/mdjs-preview) | you are already on the mdjs/rocket toolchain and write demos as JS functions. |
| StackBlitz / CodePen embeds | the reader should be able to fork the sample and keep it. |

## Attributes

| Attribute | Effect |
|---|---|
| `css` | whitespace-separated stylesheet urls for the frame |
| `js` | whitespace-separated script urls for the frame |
| `head` | extra head html, replacing the default `body{margin:0;padding:1rem}` |
| `theme-attribute` | attribute the host page's `[data-theme]` is mirrored onto, inside the frame |
| `viewport-width` | render at this css width and scale it down to fit |
| `viewport-widths` | whitespace-separated widths to offer as buttons |
| `no-edit` | render the preview, leave the code read-only |
| `reload` | always rebuild the frame on edit, never patch it |

Relative urls in `css`/`js` resolve against the **host page** — that is what a
`srcdoc` document inherits as its base url — so a page two directories down needs
`../../dist/my-library.css`, exactly as it would in its own markup.

## Responsive samples

A preview frame in a text column is a ~700px viewport, and media queries inside it
read that width honestly — so a responsive sample only ever demonstrates its narrow
layout. `viewport-width` fixes that by giving the frame a real width and scaling the
rendered result down to fit:

```html
<code-preview css="dist/my-library.css" viewport-width="1024">
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
<code-preview css="dist/my-library.css" viewport-widths="375 768 1024">
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
const marker = /<!-- demo -->\s*(<pre><code class="hljs language-html">[\s\S]*?<\/code><\/pre>)/g
html = html.replace(marker, (_, fence) =>
  `<!-- demo --><code-preview css="${prefix}dist/my-library.css">${fence}</code-preview>`)
```

Leave the marker in the output and put the element *between* it and the fence: the
pattern then no longer matches, so a re-run is a no-op — which matters for watch
modes that recompile only the pages that changed and then post-process all of them.

**From highlight.js itself**, if the page highlights at runtime — docsify, a
hand-written page, anything without a markup build to hook into. hljs takes plugins,
and `after:highlightElement` fires once per block with the `<code>` in hand:

```js
hljs.addPlugin({
  'after:highlightElement': ({ el }) => {
    // Opt in per block, and never wrap twice. Whichever signal your generator can
    // put on a fence works — a class here, because it survives the most of them.
    if (!el.classList.contains('demo') || el.closest('code-preview')) return

    const pre = el.parentElement
    const preview = document.createElement('code-preview')
    preview.setAttribute('css', '/dist/my-library.css')

    // Assembled off-DOM and inserted whole. The element upgrades the instant it is
    // connected and looks for its `<pre><code>` right then, so a wrapper connected
    // empty and filled afterwards never builds a preview at all.
    const anchor = document.createComment('code-preview')
    pre.replaceWith(anchor)
    preview.appendChild(pre)
    anchor.replaceWith(preview)
  }
})
hljs.highlightAll()
```

Register the plugin before `highlightAll`; the element's own script tag can come in
either order. Two things are easier here than in a build step: the `css` url is
resolved by the browser, so one absolute path serves every page at any depth, and the
opt-in check is a predicate rather than a regex over html — `data-` attributes, the
language, the sample's own content, whatever the block already carries.

Opting in is the whole difficulty, and it is a markdown problem rather than an hljs
one: a docs page is full of html fences that are not demos, so *every* html fence is
the wrong default. What gets a class onto a fence depends on the generator —
`markdown-it-attrs` takes ` ```html {.demo} `, several others pass the info string
through as extra classes, and a plugin-less setup has the marker-comment route above.

## Editing

The editor is [CodeJar](https://github.com/antonmedv/codejar), which is in both bundles
— it is 2KB, and it is the reason the block can be typed into at all. Recolouring on
every keystroke means replacing the block's innerHTML, which drops the caret and shreds
the undo stack; restoring both through IME composition and Firefox's contenteditable
quirks is why that library exists. A bare `contenteditable` would not have been less
code here, only worse.

highlight.js is pinned to v11 to match what static site generators emit at build
time. If runtime and build-time output disagree, the block visibly reshuffles the
first time it is focused.

Edits apply on a debounce with no Run button — 250ms when the frame can be patched,
600ms when it has to reload. Patching keeps stylesheets loaded and the scroll
position; a reload is forced by `js` assets, the `reload` attribute, an inline
`<script>` in the sample, or a sample that is a whole document. All of those are the
same trap from different ends: `innerHTML` never executes scripts it inserts, and a
script that already ran does not re-run against markup replacing what it initialised.

## Two builds

Same element, and the only difference is whether highlight.js rides along:

| Bundle | | |
|---|---|---|
| `dist/code-preview.min.js` | 11KB | the default. No highlighter; uses `window.hljs` if the page has one. |
| `dist/code-preview-hljs.min.js` | 53KB | highlight.js bundled in, for a page with none. |

The default reads the global per call rather than once at startup, so the order of the
two script tags does not matter:

```html
<script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/highlight.min.js"></script>
<script src="node_modules/code-preview-element/dist/code-preview.min.js"></script>
```

A page that highlighted its fences at build time and ships no runtime hljs is the case
the default cannot cover: the preview and the editor still work, the block keeps
whatever colour the generator baked in, and typing stops recolouring it. That page
wants the `-hljs` build — it is the whole install in one tag, and the reason to reach
for it is the *editor*, not the first paint.

The only thing the default build asks of that global is one method, so something other
than highlight.js can stand in — Prism, Shiki's browser build, your own — as long as it
is in place before the element registers:

```js
window.hljs = { highlightElement (element) { /* recolour it, leave textContent alone */ } }
```

The block arrives carrying `class="hljs language-<lang>"`, and the sample is its
`textContent` — a highlighter that rewrites that text breaks the preview it feeds.
`CodePreview.highlighter` is the same hook one level down, typed as `Highlighter`, for
code that registers the element itself rather than loading a bundle that does.

## Styling

Two stylesheets ship in `dist`, both plain CSS, minified and not:

| File | |
|---|---|
| `dist/code-preview.css` | required — the layout the element needs to work |
| `dist/code-preview-hljs.css` | optional — highlight.js token colours, light and dark |

The second is separate on purpose: a docs site that already ships a syntax theme
should not have it overridden. Link it only if the code blocks would otherwise be
monochrome. It is scoped to `pre code`, so it cannot reach code blocks elsewhere on
the page. It shares a name with `dist/code-preview-hljs.js` and nothing else — one is
hljs's colours, the other is hljs itself. Under the package exports they are `./theme`
and `./hljs`.

The required sheet is the minimum plus as little taste as possible. Every colour is a
custom property with a fallback — a host page that already defines `--border`, `--bg`,
`--accent`, `--fg-muted`, `--radius` or `--font-mono` gets its own look for free.

The element and the code block are meant to read as one object, so the preview has no
bottom border (the code block below brings its own) and the block inside gets no
margin. If a gap survives anyway, a host theme is outranking the package: its
`.prose :is(figure, .code-wrap)` is two classes against the package's one class and
one type. Win it back from the host side:

```css
.prose code-preview > :is(pre, .code-wrap) { margin: 0; }
```

`max-height` on the frame is load-bearing, not taste: the element sizes the frame
from its content, so a sample measured in viewport units would grow the frame, which
grows the viewport, which grows the sample. The cap makes that converge.

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
  would assert fiction. `npm run dev` and the example page are the check.

## Development

```
npm run dev        # example page on :4042, live reload
npm run build      # dist/ + example/dist/
npm test           # typecheck + node --test
```

## License

MIT
