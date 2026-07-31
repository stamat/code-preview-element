// <code-preview> — a code block that renders itself.
//
// Wraps a highlighted `<pre><code>` in a live preview: an iframe above the code,
// the code editable, edits applied as you type. The sample stays the only source
// of truth, so the preview and the code it documents cannot drift.
//
// An iframe rather than markup inlined into the page, because a documentation page
// cannot host a sample of a CSS library safely. Tag-level rules for `html`, `body`,
// `h1`–`h6` and `* { box-sizing }` would restyle the docs around the sample, and
// `@layer base` rules would lose to the theme, so the preview would be wrong in
// both directions at once. Scoping the stylesheet under a wrapper selector is no
// better: `:root` goes with it and the custom properties die. The frame is the
// isolation, and for a CSS library it is also the honest demo — a real page loading
// the real stylesheet.
//
// Light DOM on purpose: the code block keeps the host page's `.hljs` colors and
// prose styles, which a shadow root would cut it off from.
//
// Nothing here knows about any particular site, generator or markdown flavour —
// every input arrives as an attribute, so wiring is whatever fills them in. See the
// README for the two shapes that has taken: writing the element by hand, or having
// a build step wrap already-highlighted fences in it.
//
//   <code-preview css="dist/lib.css" theme-attribute="data-color-scheme">
//     <pre><code class="hljs language-html">…</code></pre>
//   </code-preview>
//
// Relative urls in `css`/`js` resolve against the *host page*, because that is what
// a srcdoc document inherits as its base url — so a page two directories down needs
// `../../dist/lib.css`, exactly as it would in its own markup.
//
// No highlighter is imported here, and the element is not registered here either:
// both are the entry file's job, so that the bundle with highlight.js in it and the
// bundle without can be the same element. See code-preview.ts and code-preview-lite.ts.
//
// Attributes:
//   css              whitespace-separated stylesheet urls for the frame
//   js               whitespace-separated script urls for the frame
//   head             extra head html, replacing the default body-padding style
//   theme-attribute  attribute the host page's [data-theme] is mirrored onto
//   viewport-width   render at this css width and scale it down to fit, so the
//                    sample's wider media queries apply (see scaleToFit)
//   viewport-widths  whitespace-separated widths to offer as buttons, which set
//                    `viewport-width` — the attribute stays the single source of
//                    truth, so external code can drive it just as well
//   manifest         url of a custom-elements.json; its presence is what turns the
//                    options panel on, and only the opt-in bundle can answer it
//   manifest-tag     which declaration in it to drive, when the sample has more than
//                    one documented element in it
//   tab              `code` (default) or `options` — which panel is open, held the
//                    same way `viewport-width` is: the attribute is the state
//   no-edit          render the preview, leave the code read-only
//   no-shrink        let the preview grow to its tallest measurement and stay there,
//                    for a sample that would otherwise measure short and shift the
//                    page as a font or an image lands
//   reload           always rebuild the frame on edit, never patch it
import { CodeJar } from 'codejar'

// ponytail: html only. Editing css or js means splitting a demo across three
// fences and adding a tab strip; nothing in the docs wants that yet.
const EDITABLE = /^(html|xml)$/

const DEFAULT_HEAD = '<style>body{margin:0;padding:1rem}</style>'

// A patch lands in the frame that is already loaded; a rebuild reloads it, so it
// gets a longer leash — one reload per keystroke is miserable, and half-typed
// markup is usually broken anyway.
const PATCH_DELAY = 250
const RELOAD_DELAY = 600

// The hint each editor is described by needs an id of its own, and a docs page has as
// many editors as it has samples.
let uid = 0

// The two things Tab can be doing in there, said the same way to a screen reader and to
// the screen. Named rather than inlined because the second one has to be able to say
// that the first one is over.
const TAB_CAUGHT = 'Press Esc, then Tab, to leave the editor'
const TAB_FREE = 'Tab now leaves the editor'

const list = (value: string | null): string[] => (value ?? '').split(/\s+/).filter(Boolean)

const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

// A sample that brings its own `<html>` owns its head: pass it through untouched
// rather than injecting a second one around it.
const isDocument = (src: string): boolean => /^\s*<(!doctype|html)\b/i.test(src)

// Recolour one code block. Called for the first paint of a plain block and again on
// every keystroke, so it has to be idempotent and must not alter `textContent` —
// that text is the sample.
export type Highlighter = (element: HTMLElement, language: string) => void

// The highlight.js adapter, given whichever hljs the entry file found — bundled or
// already on the page. Here rather than in either entry because the quirks are the
// same from both ends: hljs skips an element it has already highlighted, and its own
// pass drops the language class the next one needs, so both are restored each time.
// Untyped because the lite build's hljs is a global it never imported.
export const hljsHighlighter = (hljs: any): Highlighter => (element, language) => {
  delete element.dataset.highlighted
  element.className = `hljs language-${language}`
  hljs.highlightElement(element)
}

// The document the frame gets. Written out in full rather than leaning on the
// parser to hoist a leading `<link>` into head, for two reasons: `<!DOCTYPE html>`
// is what keeps the frame out of quirks mode, where the old box model would
// misrepresent the library outright, and an explicit `<body>` stops a sample that
// happens to open with `<title>`, a comment or whitespace from landing in head.
//
// How much to shrink an emulated viewport to fit the space actually available.
//
// A preview frame in a docs column is a ~700px viewport, and media queries inside it
// read that width honestly — so a responsive sample only ever shows its narrow
// layout. Giving the frame a real width of, say, 1024px is what makes the desktop
// breakpoints apply; scaling it down is what makes it fit on screen. CSS `zoom` is
// not an alternative: it shrinks the rendering without changing the viewport the
// media queries are asked about.
//
// 1 means don't scale: no emulated width, nothing measured yet, or a container
// already wide enough — including the narrower-than-available case, where the point
// is a phone-sized viewport at full fidelity, not a magnified one.
export function scaleToFit(available: number, emulated: number): number {
  if (!(available > 0) || !(emulated > 0) || available >= emulated) return 1
  return available / emulated
}

// Exported for tests: it is the pure half of the element, and both of the mistakes
// above are silent rather than loud.
export function buildSrcdoc(
  html: string,
  opts: { css?: string[], js?: string[], head?: string | null } = {}
): string {
  if (isDocument(html)) return html
  const styles = (opts.css ?? []).map((href) => `<link rel="stylesheet" href="${attr(href)}">`).join('')
  // Scripts last, so a library's stylesheet is in place before its js measures anything —
  // and every one of them deferred, which is not a nicety.
  //
  // A custom element bundle in head runs *before* the body is parsed, so `define` is
  // called first and the parser then upgrades each element the instant it opens its tag,
  // with none of its light-DOM children parsed yet. Every element that reads its own
  // children on connect — which is every element in a light-DOM library — finds nothing
  // there and bails. The sample renders, the markup is right, and not one element is
  // alive: the failure looks like a preview that is merely unresponsive, with nothing in
  // the console to say so.
  //
  // `defer` is what those libraries already document as their own requirement ("loaded
  // deferred or at the end of the body"), and it keeps execution order across several
  // urls. An inline `<script>` inside the sample is unaffected — that is the author's,
  // and it is in body where it was written.
  const scripts = (opts.js ?? []).map((src) => `<script src="${attr(src)}" defer></script>`).join('')
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    styles + (opts.head ?? DEFAULT_HEAD) + scripts +
    '</head><body>' + html + '</body></html>'
}

export class CodePreview extends HTMLElement {
  // The width buttons write `viewport-width` and the tabs write `tab`, and this is
  // what makes that enough: the attribute is the state, so a click, a script and a
  // hand-written attribute all take the same path.
  static observedAttributes = ['viewport-width', 'tab']

  // Set by the entry file, before it registers the element — an element already in
  // the markup upgrades the moment `define` is called, and its first paint needs
  // this. Left unset the block is still editable and the preview still updates; the
  // code just stops recolouring.
  static highlighter?: Highlighter

  // Set by the options bundle, exactly as `highlighter` is set by the entry files, and
  // asked for only when a `manifest` attribute says there is something to build a panel
  // out of. Left unset — the default build, every page that does not import it — the
  // attribute is inert and the element renders byte-identically to before.
  static options?: (host: CodePreview) => void

  // "Re-read whatever you are showing." Called when `tab` changes and again whenever the
  // frame finishes loading — the panel reads both the sample's attributes and the frame's
  // computed values, and a document that has just arrived is new information about the
  // second. A plain field rather than an event or an observer because the element knows
  // nothing about which tabs exist and the panel knows nothing about attribute callbacks;
  // this is the whole contract between them, and with no options bundle nobody is called.
  onPanelSync?: () => void

  private frame?: HTMLIFrameElement
  private viewport?: HTMLElement
  private bar?: HTMLElement
  private code?: HTMLElement
  private language = 'html'
  private resize?: ResizeObserver
  private theme?: MutationObserver
  private timer?: ReturnType<typeof setTimeout>
  private jar?: ReturnType<typeof CodeJar>
  // The keyboard hint, once there is an editor to hint about. Kept because its text is
  // the one thing that changes when Escape releases Tab.
  private hint?: HTMLElement
  // Has the frame loaded a document of ours? Nothing may be patched before it has.
  private loaded = false
  // Pending measure, so a burst of resizes measures once.
  private raf = 0
  // Tallest height this sample has measured at, under `no-shrink`. A re-fit may
  // measure shorter than the last one for reasons that are not the sample changing —
  // a narrower column scales the frame down, a font or an image lands late — and
  // letting the wrapper follow that down shifts everything below it, twice, for a
  // preview showing the same thing. Off by default, because a preview that only ever
  // grows is the wrong trade for a sample whose height genuinely varies. Reset
  // wherever the size is *meant* to change: a new source, a new emulated width.
  private peak = 0
  // The sample as the frame was last given it. CodeJar reports an update on every
  // keyup, not only the ones that changed something — Escape, Tab, the arrows and every
  // modifier arrive here saying the same text they said before — and rendering that
  // reloads the frame's document for a sample that did not move. What a reload costs is
  // everything live in there: a script's state, and the focus a keyboard user has put on
  // a control inside the sample, which is the one thing a preview of an accessible
  // component has to be able to hold still for.
  private rendered?: string
  // The declarations the options panel has turned on, as one css rule's worth of text.
  // Kept here rather than in the panel because a rebuilt frame is a new document with a
  // new head, and re-applying it is `onFrameLoad`'s job.
  private optionsCss = ''
  connectedCallback(): void {
    // Moving the element in the dom re-runs this; build once, or the move costs a
    // second viewport and a second width bar stacked on the first. Only the theme
    // observer has to come back — disconnecting stopped it, and moving an iframe
    // reloads it, so the frame's own load event rebuilds everything downstream.
    if (this.frame) {
      this.watchTheme()
      if (this.editable) this.attachEditor()
      return
    }
    // Two queries, not one selector list: a list returns the first match in *tree*
    // order, so `'pre code, pre'` hands back the `<pre>` every time — which then gets
    // hljs run over markup containing a `<code>` child, and has its classes
    // overwritten. The `<code>` is what holds the sample; the `<pre>` is the fallback
    // for markup that has none.
    const code = this.querySelector<HTMLElement>('pre > code') ?? this.querySelector<HTMLElement>('pre')
    if (!code) return
    this.code = code
    this.language = /language-([\w-]+)/.exec(code.className)?.[1]?.toLowerCase() ?? 'html'

    const frame = document.createElement('iframe')
    frame.className = 'code-preview-frame'
    frame.title = 'Rendered preview'
    // The frame is sized to its whole document, so it should never need to scroll —
    // and a scrollbar inside it would be scaled along with everything else and steal
    // width from the layout being demonstrated. The wrapper is the one thing that
    // scrolls, when its max-height caps a tall sample. Deprecated as an attribute, and
    // still the only thing that reaches a document this element does not own the head of.
    frame.setAttribute('scrolling', 'no')
    // A demo far down a long page costs nothing until it is scrolled to. The frame
    // has no height until it loads, which is what the css min-height covers.
    frame.loading = 'lazy'
    // The frame is sized to its whole document, so it has nothing to scroll — and if a
    // measurement is ever a pixel short, a scrollbar is the worst possible way to
    // spend that pixel: it is scaled along with everything else, and it steals width
    // from the layout being demonstrated. The wrapper is the one thing that scrolls,
    // which it has to be, since the height cap lives there. Obsolete attribute, still
    // honoured everywhere; `html { overflow: clip }` in the frame is the fallback if
    // that ever stops being true.
    frame.setAttribute('scrolling', 'no')
    frame.addEventListener('load', () => this.onFrameLoad())

    // The frame lives in a wrapper rather than directly in the element, because
    // `viewport-width` scales the frame and something unscaled has to own the
    // border, the corner radius and the height cap. It is also what the code block
    // below sits against, so the two still read as one unit.
    const viewport = document.createElement('div')
    viewport.className = 'code-preview-viewport'
    viewport.appendChild(frame)
    this.prepend(viewport)
    this.frame = frame
    this.viewport = viewport

    // Width and scale before the first srcdoc, not after its load event: an emulated
    // width applied to an already-painted frame renders the sample once at the column's
    // width and then again scaled, which is a visible jump in a frame that has not
    // finished loading yet. Sizing an empty frame costs nothing and measures nothing —
    // `measure` sits behind `loaded`.
    this.fit()
    this.render(this.source)

    this.watchTheme()

    const widths = list(this.getAttribute('viewport-widths')).map(Number).filter((width) => width > 0)
    if (widths.length) this.buildBar(widths)

    if (this.editable) this.attachEditor()
    // A block that arrived plain — hand-written markup rather than a fence some site
    // generator already highlighted — gets highlighted here. Blocks that came
    // pre-highlighted keep exactly what they have: re-running hljs is work for an
    // identical result, and any version skew would show up as the whole block
    // reshuffling on load. Last, and after the preview is already wired, so a
    // highlighting problem costs colour and not the demo.
    if (!code.querySelector('span')) this.highlight(code)

    // Last of all, and only when the markup says there is a manifest to read: the panel
    // is a second bundle's job, and everything it needs — the code block, the bar, the
    // editor — has to exist before it is asked for.
    if (this.hasAttribute('manifest')) CodePreview.options?.(this)
  }

  attributeChangedCallback(name: string, before: string | null, after: string | null): void {
    if (before === after) return
    // Nobody to tell until the options bundle has built a panel — which reads the
    // attribute itself when it does, so an initial `tab="options"` is not missed.
    if (name === 'tab') {
      this.onPanelSync?.()
      return
    }
    // Fires before connectedCallback for attributes present in the markup; there is
    // nothing to resize yet, and connectedCallback does the first fit anyway.
    if (name !== 'viewport-width' || !this.frame) return
    this.syncBar()
    this.peak = 0
    this.fit()
  }

  // The strip above the preview, made on demand and shared. Whatever ends up in it —
  // the width buttons below, the options panel's tab list, or both — it stays one box,
  // so there is one border, one set of top corners and one reservation to hold room for.
  get toolbar(): HTMLElement {
    if (!this.bar) {
      const bar = document.createElement('div')
      bar.className = 'code-preview-bar'
      this.prepend(bar)
      this.bar = bar
    }
    return this.bar
  }

  // A row of widths to render at. `role="group"` with a label rather than a
  // toolbar/tablist: these are plain buttons, and the richer roles oblige arrow-key
  // navigation that plain buttons do not need to be usable.
  private buildBar(widths: number[]): void {
    const group = document.createElement('div')
    group.className = 'code-preview-widths'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', 'Preview width')

    const button = (label: string, width: string): HTMLButtonElement => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'code-preview-width'
      element.textContent = label
      element.dataset.width = width
      // Empty width means the frame's natural width — no emulation, no scaling.
      element.addEventListener('click', () => {
        if (width) this.setAttribute('viewport-width', width)
        else this.removeAttribute('viewport-width')
      })
      return element
    }

    group.appendChild(button('Fit', ''))
    for (const width of widths) group.appendChild(button(`${width}px`, String(width)))
    this.toolbar.appendChild(group)
    this.syncBar()
  }

  // Dark mode: the host page's [data-theme] is copied into the frame, under whatever
  // attribute name the sample's stylesheet reads (`theme-attribute`). One observer per
  // element rather than a shared one, so the element needs no page-level setup to be
  // dropped in. Re-armed on reconnect, since disconnecting is what stopped it.
  private watchTheme(): void {
    this.theme?.disconnect()
    this.theme = new MutationObserver(() => this.syncTheme())
    this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }

  private syncBar(): void {
    const current = this.getAttribute('viewport-width') ?? ''
    this.bar?.querySelectorAll<HTMLButtonElement>('.code-preview-width').forEach((button) => {
      button.setAttribute('aria-pressed', String((button.dataset.width ?? '') === current))
    })
  }

  disconnectedCallback(): void {
    this.resize?.disconnect()
    this.theme?.disconnect()
    if (this.raf) cancelAnimationFrame(this.raf)
    if (this.timer) clearTimeout(this.timer)
    this.jar?.destroy()
    this.jar = undefined
    // The frame and the code block survive — they are dom, and this element may be
    // going straight back in. What does not survive is the loaded document: moving an
    // iframe reloads it, and a patch written before that load lands in the old one.
    this.loaded = false
  }

  get source(): string {
    return this.code?.textContent ?? ''
  }

  // Replace the sample, from outside the editor. The options panel's attribute knobs
  // are the only caller: an attribute belongs to an element in the sample, so the code
  // block has to keep telling the truth about it, and everything downstream of this is
  // the path a keystroke already takes.
  //
  // CodeJar's `updateCode` writes the text, re-highlights and then calls `onUpdate`
  // itself — which is the same `schedule` the editor is wired to — so the write, the
  // colour and the preview all follow from the one call. Without a jar (`no-edit`)
  // there is nothing listening, so all three are done by hand.
  set source(src: string) {
    const code = this.code
    if (!code || src === this.source) return
    if (this.jar) {
      this.jar.updateCode(src)
    } else {
      code.textContent = src
      this.highlight(code)
      this.schedule(src)
    }
  }

  // The box a tab hides: the `<pre>`, or the `.code-wrap` a copy-button script wrapped
  // it in. Walked up from the block rather than queried, because what sits between the
  // two is the host page's business and there is no list of wrappers to keep.
  get codePanel(): HTMLElement | undefined {
    let node = this.code
    while (node && node.parentElement !== this) node = node.parentElement ?? undefined
    return node
  }

  // The frame's document, once it holds one of ours. The options panel reads computed
  // values through it, for a custom property the manifest documents without a default.
  get frameDocument(): Document | undefined {
    return this.loaded ? (this.frame?.contentDocument ?? undefined) : undefined
  }

  // One stylesheet, appended last in the frame's head, holding whatever the options
  // panel's knobs have been turned to. Last because the `<link>`s from `css=` are
  // already there and equal specificity is settled by order; a separate sheet rather
  // than inline styles on the sample because that is what a consumer setting these
  // properties would actually write, and the panel offers the rule to be copied.
  //
  // Re-applied on every load, since a rebuilt frame is a new document. A patched frame
  // keeps it for free — patching only ever touches body.
  setFrameStyle(css: string): void {
    this.optionsCss = css
    this.applyFrameStyle()
  }

  private applyFrameStyle(): void {
    const doc = this.frameDocument
    if (!doc) return
    let style = doc.getElementById('code-preview-options') as HTMLStyleElement | null
    if (!style) {
      if (!this.optionsCss) return
      style = doc.createElement('style')
      style.id = 'code-preview-options'
      doc.head.appendChild(style)
    }
    style.textContent = this.optionsCss
  }

  private get assets(): { css: string[], js: string[], head: string | null } {
    return {
      css: list(this.getAttribute('css')),
      js: list(this.getAttribute('js')),
      head: this.getAttribute('head')
    }
  }

  // Patching the loaded document keeps the frame's stylesheets and scroll position,
  // so a keystroke costs nothing. It is wrong in two cases, which are the same trap
  // from both ends: `innerHTML` never executes scripts it inserts, and a script that
  // already ran — a library from `js`, say — does not re-run against the markup
  // replacing whatever it initialised. Either one means a real reload.
  private render(src: string): void {
    const frame = this.frame
    if (!frame || src === this.rendered) return
    this.rendered = src
    delete this.dataset.error
    // The sample itself changed, so the last measurement no longer describes it — an
    // edit that deletes half the markup has to be able to shrink the preview back.
    this.peak = 0
    // `loaded` is the guard that matters, and the presence of `doc.body` is not:
    // a fresh iframe already holds an about:blank document with a body, so
    // patching before the first real load writes the sample into a blank page —
    // no stylesheet, no load event, and therefore no sizing either.
    const patchable = this.loaded && !isDocument(src) && !this.assets.js.length && !this.hasAttribute('reload')
    if (patchable) {
      this.frame!.contentDocument!.body.innerHTML = src
      this.fit()
    } else {
      this.loaded = false
      frame.srcdoc = buildSrcdoc(src, this.assets)
    }
  }

  private schedule(src: string): void {
    if (this.timer) clearTimeout(this.timer)
    const reloads = this.assets.js.length > 0 || this.hasAttribute('reload')
    this.timer = setTimeout(() => this.render(src), reloads ? RELOAD_DELAY : PATCH_DELAY)
  }

  private onFrameLoad(): void {
    const doc = this.frame?.contentDocument
    if (!doc) return
    this.loaded = true
    this.syncTheme()
    this.applyFrameStyle()
    // An iframe has no intrinsic height, so the parent measures the frame's own
    // document and sizes it. Reconnected on every load: a rebuild means a new
    // documentElement to watch. The wrapper is watched too — its width is what an
    // emulated viewport is scaled against, so a window resize has to refit.
    this.resize?.disconnect()
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.fit())
      this.resize.observe(doc.documentElement)
      if (this.viewport) this.resize.observe(this.viewport)
    }
    // srcdoc inherits the parent's origin, so the page can hear the sample's own
    // errors. Without this a broken edit just looks like a preview that quietly
    // stopped working.
    this.frame?.contentWindow?.addEventListener('error', (event) => {
      this.dataset.error = (event as ErrorEvent).message || 'Script error'
    })
    this.fit()
    // A loaded document is the first moment anything can be computed out of it, which is
    // where the options panel gets the default for a property the manifest documents
    // without one.
    this.onPanelSync?.()
  }

  // Width now, height on the next frame. The two cannot happen together: changing the
  // frame's width re-flows the document inside it, and a height measured in the same
  // tick describes the width the frame *had*. At `Fit` that is invisible, because the
  // width does not actually change — at any emulated width the frame ends up sized for
  // a layout it is no longer showing, which is a document taller than its viewport and
  // a scrollbar inside the preview.
  private fit(): void {
    const frame = this.frame
    const viewport = this.viewport
    if (!frame || !viewport) return

    const emulated = Number(this.getAttribute('viewport-width')) || 0
    const scale = scaleToFit(viewport.clientWidth, emulated)
    // Two separate decisions, and conflating them broke narrow emulation: the width
    // is always applied, because that is the whole point — it is what the media
    // queries inside will read — while scaling only happens when that width does not
    // fit. Asking for 375px in a 700px column is a phone preview, not a no-op.
    frame.style.width = emulated ? `${emulated}px` : ''
    frame.style.transform = scale < 1 ? `scale(${scale})` : ''

    // One measurement per frame however many resizes arrive. No rAF (jsdom, an old
    // engine) just means measuring immediately, the way this used to.
    if (this.raf) cancelAnimationFrame(this.raf)
    if (typeof requestAnimationFrame === 'function') {
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.measure() })
    } else {
      this.measure()
    }
  }

  // `documentElement.scrollHeight` is the obvious measure and the wrong one: it never
  // reports less than the viewport, and the viewport here is the frame this is about
  // to size — so a short sample locks to the iframe's default 150px and an edit that
  // removes content can never shrink it back. The html box's own height is
  // content-driven, which is what makes shrinking work; body's scrollHeight covers
  // content that spills out of that box.
  private measure(): void {
    const frame = this.frame
    const viewport = this.viewport
    const doc = frame?.contentDocument
    // Nothing to measure before the first load, and measuring anyway is worse than
    // waiting: the blank document is 0 tall, which would collapse the reserved height
    // the stylesheet is holding and shift the page twice instead of not at all.
    if (!doc || !frame || !viewport || !this.loaded) return

    // The frame gets the sample's whole height, unscaled, so it has nothing to scroll.
    const content = Math.ceil(Math.max(doc.documentElement.getBoundingClientRect().height, doc.body?.scrollHeight ?? 0))
    frame.style.height = `${content}px`

    // Read the frame's own box instead of recomputing `content * scale`: a
    // getBoundingClientRect already accounts for the transform, so the wrapper matches
    // what the frame visually occupies rather than matching arithmetic that then has
    // to agree with the browser's rounding.
    const visible = Math.ceil(frame.getBoundingClientRect().height)
    // A transform shrinks what is drawn and not the box it is drawn in, so a scaled
    // frame still takes its full unscaled height in layout — which is taller than the
    // wrapper sized to what it visually occupies, and that is the scrollbar down the
    // right of every emulated width. Give the difference back as negative margin: the
    // frame's footprint becomes what it looks like, and the wrapper's own max-height
    // still scrolls a genuinely tall sample.
    frame.style.marginBottom = visible < content ? `${visible - content}px` : ''

    // The wrapper's height is its border box — the stylesheet sets box-sizing itself
    // rather than trusting the host to — while the rect is the space inside it. Without
    // the difference added back every preview is short by its own border. Measured, so
    // it survives whatever border or padding the stylesheet ends up putting there.
    const chrome = viewport.offsetHeight - viewport.clientHeight
    const measured = visible + chrome
    this.peak = this.hasAttribute('no-shrink') ? Math.max(this.peak, measured) : measured
    const height = `${this.peak}px`
    // Writing an unchanged height would be a no-op, but the wrapper is observed for
    // width changes, and an unchanged write still costs a layout pass per demo.
    if (viewport.style.height !== height) viewport.style.height = height
  }

  private syncTheme(): void {
    const doc = this.frame?.contentDocument
    if (!doc) return
    const name = this.getAttribute('theme-attribute') || 'data-theme'
    const theme = document.documentElement.dataset.theme
    if (theme) doc.documentElement.setAttribute(name, theme)
    else doc.documentElement.removeAttribute(name)
  }

  // Asked twice — building the element, and again if it is moved in the dom, which
  // tears the editor down and has to put it back.
  private get editable(): boolean {
    return !this.hasAttribute('no-edit') && EDITABLE.test(this.language)
  }

  // CodeJar rather than a bare contenteditable: recoloring on every keystroke means
  // replacing the block's innerHTML, which drops the caret and shreds the undo
  // stack. Restoring both through IME composition and Firefox's contenteditable
  // quirks is the reason that library exists. It also brings tab handling and
  // plaintext paste, so this is less code here, not more.
  //
  // What it does not bring is any of the accessibility a text field gets for free: the
  // block it leaves behind is editable and nothing else — no role, no name, no way back
  // out by keyboard. `describeEditor` and `releaseTab` are the two halves of that.
  private attachEditor(): void {
    const code = this.code
    if (!code || this.jar) return
    this.jar = CodeJar(code, (element) => this.highlight(element), { tab: '  ' })
    this.jar.onUpdate((src) => this.schedule(src))
    this.describeEditor(code)
    // Capture, and on the host rather than the block: a listener added to the block
    // itself runs after CodeJar's, which has already called `preventDefault` on the
    // Tab by then. Both are stable references, so reconnecting cannot double them up.
    this.addEventListener('keydown', this.releaseTab, true)
    this.addEventListener('focusout', this.catchTab, true)
    this.classList.add('is-editable')
  }

  // WCAG 2.1.2, no keyboard trap. Tab indents inside a code editor, which means it
  // cannot also be the way out, and an editable block with no way out is the one
  // accessibility failure this element could ship that has no workaround at all —
  // a keyboard user who tabs in is stuck there for the rest of the page.
  //
  // Escape hands Tab back, the way every editor that keeps tab-to-indent does it, and
  // leaving the block re-arms it, so coming back finds an editor that indents again.
  // A rearm on blur rather than a second Escape toggling it: the failure mode of
  // guessing wrong is being trapped again without being told, so the guess goes the
  // other way every time.
  //
  // CodeJar's own option is flipped rather than the key intercepted, because Shift+Tab
  // has to escape backwards too, and outdent is its handler and not ours.
  private releaseTab = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    this.jar?.updateOptions({ catchTab: false })
    // Pressing Escape is otherwise silent, and a key that appears to do nothing is a key
    // nobody presses twice. The hint is already on screen, so saying it there costs a
    // string and no layout.
    if (this.hint) this.hint.textContent = TAB_FREE
  }

  private catchTab = (): void => {
    this.jar?.updateOptions({ catchTab: true })
    if (this.hint) this.hint.textContent = TAB_CAUGHT
  }

  // What a screen reader is told this block is, and how to get back out of it.
  //
  // `role="textbox"` because a contenteditable is exposed inconsistently without one,
  // and it also makes the highlighter's spans presentational — which is right: the
  // sample is its text, and the colours are decoration. `aria-multiline` because the
  // default for a textbox is a single line, and a code sample is not that.
  //
  // The name is left alone if the markup brought one: a docs page that has already
  // labelled the block knows what the sample is better than a language name does.
  //
  // The hint is the WCAG 2.1.2 advisory, and it has to reach two audiences that need
  // two different things — `aria-describedby` says it on focus for a screen reader,
  // and the stylesheet shows the same element while the block has focus, because a
  // sighted keyboard user is just as stuck and hears nothing.
  private describeEditor(code: HTMLElement): void {
    code.setAttribute('role', 'textbox')
    code.setAttribute('aria-multiline', 'true')
    // The one key in here that is not a key anywhere else. A shortcut that exists only in
    // a description is a shortcut nobody can look up; this is the field made for it.
    code.setAttribute('aria-keyshortcuts', 'Escape')
    if (!code.hasAttribute('aria-label') && !code.hasAttribute('aria-labelledby')) {
      code.setAttribute('aria-label', `Editable ${this.language} sample`)
    }
    let hint = this.hint
    if (!hint) {
      hint = document.createElement('p')
      hint.className = 'code-preview-hint'
      hint.id = `code-preview-hint-${++uid}`
      // A live region, because the text is not only a description — it changes when
      // Escape releases Tab, and a description is read when focus arrives and never
      // again. `status` rather than `aria-live` spelled out: same politeness, one
      // attribute. It only ever announces while the editor has focus, which is the
      // only time the stylesheet shows it and the only time it can change.
      hint.setAttribute('role', 'status')
      hint.textContent = TAB_CAUGHT
      this.appendChild(hint)
      this.hint = hint
    }
    code.setAttribute('aria-describedby', hint.id)
  }

  // Shared by the first paint and every keystroke after it. Looked up per call
  // rather than captured, so the lite build can be handed a highlighter after the
  // page has loaded one.
  private highlight(element: HTMLElement): void {
    CodePreview.highlighter?.(element, this.language)
  }
}

// Registration is the entry file's job — it has to set the highlighter first.
export function define(): void {
  if (!customElements.get('code-preview')) customElements.define('code-preview', CodePreview)
}
