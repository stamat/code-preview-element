# code-preview-element

A code block that renders itself. `<code-preview>` wraps a highlighted
`<pre><code>` in a live preview: an iframe above the code, the code editable, edits
applied as you type. The sample is the only source of truth, so a documented example
and what it actually does cannot drift.

```html
<link rel="stylesheet" href="node_modules/code-preview-element/src/code-preview.css">
<script src="node_modules/code-preview-element/dist/code-preview.min.js"></script>

<code-preview css="dist/my-library.css">
  <pre><code class="hljs language-html">&lt;button class="btn"&gt;Hi&lt;/button&gt;</code></pre>
</code-preview>
```

An iframe, rather than markup inlined into the page, because a docs page cannot host
a sample of a CSS library safely: tag-level rules for `html`, `body` or `*` restyle
the docs around it, `@layer base` rules lose to the theme, and scoping the stylesheet
under a wrapper selector takes `:root` with it and kills the custom properties. The
frame is the isolation — and for a CSS library it is also the honest demo, a real
page loading the real stylesheet.

## Attributes

| Attribute | Effect |
|---|---|
| `css` | whitespace-separated stylesheet urls for the frame |
| `js` | whitespace-separated script urls for the frame |
| `head` | extra head html, replacing the default `body{margin:0;padding:1rem}` |
| `theme-attribute` | attribute the host page's `[data-theme]` is mirrored onto, inside the frame |
| `no-edit` | render the preview, leave the code read-only |
| `reload` | always rebuild the frame on edit, never patch it |

Relative urls in `css`/`js` resolve against the **host page** — that is what a
`srcdoc` document inherits as its base url — so a page two directories down needs
`../../dist/my-library.css`, exactly as it would in its own markup.

## Wiring it up

The element reads the code out of its own child `<pre><code>`, so anything that
produces a highlighted code block can feed it. Two shapes that has taken:

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

## Editing

The editor is [CodeJar](https://github.com/antonmedv/codejar) with
[highlight.js](https://highlightjs.org), both bundled into `dist/code-preview.min.js`
(53KB). CodeJar rather than a bare `contenteditable` because recolouring on every
keystroke means replacing the block's innerHTML, which drops the caret and shreds the
undo stack; restoring both through IME composition and Firefox's contenteditable
quirks is why that library exists.

highlight.js is pinned to v11 to match what static site generators emit at build
time. If runtime and build-time output disagree, the block visibly reshuffles the
first time it is focused.

Edits apply on a debounce with no Run button — 250ms when the frame can be patched,
600ms when it has to reload. Patching keeps stylesheets loaded and the scroll
position; a reload is forced by `js` assets, the `reload` attribute, an inline
`<script>` in the sample, or a sample that is a whole document. All of those are the
same trap from different ends: `innerHTML` never executes scripts it inserts, and a
script that already ran does not re-run against markup replacing what it initialised.

## Styling

`src/code-preview.css` is the minimum the element needs plus as little taste as
possible. Every colour is a custom property with a fallback — a host page that
already defines `--border`, `--bg`, `--accent`, `--fg-muted`, `--radius` or
`--font-mono` gets its own look for free.

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
- **No type declarations shipped.** The build is esbuild, which does not emit them.
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
