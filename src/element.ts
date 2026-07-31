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
// bundle without can be the same element. See code-preview.ts and code-preview-hljs.ts.
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
//   no-toast         no name over the preview when the sample fires a documented event —
//                    for one that fires on every pointermove. The panel still counts it
//   no-shrink        let the preview grow to its tallest measurement and stay there,
//                    for a sample that would otherwise measure short and shift the
//                    page as a font or an image lands
//   reload           always rebuild the frame on edit, never patch it
import { CodeJar } from 'codejar'

// The languages an editor is offered for: the three the frame can actually run. A fence
// in anything else still becomes a pane — a reader may well want `scss` beside the sample
// — it is just read-only, because there is nothing in the frame to type into.
const EDITABLE = /^(html|xml|css|js|javascript)$/

// Which pane a fence's language is. The markup pane is called `code` and not `html`
// because `tab="code"` is what every page that already uses this element writes, and a
// rename would be a breaking change to buy a tidier word.
const PANE_OF: Record<string, string> = {
  html: 'code',
  xml: 'code',
  css: 'css',
  js: 'js',
  javascript: 'js'
}

// What the tab says. Only reached when there is more than one code pane — a lone one is
// labelled `Code`, which is what it has always said.
const PANE_LABEL: Record<string, string> = { code: 'HTML', css: 'CSS', js: 'JS' }

const DEFAULT_HEAD = '<style>body{margin:0;padding:1rem}</style>'

// Everything that can hold focus without being given a tab stop.
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]'

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

// Which way focus is arriving. The hint is advice about a key, so it is for someone who
// got there with keys — a pointer user can click straight back out of the editor and
// does not need a line of text appearing under every sample they click into.
//
// Tracked rather than read off `:focus-visible`: a contenteditable matches that
// pseudo-class on a mouse click too, because a ua assumes anything taking text input
// wants its focus ring. Right for a ring, wrong for this.
//
// On the document and in capture, because the keypress that moves focus into an editor
// lands on whatever had focus before it — which is not this element. Per document, so a
// sample inside an iframe is watched too, and a `WeakSet` so twenty editors on a page
// still add one pair of listeners each.
let keyboardIntent = false
const watched = new WeakSet<Document>()
function watchIntent(doc: Document): void {
  if (watched.has(doc)) return
  watched.add(doc)
  doc.addEventListener('keydown', () => { keyboardIntent = true }, true)
  doc.addEventListener('pointerdown', () => { keyboardIntent = false }, true)
}

const list = (value: string | null): string[] => (value ?? '').split(/\s+/).filter(Boolean)

const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

// A sample that brings its own `<html>` owns its head: pass it through untouched
// rather than injecting a second one around it.
const isDocument = (src: string): boolean => /^\s*<(!doctype|html)\b/i.test(src)

// A markup sample that carries its own `<script>`, which a demo written as one fence has
// to. It reloads for the same reason a url in `js` does; see `render`. `[\s>]` rather than
// `\b`, so `<scriptish>` is not a script.
const hasScript = (src: string): boolean => /<script[\s>]/i.test(src)

// A `</script>` or `</style>` inside the text of the pane being inlined would close the
// tag the text is inside, and the rest of the sample would land in the document as markup.
// The backslash is invisible to both languages wherever the sequence can legally appear —
// inside a string or a comment — and nowhere else is either of them valid anyway.
const inlineSafe = (text: string): string => text.replace(/<\/(script|style)/gi, '<\\/$1')

// Recolor one code block. Called for the first paint of a plain block and again on
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
  opts: { css?: string[], js?: string[], head?: string | null, style?: string, script?: string } = {}
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
  // The css pane, last in head so it outranks both the library's stylesheets and whatever
  // `head` brought — it is the author's own, and it is the one thing here they are typing
  // into. The id is what a css-only edit patches instead of rebuilding the document.
  const style = opts.style ? `<style id="code-preview-sample">${inlineSafe(opts.style)}</style>` : ''
  // The js pane, and `type="module"` is not about scoping. A classic inline script runs
  // while the parser is still going — before the deferred bundles above have defined
  // anything — so a sample that touches a custom element gets an element that has not
  // upgraded, and writing a property on one of those installs an own property that
  // shadows the accessor the class is about to bring. It fails silently and for good. A
  // module is deferred too, and deferred scripts run in document order, so this one runs
  // after every url in `js`.
  const module = opts.script ? `<script type="module">${inlineSafe(opts.script)}</script>` : ''
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    styles + (opts.head ?? DEFAULT_HEAD) + style + scripts +
    '</head><body>' + html + module + '</body></html>'
}

// Show or hide one pane.
//
// Hidden is `until-found` rather than a bare `hidden`, so find-in-page still searches the
// pane nobody is looking at — the sample is the main thing a reader ctrl-Fs for on a docs
// page, and a tab strip that takes it out of reach of the browser's own search would be a
// step backwards from the plain code block this replaces. The stylesheet is what actually
// collapses it, since a browser with no `until-found` support leaves an unknown `hidden`
// value visible.
//
// The tab stop is the other half: a pane with nothing focusable in it cannot be reached by
// keyboard, and so cannot be scrolled either. That is the APG's answer and it is only for
// that case — an editable code block is already focusable, and so is a panel full of
// controls, and a second stop on either would be one to Tab past for nothing.
function showPane(pane: HTMLElement, on: boolean): void {
  if (!on) {
    pane.setAttribute('hidden', 'until-found')
    pane.removeAttribute('tabindex')
    return
  }
  pane.removeAttribute('hidden')
  if (pane.querySelector(FOCUSABLE)) pane.removeAttribute('tabindex')
  else pane.tabIndex = 0
}

// One tab and the box it shows. Code panes come out of the markup — a fence each — and
// carry an editor; the options panel registers one of its own from the other bundle, which
// is why `code` is optional and why this is the only thing the two scripts agree on.
interface Pane {
  name: string
  panel: HTMLElement
  tab: HTMLButtonElement
  code?: HTMLElement
  language?: string
  jar?: ReturnType<typeof CodeJar>
}

// The three texts a frame is built out of. Compared as a whole to decide what an edit
// costs, which is the only reason they travel together.
interface Sources { html: string, css: string, js: string }

export class CodePreview extends HTMLElement {
  // The width buttons write `viewport-width` and the tabs write `tab`, and this is
  // what makes that enough: the attribute is the state, so a click, a script and a
  // hand-written attribute all take the same path.
  static observedAttributes = ['viewport-width', 'tab']

  // Set by the entry file, before it registers the element — an element already in
  // the markup upgrades the moment `define` is called, and its first paint needs
  // this. Left unset the block is still editable and the preview still updates; the
  // code just stops recoloring.
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
  private tablist?: HTMLElement
  // In the order the tabs are shown, which is the order the fences were written in, with
  // the options panel last because it registers itself last.
  private panes = new Map<string, Pane>()
  private code?: HTMLElement
  private language = 'html'
  private uid = `code-preview-${++uid}`
  private resize?: ResizeObserver
  private theme?: MutationObserver
  private timer?: ReturnType<typeof setTimeout>
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
  //
  // All three panes, because which of them moved is what decides between a reload, a patch
  // and a stylesheet write.
  private rendered?: Sources
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
      this.attachEditors()
      return
    }
    this.collectPanes()
    const code = this.code
    if (!code) return

    const frame = document.createElement('iframe')
    frame.className = 'code-preview-frame'
    frame.title = 'Rendered preview'
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
    this.render()

    this.watchTheme()

    const widths = [...new Set(list(this.getAttribute('viewport-widths')).map(Number).filter((width) => width > 0))]
    if (widths.length) this.buildBar(widths)

    this.attachEditors()
    // A block that arrived plain — hand-written markup rather than a fence some site
    // generator already highlighted — gets highlighted here. Blocks that came
    // pre-highlighted keep exactly what they have: re-running hljs is work for an
    // identical result, and any version skew would show up as the whole block
    // reshuffling on load. Last, and after the preview is already wired, so a
    // highlighting problem costs color and not the demo.
    for (const pane of this.panes.values()) {
      if (pane.code && !pane.code.querySelector('span')) this.highlight(pane.code, pane.language)
    }

    // Last of all, and only when the markup says there is a manifest to read: the panel
    // is a second bundle's job, and everything it needs — the code block, the bar, the
    // editor — has to exist before it is asked for.
    if (this.hasAttribute('manifest')) CodePreview.options?.(this)
  }

  attributeChangedCallback(name: string, before: string | null, after: string | null): void {
    if (before === after) return
    if (name === 'tab') {
      this.syncPanes()
      // Nobody else to tell until the options bundle has built a panel — which reads the
      // attribute itself when it does, so an initial `tab="options"` is not missed.
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

  // Every fence in the markup becomes a pane, in document order. One fence is the case
  // this element was written for and stays exactly what it was: a single pane, no strip,
  // nothing hidden.
  //
  // Two queries per block, not one selector list: a list returns the first match in *tree*
  // order, so `'pre code, pre'` hands back the `<pre>` every time — which then gets hljs
  // run over markup containing a `<code>` child, and has its classes overwritten. The
  // `<code>` is what holds the sample; the `<pre>` is the fallback for markup that has none.
  private collectPanes(): void {
    for (const block of this.querySelectorAll<HTMLElement>('pre')) {
      const code = block.querySelector<HTMLElement>(':scope > code') ?? block
      const language = /language-([\w-]+)/.exec(code.className)?.[1]?.toLowerCase() ?? 'html'
      // A language with no pane of its own keeps its own name, so a group can carry a
      // `scss` block beside the css it compiles to. A second fence in a language that
      // already has a pane gets a numbered one — `css2` — rather than being skipped:
      // skipped left the block permanently visible under whichever pane was showing,
      // since only registered panes are hidden. Read-only, because `sources` reads the
      // first; `editable` is what knows that.
      const base = PANE_OF[language] ?? language
      let name = base
      for (let n = 2; this.panes.has(name); n++) name = base + n
      const panel = this.panelOf(code)
      if (!panel) continue
      this.addPane(name, panel, code, language)
    }
    // The markup pane is the sample, and everything that predates the other two — the
    // `source` accessor, the editor's label, the options panel's idea of what it is
    // editing — still means this one.
    const markup = this.panes.get('code')
    this.code = markup?.code
    this.language = markup?.language ?? 'html'
  }

  /**
   * Add a pane and its tab. Public because the options bundle registers its panel this
   * way — the strip is the element's, so that four panes and two panes are the same code.
   *
   * The tab is built here and wired up in `buildTablist`, which is where the difference
   * between one pane and several is decided: a lone code block is not a tabpanel, has no
   * tab pointing at it and gets no strip, because a page with one sample on it is what
   * this element was before any of this and has to stay.
   */
  addPane(name: string, panel: HTMLElement, code?: HTMLElement, language?: string): void {
    if (this.panes.has(name)) return

    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'code-preview-tab'
    tab.id = `${this.uid}-${name}-tab`
    tab.dataset.tab = name
    tab.setAttribute('role', 'tab')
    // The attribute is the state, exactly as `viewport-width` is: a click, a script and
    // hand-written markup all arrive at the same place.
    tab.addEventListener('click', () => this.setAttribute('tab', name))

    this.panes.set(name, { name, panel, tab, code, language })
    this.buildTablist()
    this.syncPanes()
  }

  // The strip appears with the second pane and not before — one pane has nothing to
  // switch between, and a tab strip over a single code block is chrome for its own sake.
  //
  // Labels are decided here rather than at registration because the answer changes as
  // panes arrive: a lone code pane says `Code`, the way it always has, and only a group
  // that actually has more than one says which language each is.
  private buildTablist(): void {
    if (this.panes.size < 2) return

    if (!this.tablist) {
      const tablist = document.createElement('div')
      tablist.className = 'code-preview-tabs'
      tablist.setAttribute('role', 'tablist')
      tablist.setAttribute('aria-label', 'Sample')
      tablist.addEventListener('keydown', this.onTabKey)
      // Prepended, so the tabs sit at the start of the bar whether or not
      // `viewport-widths` has already put its buttons in it.
      this.toolbar.prepend(tablist)
      this.tablist = tablist
      // What the stylesheet keys the hiding off, so that it does not depend on this
      // script having found the right box to put `hidden` on — a copy-button script that
      // runs later wraps that box, and the wrapper would stay.
      this.classList.add('is-tabbed')
    }

    const coded = [...this.panes.values()].filter((pane) => pane.code).length
    for (const pane of this.panes.values()) {
      pane.tab.textContent = pane.code
        ? (coded > 1 ? PANE_LABEL[pane.name] ?? pane.name.toUpperCase() : 'Code')
        : pane.name.replace(/^./, (first) => first.toUpperCase())
      if (pane.tab.parentElement !== this.tablist) this.tablist.appendChild(pane.tab)

      // Everything below is the pairing, and it is done once — the first time this pane
      // finds itself in a strip. The panel keeps an id it arrived with: a docs page may
      // already be linking to that block, and swapping in a generated one breaks a link
      // that used to work.
      if (pane.panel.dataset.pane) continue
      if (!pane.panel.id) pane.panel.id = `${this.uid}-${pane.name}`
      pane.panel.dataset.pane = pane.name
      pane.panel.setAttribute('role', 'tabpanel')
      pane.panel.setAttribute('aria-labelledby', pane.tab.id)
      pane.tab.setAttribute('aria-controls', pane.panel.id)
      // Find-in-page reveals a pane hidden `until-found` on its own; this is how the strip
      // hears about it and stops disagreeing with it. The reader searched for a line of a
      // sample, so the sample is what they get, on the tab that holds it.
      pane.panel.addEventListener('beforematch', () => this.setAttribute('tab', pane.name))
    }
  }

  // Which pane is showing. An unknown `tab` falls back to the first rather than to
  // nothing, so a typo costs the reader a tab and not the sample.
  private get pane(): string {
    const wanted = this.getAttribute('tab') ?? 'code'
    if (this.panes.has(wanted)) return wanted
    return this.panes.keys().next().value ?? 'code'
  }

  private syncPanes(): void {
    if (this.panes.size < 2) return
    const current = this.pane

    // Focus cannot be left in the pane about to be hidden. Hiding the element focus is in
    // drops it on the body, and a keyboard user's next Tab starts again from the top of
    // the page — for a screen reader that is the whole document between them and the
    // widget they were just in. The tab they switched *to* is where it goes, which is
    // where a click would have left it anyway, so the two paths agree.
    //
    // Only when focus really was in there: clicking a tab and arrowing to one have both
    // already focused the button by the time this runs, and find-in-page reveals a pane
    // with focus still on the body. This is for the third caller, a script or an author's
    // markup writing `tab` while the reader is in an editor.
    for (const pane of this.panes.values()) {
      if (pane.name !== current && pane.panel.contains(document.activeElement)) {
        this.panes.get(current)?.tab.focus()
        break
      }
    }

    for (const pane of this.panes.values()) {
      const on = pane.name === current
      pane.tab.setAttribute('aria-selected', String(on))
      // Roving tabindex: one tab stop for the whole list, arrows move within it.
      pane.tab.tabIndex = on ? 0 : -1
      showPane(pane.panel, on)
    }

    // Whether what is showing is a code block or the options panel. The stylesheet needs
    // the answer for the editor's keyboard hint — which describes an editor, and so has no
    // business being on screen on a tab that has none — and only this side knows it.
    this.classList.toggle('is-code-pane', !!this.panes.get(current)?.code)
  }

  // Automatic activation, which is what the APG asks for wherever showing a panel costs
  // nothing — every pane is already in the page. Arrows wrap, as they do in every other
  // APG list, and a modifier held down means the key was meant for the browser.
  private onTabKey = (event: KeyboardEvent): void => {
    const tabs = [...this.panes.values()].map((pane) => pane.tab)
    const from = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (from < 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    const to = event.key === 'ArrowLeft'
      ? (from + tabs.length - 1) % tabs.length
      : event.key === 'ArrowRight'
        ? (from + 1) % tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : -1
    if (to < 0) return
    event.preventDefault()
    tabs[to].focus()
    tabs[to].click()
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
    for (const pane of this.panes.values()) {
      pane.jar?.destroy()
      pane.jar = undefined
    }
    // The frame and the code block survive — they are dom, and this element may be
    // going straight back in. What does not survive is the loaded document: moving an
    // iframe reloads it, and a patch written before that load lands in the old one.
    this.loaded = false
  }

  get source(): string {
    return this.code?.textContent ?? ''
  }

  // What the frame is built out of, read fresh: the editors write into the blocks, so the
  // blocks are the state and there is no copy of it to keep in step.
  private sources(): Sources {
    const text = (name: string): string => this.panes.get(name)?.code?.textContent ?? ''
    return { html: text('code'), css: text('css'), js: text('js') }
  }

  // Replace the sample, from outside the editor. The options panel's attribute knobs
  // are the only caller: an attribute belongs to an element in the sample, so the code
  // block has to keep telling the truth about it, and everything downstream of this is
  // the path a keystroke already takes.
  //
  // CodeJar's `updateCode` writes the text, re-highlights and then calls `onUpdate`
  // itself — which is the same `schedule` the editor is wired to — so the write, the
  // color and the preview all follow from the one call. Without a jar (`no-edit`)
  // there is nothing listening, so all three are done by hand.
  set source(src: string) {
    const pane = this.panes.get('code')
    if (!pane?.code || src === this.source) return
    if (pane.jar) {
      pane.jar.updateCode(src)
    } else {
      pane.code.textContent = src
      this.highlight(pane.code, pane.language)
      this.schedule()
    }
  }

  // The box a tab hides: the `<pre>`, or the `.code-wrap` a copy-button script wrapped
  // it in. Walked up from the block rather than queried, because what sits between the
  // two is the host page's business and there is no list of wrappers to keep — which is
  // also why the blocks are found at any depth and not as direct children.
  private panelOf(code?: HTMLElement): HTMLElement | undefined {
    let node = code
    while (node && node.parentElement !== this) node = node.parentElement ?? undefined
    return node
  }

  // The markup pane's box. Kept as the name it had: the options bundle asks for it, and
  // the sample is what it means.
  get codePanel(): HTMLElement | undefined {
    return this.panelOf(this.code)
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
  // so a keystroke costs nothing. It is wrong wherever a script is involved, which is
  // the same trap from both ends: `innerHTML` never executes scripts it inserts, and a
  // script that already ran — a library from `js`, say — does not re-run against the
  // markup replacing whatever it initialised. Any of the three means a real reload.
  //
  // The sample's own inline `<script>` is the third, and it fails the most quietly of
  // them: the first paint goes through srcdoc and works, and then the first keystroke
  // patches, drops the script on the floor and leaves the demo rendered but dead, with
  // nothing in the console to say why.
  private render(): void {
    const frame = this.frame
    if (!frame) return
    const next = this.sources()
    const last = this.rendered
    if (last && last.html === next.html && last.css === next.css && last.js === next.js) return
    this.rendered = next
    delete this.dataset.error
    // The sample itself changed, so the last measurement no longer describes it — an
    // edit that deletes half the markup has to be able to shrink the preview back.
    this.peak = 0

    // A css-only edit is the cheapest of the three and by far the most common while
    // someone is working on a look: the sample's stylesheet is one element in a head this
    // element put there, so the edit is a write to its text. Nothing reloads, nothing is
    // reparsed, and the sample keeps every bit of the state a rebuild would cost it —
    // a script's variables, an open menu, the control the reader had focused.
    if (this.cssOnly(next, last)) {
      this.applySampleStyle(next.css)
      this.fit()
      return
    }

    // `loaded` is the guard that matters, and the presence of `doc.body` is not:
    // a fresh iframe already holds an about:blank document with a body, so
    // patching before the first real load writes the sample into a blank page —
    // no stylesheet, no load event, and therefore no sizing either.
    const patchable = this.loaded && !isDocument(next.html) && !this.reloads(next)
    if (patchable) {
      // Head is untouched by the body write, so a css edit that debounced in alongside
      // the markup one — typed on one tab, then the other, inside the same 250ms — has
      // to be carried over by hand, or `rendered` records it as applied and it is lost
      // until something else forces a reload.
      if (last && last.css !== next.css) this.applySampleStyle(next.css)
      this.frame!.contentDocument!.body.innerHTML = next.html
      this.fit()
    } else {
      this.loaded = false
      frame.srcdoc = buildSrcdoc(next.html, { ...this.assets, style: next.css, script: next.js })
    }
  }

  // The css pane's stylesheet inside a frame that is already up. Created if the frame was
  // built before there was any css to put in it, and always before the options panel's own
  // sheet, which is appended last so that a knob the reader turns outranks the sample.
  private applySampleStyle(css: string): void {
    const doc = this.frameDocument
    if (!doc) return
    let style = doc.getElementById('code-preview-sample') as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement('style')
      style.id = 'code-preview-sample'
      doc.head.insertBefore(style, doc.getElementById('code-preview-options'))
    }
    style.textContent = css
  }

  // Whether this edit costs a reload rather than a patch. One predicate for both the
  // decision and the debounce in front of it: they were written apart once, and an edit
  // that reloads on a patch's delay is one reload per keystroke.
  //
  // A js pane counts for the same reason a url in `js` does — see `render` — and it counts
  // even while the reader is editing the markup, because patching the body leaves the
  // script that already ran holding elements that are no longer in the document. A whole
  // document counts because `render` can only rebuild it — it was always rebuilt, but on
  // the patch's short leash, which is the one-reload-per-keystroke this list exists to
  // prevent.
  private reloads(next: Sources): boolean {
    return this.assets.js.length > 0 || !!next.js.trim() || hasScript(next.html) ||
      this.hasAttribute('reload') || isDocument(next.html)
  }

  // Whether this edit is a write to the sample's stylesheet and nothing else. One
  // predicate for the decision and the debounce in front of it, for the same reason
  // `reloads` is one: written apart, the debounce called a document sample's css edit
  // cheap while `render` reloaded it — one reload per keystroke, on the short delay.
  // `isDocument` is part of it because a sample that owns its whole document owns its
  // head, and there is no `<style>` of ours in there to write to.
  //
  // `last` is a parameter because `render` has already overwritten `this.rendered` by
  // the time it asks — it compares against the copy it took first.
  private cssOnly(next: Sources, last = this.rendered): boolean {
    return !!last && this.loaded && last.html === next.html && last.js === next.js && !isDocument(next.html)
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    const next = this.sources()
    // A css-only edit is neither a reload nor a patch, and it is the one an author makes
    // in bursts — the shorter delay is the one that makes it feel live.
    const delay = !this.cssOnly(next) && this.reloads(next) ? RELOAD_DELAY : PATCH_DELAY
    this.timer = setTimeout(() => this.render(), delay)
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
  // tears the editors down and has to put them back.
  private editable(pane: Pane): boolean {
    if (this.hasAttribute('no-edit') || !pane.code || !EDITABLE.test(pane.language ?? '')) return false
    // Only the pane the frame is built from: a second fence in the same language has a
    // tab under a numbered name, but `sources` reads the first — an editor on the second
    // would take keystrokes and render none of them.
    if (PANE_OF[pane.language ?? ''] !== pane.name) return false
    // A sample that owns its whole document owns its head and body: `buildSrcdoc` hands
    // it back untouched, so a css or js pane has nowhere to land — read-only is the
    // honest version of an editor that changes nothing.
    // ponytail: judged when editors attach — markup edited *into* a full document later
    // keeps the editors it has. The sample itself still reloads correctly either way.
    return pane.name === 'code' || !isDocument(this.source)
  }

  // Which pane an event happened in. The listeners are on the host, so every one of them
  // has to ask — an Escape pressed on a width button is not an Escape in an editor.
  private paneAt(node: EventTarget | null): Pane | undefined {
    for (const pane of this.panes.values()) {
      if (pane.code?.contains(node as Node)) return pane
    }
    return undefined
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
  private attachEditors(): void {
    let any = false
    for (const pane of this.panes.values()) {
      if (pane.jar || !this.editable(pane)) continue
      pane.jar = CodeJar(pane.code!, (element) => this.highlight(element, pane.language), { tab: '  ' })
      // The text is read back off the blocks, so which pane reported the keystroke does
      // not matter — only that one of them did.
      pane.jar.onUpdate(() => this.schedule())
      this.describeEditor(pane)
      any = true
    }
    if (!any) return
    // Capture, and on the host rather than the blocks: a listener added to a block
    // itself runs after CodeJar's, which has already called `preventDefault` on the
    // Tab by then. Both are stable references, so reconnecting cannot double them up.
    this.addEventListener('keydown', this.releaseTab, true)
    this.addEventListener('focusin', this.showHint, true)
    this.addEventListener('focusout', this.catchTab, true)
    watchIntent(this.ownerDocument)
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
    // Only a key pressed in an editor: the listener is on the host, so an Escape in the
    // options panel or on a width button would otherwise flip the editor's Tab handling —
    // and rewrite a hint about an editor the reader is not in.
    const pane = this.paneAt(event.target)
    if (!pane) return
    // Clicked in, then started typing: someone who arrived by pointer is a keyboard user
    // now, and the next Tab indents on them like everyone else's. Late is the right time
    // for the hint to turn up; never is not.
    this.classList.add('is-key-focus')
    if (event.key !== 'Escape' || event.defaultPrevented) return
    pane.jar?.updateOptions({ catchTab: false })
    // Pressing Escape is otherwise silent, and a key that appears to do nothing is a key
    // nobody presses twice. The hint is already on screen, so saying it there costs a
    // string and no layout.
    if (this.hint) this.hint.textContent = TAB_FREE
  }

  // The visible half of the hint, gated on how focus got here. The `aria-describedby` is
  // not gated with it: a screen reader is a keyboard, and the description is read on
  // arrival either way.
  private showHint = (event: FocusEvent): void => {
    if (!this.paneAt(event.target)) return
    this.classList.toggle('is-key-focus', keyboardIntent)
  }

  // Focus leaving anything in the element, which is a superset of focus leaving an
  // editor — harmless, because a move within one fires the `focusin` above straight after.
  // Every editor is re-armed and not only the one being left: they share the hint, so they
  // have to agree about what it says.
  private catchTab = (): void => {
    this.classList.remove('is-key-focus')
    for (const pane of this.panes.values()) pane.jar?.updateOptions({ catchTab: true })
    if (this.hint) this.hint.textContent = TAB_CAUGHT
  }

  // What a screen reader is told this block is, and how to get back out of it.
  //
  // `role="textbox"` because a contenteditable is exposed inconsistently without one,
  // and it also makes the highlighter's spans presentational — which is right: the
  // sample is its text, and the colors are decoration. `aria-multiline` because the
  // default for a textbox is a single line, and a code sample is not that.
  //
  // The name is left alone if the markup brought one: a docs page that has already
  // labelled the block knows what the sample is better than a language name does.
  //
  // The hint is the WCAG 2.1.2 advisory, and it has to reach two audiences that need
  // two different things — `aria-describedby` says it on focus for a screen reader,
  // and the stylesheet shows the same element while the block has focus, because a
  // sighted keyboard user is just as stuck and hears nothing.
  private describeEditor(pane: Pane): void {
    const code = pane.code!
    code.setAttribute('role', 'textbox')
    code.setAttribute('aria-multiline', 'true')
    // The one key in here that is not a key anywhere else. A shortcut that exists only in
    // a description is a shortcut nobody can look up; this is the field made for it.
    code.setAttribute('aria-keyshortcuts', 'Escape')
    if (!code.hasAttribute('aria-label') && !code.hasAttribute('aria-labelledby')) {
      code.setAttribute('aria-label', `Editable ${pane.language} sample`)
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
  private highlight(element: HTMLElement, language = this.language): void {
    CodePreview.highlighter?.(element, language)
  }
}

// Registration is the entry file's job — it has to set the highlighter first.
export function define(): void {
  if (!customElements.get('code-preview')) customElements.define('code-preview', CodePreview)
}
