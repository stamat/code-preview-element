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
//   no-edit          render the preview, leave the code read-only
//   reload           always rebuild the frame on edit, never patch it
import { CodeJar } from 'codejar'
import hljs from 'highlight.js/lib/core'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'

// highlight.js's own alias names, and the same ones static site generators register
// when they highlight fences at build time. Re-highlighting has to agree with that
// build-time output or the block visibly reshuffles the first time it is focused,
// which is also why the dependency is pinned to hljs 11. css and javascript are here
// even for an html-only editor because xml sub-highlights `<style>` and `<script>`
// bodies — but only if it can find them.
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)

// ponytail: html only. Editing css or js means splitting a demo across three
// fences and adding a tab strip; nothing in the docs wants that yet.
const EDITABLE = /^(html|xml)$/

const DEFAULT_HEAD = '<style>body{margin:0;padding:1rem}</style>'

// A patch lands in the frame that is already loaded; a rebuild reloads it, so it
// gets a longer leash — one reload per keystroke is miserable, and half-typed
// markup is usually broken anyway.
const PATCH_DELAY = 250
const RELOAD_DELAY = 600

const list = (value: string | null): string[] => (value ?? '').split(/\s+/).filter(Boolean)

const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

// A sample that brings its own `<html>` owns its head: pass it through untouched
// rather than injecting a second one around it.
const isDocument = (src: string): boolean => /^\s*<(!doctype|html)\b/i.test(src)

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
  // Scripts last, so a library's stylesheet is in place before its js measures
  // anything.
  const scripts = (opts.js ?? []).map((src) => `<script src="${attr(src)}"></script>`).join('')
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    styles + (opts.head ?? DEFAULT_HEAD) + scripts +
    '</head><body>' + html + '</body></html>'
}

export class CodePreview extends HTMLElement {
  // The width buttons write `viewport-width`, and this is what makes that enough:
  // the attribute is the state, so a click, a script and a hand-written attribute
  // all take the same path.
  static observedAttributes = ['viewport-width']

  private frame?: HTMLIFrameElement
  private viewport?: HTMLElement
  private bar?: HTMLElement
  private code?: HTMLElement
  private language = 'html'
  private resize?: ResizeObserver
  private theme?: MutationObserver
  private timer?: ReturnType<typeof setTimeout>
  private jar?: ReturnType<typeof CodeJar>
  // Has the frame loaded a document of ours? Nothing may be patched before it has.
  private loaded = false

  connectedCallback(): void {
    // Moving the element in the dom re-runs this; build once.
    if (this.frame) return
    const code = this.querySelector<HTMLElement>('pre code, pre')
    if (!code) return
    this.code = code
    this.language = /language-([\w-]+)/.exec(code.className)?.[1]?.toLowerCase() ?? 'html'

    const frame = document.createElement('iframe')
    frame.className = 'code-preview-frame'
    frame.title = 'Rendered preview'
    // A demo far down a long page costs nothing until it is scrolled to. The frame
    // has no height until it loads, which is what the css min-height covers.
    frame.loading = 'lazy'
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

    this.render(this.source)

    // Dark mode: the host page's [data-theme] is copied into the frame, under
    // whatever attribute name the sample's stylesheet reads (`theme-attribute`).
    // One observer per element rather than a shared one, so the element needs no
    // page-level setup to be dropped in.
    this.theme = new MutationObserver(() => this.syncTheme())
    this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const widths = list(this.getAttribute('viewport-widths')).map(Number).filter((width) => width > 0)
    if (widths.length) this.buildBar(widths)

    if (!this.hasAttribute('no-edit') && EDITABLE.test(this.language)) this.attachEditor()
  }

  attributeChangedCallback(name: string, before: string | null, after: string | null): void {
    // Fires before connectedCallback for attributes present in the markup; there is
    // nothing to resize yet, and connectedCallback does the first fit anyway.
    if (name !== 'viewport-width' || before === after || !this.frame) return
    this.syncBar()
    this.fit()
  }

  // A row of widths to render at. `role="group"` with a label rather than a
  // toolbar/tablist: these are plain buttons, and the richer roles oblige arrow-key
  // navigation that plain buttons do not need to be usable.
  private buildBar(widths: number[]): void {
    const bar = document.createElement('div')
    bar.className = 'code-preview-bar'
    bar.setAttribute('role', 'group')
    bar.setAttribute('aria-label', 'Preview width')

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

    bar.appendChild(button('Fit', ''))
    for (const width of widths) bar.appendChild(button(`${width}px`, String(width)))
    this.prepend(bar)
    this.bar = bar
    this.syncBar()
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
    if (this.timer) clearTimeout(this.timer)
    this.jar?.destroy()
    this.jar = undefined
    this.frame = undefined
  }

  get source(): string {
    return this.code?.textContent ?? ''
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
    if (!frame) return
    delete this.dataset.error
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
  }

  // `documentElement.scrollHeight` is the obvious measure and the wrong one: it
  // never reports less than the viewport, and the viewport here is the frame this
  // is about to size — so a short sample locks to the iframe's default 150px and
  // an edit that removes content can never shrink it back. The html box's own
  // height is content-driven, which is what makes shrinking work; body's
  // scrollHeight covers content that spills out of that box.
  private fit(): void {
    const frame = this.frame
    const viewport = this.viewport
    const doc = frame?.contentDocument
    if (!doc || !frame || !viewport) return

    const emulated = Number(this.getAttribute('viewport-width')) || 0
    const scale = scaleToFit(viewport.clientWidth, emulated)
    // Two separate decisions, and conflating them broke narrow emulation: the width
    // is always applied, because that is the whole point — it is what the media
    // queries inside will read — while scaling only happens when that width does not
    // fit. Asking for 375px in a 700px column is a phone preview, not a no-op.
    frame.style.width = emulated ? `${emulated}px` : ''
    frame.style.transform = scale < 1 ? `scale(${scale})` : ''

    // The frame gets the sample's full unscaled height, so nothing scrolls inside it;
    // the wrapper gets the scaled height, and caps it.
    const content = Math.ceil(Math.max(doc.documentElement.getBoundingClientRect().height, doc.body?.scrollHeight ?? 0))
    // A wrapper height is the *border* box wherever box-sizing is reset, which is most
    // stylesheets, while what was just measured is the space inside it. Without the
    // difference added back every preview is short by its own border and shows a
    // scrollbar with two pixels of travel. Measured rather than hardcoded, so it
    // survives whatever border or padding the stylesheet puts on the wrapper.
    const chrome = viewport.offsetHeight - viewport.clientHeight
    const height = `${Math.ceil(content * scale) + chrome}px`

    frame.style.height = `${content}px`
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

  // CodeJar rather than a bare contenteditable: recoloring on every keystroke means
  // replacing the block's innerHTML, which drops the caret and shreds the undo
  // stack. Restoring both through IME composition and Firefox's contenteditable
  // quirks is the reason that library exists. It also brings tab handling and
  // plaintext paste, so this is less code here, not more.
  private attachEditor(): void {
    const code = this.code
    if (!code) return
    this.jar = CodeJar(code, (el) => {
      // hljs skips an element it has already highlighted, and its own pass drops
      // the language class the next one needs.
      delete el.dataset.highlighted
      el.className = `hljs language-${this.language}`
      hljs.highlightElement(el)
    }, { tab: '  ' })
    this.jar.onUpdate((src) => this.schedule(src))
    this.classList.add('is-editable')
  }
}

if (!customElements.get('code-preview')) customElements.define('code-preview', CodePreview)
