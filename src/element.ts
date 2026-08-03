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
//   no-edit          render the preview, leave the code read-only. With a value, only the
//                    panes it names — `no-edit="css js"`, by tab name or fence language.
//                    A single fence can also say it itself, as `no-edit` on the block or
//                    as a bare token in a markdown fence's info string
//   no-toast         no name over the preview when the sample fires a documented event —
//                    for one that fires on every pointermove. The panel still counts it
//   no-console       no console strip under the preview, and no console hook in the
//                    frame — for a sample that logs on every frame and would scroll forever
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

// Rewires the frame's console and forwards every call to the host as a CustomEvent on the
// iframe itself — `frameElement` is the same-origin way back out, and the host put a
// listener on the frame before any document was in it.
//
// An inline classic script, first in head, because that is the one thing that runs during
// the parse — ahead of every deferred url in `js` and of the body's own module — so a
// sample's top-level `console.log` is caught too. Wrapping the console from the *host* on
// the frame's load event looks simpler and silently is not: load fires after the sample
// has run, which is exactly when most demos have already said the interesting thing.
//
// The try is a frame mid-teardown: a log fired from a timer while the document is being
// replaced has no `frameElement` left to reach.
const CONSOLE_HOOK = '<script>for(const l of ["log","info","warn","error","debug"]){' +
  'const n=console[l].bind(console);console[l]=(...a)=>{n(...a);' +
  'try{frameElement.dispatchEvent(new CustomEvent("code-preview-log",{detail:{level:l,args:a}}))}catch{}}}</script>'

// How much console a strip holds before the oldest line falls off. A demo that logs more
// than this is a demo being profiled, and the browser's own console is where that reads.
const LOG_LIMIT = 100

// One console argument on one line, formatted in the parent realm from values born in the
// frame's — so no `instanceof` anywhere: a frame's `Element` and `Error` are different
// classes from this document's, and a `localName` or a `message` is what a node or an
// error has in every realm. Strings print bare, the way a console prints them.
const logText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'function') return 'ƒ'
  if (value && typeof value === 'object') {
    const known = value as { localName?: unknown, message?: unknown, name?: unknown }
    if (typeof known.localName === 'string') return `<${known.localName}>`
    if (typeof known.name === 'string' && typeof known.message === 'string') {
      return `${known.name}: ${known.message}`
    }
    // Cycles throw, and a value JSON cannot say (a symbol-keyed bag) comes back
    // undefined; both fall through to the default stringification.
    try {
      return JSON.stringify(value) ?? String(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

// Everything that can hold focus without being given a tab stop.
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]'

// A patch lands in the frame that is already loaded, so it can follow the typing. A
// rebuild cannot follow anything: see `schedule` for why it waits to be asked.
const PATCH_DELAY = 250

// The hint each editor is described by needs an id of its own, and a docs page has as
// many editors as it has samples.
let uid = 0

// The way in and the way out, said the same way to a screen reader and to the screen. Two
// states of one sentence, in one element: whichever is true is the one a description would
// be read out of, and a reader only ever gets to the second by having acted on the first.
//
// Tab indents once the editor is open, so Escape closes it outright rather than handing
// Tab back one press at a time — a block that is only editable because somebody asked has
// a state to leave, and leaving it is a better answer than staying in a text field that
// has quietly stopped catching Tab.
const HINT_CLOSED = 'Press Enter to edit'
const HINT_OPEN = 'Press Esc to stop editing'

// Escape is the way out of the editor; the other two apply what is pending. Both are
// always real in an editor — with nothing waiting they are a no-op rather than a lie —
// so unlike the Run button they are claimed for every editable block.
const EDITOR_KEYS = 'Escape Control+Enter Meta+Enter'

// Octicons at 16, the set the surrounding docs themes already draw from — buttons this
// element adds beside a theme's own copy button should not be a second visual language.
// Inline rather than a sprite or a font: the element is one script and one stylesheet,
// and an icon that arrives over the network is an icon that arrives late.
const ICON = {
  edit: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"></path></svg>',
  // A bare play triangle, drawn here rather than taken from the set: Octicons has no play
  // glyph, and `triangle-right` is a disclosure arrow — sized for the end of a summary
  // line, not for a button of its own, where it reads as a quarter of the box.
  run: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M5 2.75 13 8l-8 5.25Z"></path></svg>'
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
  opts: { css?: string[], js?: string[], head?: string | null, style?: string, script?: string, lang?: string, console?: boolean } = {}
): string {
  if (isDocument(html)) return html
  // The console hook, first thing after the charset so nothing can log before it is
  // wired. Off only when asked (`no-console`) — a sample that owns its whole document
  // never gets one either, since it owns its head; that is the passthrough above.
  const hook = opts.console === false ? '' : CONSOLE_HOOK
  // The host page's language, carried onto the frame's `<html>`: a screen reader picks
  // its voice per document, and a frame that does not say is read in the user's default —
  // wrong exactly where the docs page said otherwise. The `<title>` is the same claim at
  // the document level that the iframe's `title` attribute makes at the frame level, and
  // checkers ask for both.
  const lang = opts.lang ? ` lang="${attr(opts.lang)}"` : ''
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
  return '<!DOCTYPE html><html' + lang + '><head><meta charset="utf-8"><title>Preview</title>' + hook +
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
  // The `contenteditable` value CodeJar chose for this block, taken off it once and then
  // taken away — see `attachEditors`. Its presence is also how "this pane has an editor
  // waiting behind the Edit button" is asked about without re-running `editable`.
  editMode?: string
  // What the fence said about itself, read once when the pane is registered rather than
  // off the block on demand: a highlighter rewrites `className` wholesale — hljs does —
  // so a `no-edit` written as a class is gone by the second time anyone asks.
  locked?: boolean
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
  // The wrapper width the last fit ran against. The wrapper is observed for its *width*
  // — that is what an emulated viewport is scaled against — but writing the measured
  // height onto it fires the same observer, and treating that echo as news is how a
  // feedback loop starts; see `onFrameLoad`.
  private vpWidth = -1
  private theme?: MutationObserver
  private timer?: ReturnType<typeof setTimeout>
  // The keyboard hint, once there is an editor to hint about. Kept for its id, which is
  // what an open editor's `aria-describedby` points at.
  private hint?: HTMLElement
  // The strip above the code — the tabs', and only the tabs'. Separate from `bar`, which
  // is the preview's: these belong to the code, so they sit against it.
  private codeStrip?: HTMLElement
  // The buttons in the code block's bottom corner. Not in the strip above: they act on the
  // block, so they sit on it, and the corner is where a docs theme has already taught
  // readers to look for a control belonging to a code block.
  private actions?: HTMLElement
  private edit?: HTMLButtonElement
  // Whether `buildActions` has had its turn. A flag rather than a look at what it built,
  // because `no-actions` can leave it having built nothing, and "nothing" is not a state
  // the dom can be asked about.
  private madeActions = false
  // The pane currently open for editing, and the whole of that state: at most one at a
  // time, since Edit acts on the block that is showing and switching tabs closes it.
  private editing?: Pane
  // Whether the open editor's `aria-label` is ours to take back — a markup-supplied one
  // is not, and `exitEdit` must not strip a name the page put there itself.
  private labelled = false
  // The error banner, once a sample has thrown. Kept so a later error reuses the box.
  private errorBox?: HTMLElement
  // The console strip, once a sample has logged. Built on the first line, like the
  // banner: a sample that never logs pays no box for it.
  private logBox?: HTMLElement
  // The rebuild button, once this sample is one that can need it. Built on demand rather
  // than with Edit, because whether a sample runs anything is a question about its text,
  // and its text is edited — see `buildRun`.
  private run?: HTMLButtonElement
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
      this.buildActions()
      return
    }
    this.collectPanes()
    const code = this.code
    if (!code) return

    const frame = document.createElement('iframe')
    frame.className = 'code-preview-frame'
    // Named per sample rather than one string for every frame: a docs page has as many
    // previews as it has samples, and a screen reader's frame list with twenty entries
    // saying the same thing distinguishes none of them.
    frame.title = `Rendered ${this.labelOf(this.panes.get('code'))}`
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
    // The other end of CONSOLE_HOOK: the frame's rewired console dispatches on the iframe
    // itself, which is the one element both realms can name. On before any document is in
    // the frame, so the earliest inline log already has a listener.
    frame.addEventListener('code-preview-log', this.onFrameLog)

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
    // After the editors, which is what decides whether there is anything for these to act
    // on — and after `buildRun` has had its chance to say this sample runs something, so
    // that the pair is built in one go rather than Run arriving on its own and Edit
    // inserting itself in front of it.
    this.buildActions()
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

    // `no-edit` on the fence itself, which is the shorter thing to write when the fences
    // are the markup. As a class because that is what a bare token in a markdown fence's
    // info string already becomes — ```` ```css no-edit ```` — and as an attribute for
    // markup written by hand, on the block or on the `<pre>` around it.
    const locked = !!code && (code.matches('.no-edit, [no-edit]') || panel.matches('[no-edit]'))

    this.panes.set(name, { name, panel, tab, code, language, locked })
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
      // Prepended, so the tabs sit at the start of the strip whether or not the action
      // buttons have already been put in it.
      this.codeBar.prepend(tablist)
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

    // An editor about to be hidden is closed first. Left open it is a text field nobody can
    // see, holding focus behind a collapsed pane and pointing `aria-describedby` at a hint
    // about a block that is not on screen — and the reader's way out of it, the Edit
    // button, has by then switched to meaning the pane they moved to.
    //
    // Closed, but not necessarily *left*: a reader who opened the editor and then went to
    // the css tab is editing the sample, not that one block, so the mode follows them onto
    // any pane that can take it — reopened below, once the panes have switched. A pane
    // that cannot (the options panel, a read-only fence) is the way out it always was.
    //
    // Before the focus handling below, and not after: `exitEdit` puts focus on the Edit
    // button, which is a child of the host and not of any panel, so the loop that follows
    // correctly finds nothing left to rescue.
    const followed = !!this.editing && this.editing.name !== current
    if (followed) this.exitEdit()

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

    // Whether what is showing is an *editable* code block. The stylesheet needs the answer
    // for the buttons and the keyboard hint — both describe an editor, and so have no
    // business sitting on a block that has none — and only this side knows it. An editor
    // and not merely `code`, because a pane `no-edit` names has no more editor in it than
    // the options panel does, and an Edit button on it would open the markup instead,
    // which is not the block the reader is looking at.
    this.classList.toggle('is-code-pane', !!this.panes.get(current)?.editMode)

    // Whether the pane showing is one whose edits wait on Run; see `syncRunPane`.
    this.syncRunPane()

    // The editor the reader had open, reopened on the pane they moved to — after the
    // panes have switched, so `enterEdit` finds the new one showing. Without focus: a
    // click's focus is on the tab, and arrow keys are mid-flight along the strip, so the
    // block lighting up must not pull either off it.
    if (followed && this.panes.get(current)?.editMode) this.enterEdit(false)
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

  // Two strips, and which one a control belongs in is decided by what it acts on rather
  // than by what fits. The widths re-render the preview, so they sit above the preview.
  // The tabs choose which block is showing, so they sit against the code — above it, where
  // a tab strip has to be to read as its label. Edit and Run are in neither: they act on
  // the block itself, so they sit on it, in its bottom corner.
  //
  // One `<div>` each, both `.code-preview-bar`: the stylesheet tells them apart by which
  // side of the viewport they are on, which is also the only thing that differs about
  // them — a bar above the preview owns the widget's top corners, and one below it is a
  // seam between two boxes.

  // The preview's strip. Kept as `toolbar`, the name it is documented under.
  get toolbar(): HTMLElement {
    if (!this.bar) {
      const bar = document.createElement('div')
      bar.className = 'code-preview-bar'
      this.prepend(bar)
      this.bar = bar
    }
    return this.bar
  }

  // The code's strip. After the viewport if there is one — the panes follow it, so this
  // lands between the preview and the block it belongs to — and otherwise at the front,
  // which is the same place for an element whose preview has not been built yet.
  get codeBar(): HTMLElement {
    if (!this.codeStrip) {
      const bar = document.createElement('div')
      bar.className = 'code-preview-bar'
      if (this.viewport) this.viewport.after(bar)
      else this.prepend(bar)
      this.codeStrip = bar
    }
    return this.codeStrip
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
    // Closed rather than left open across the move: `attachEditors` builds new jars on the
    // way back in, and an editor whose jar has been destroyed under it is a block still
    // carrying `contenteditable` and a `role` with nothing listening behind either.
    this.exitEdit()
    for (const pane of this.panes.values()) {
      pane.jar?.destroy()
      pane.jar = undefined
      pane.editMode = undefined
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
  //
  // Either way it is scheduled again, forced: the one `updateCode` triggered came in as
  // typing and would have been held back in a sample that reloads. Nobody typed this —
  // the reader turned a knob, which is the asking that `schedule` holds out for.
  set source(src: string) {
    const pane = this.panes.get('code')
    if (!pane?.code || src === this.source) return
    if (pane.jar) {
      pane.jar.updateCode(src)
    } else {
      pane.code.textContent = src
      this.highlight(pane.code, pane.language)
    }
    this.schedule(true)
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
    // CodeJar reports an update on every keyup, not only the ones that changed something —
    // Escape, Tab, the arrows and every modifier arrive saying the same text they said
    // before, and rendering that reloads the document for a sample that did not move.
    // `runNow` clears `rendered` to get past this on purpose: Run is allowed to re-run
    // something unchanged, because that is what it is for.
    if (last && last.html === next.html && last.css === next.css && last.js === next.js) return
    this.rendered = next
    this.clearError()
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
      // Before the write, not on the next load event: the new document logs *during* its
      // parse — the hook is first in head so nothing can log ahead of it — and a clear
      // that waits for `load` arrives after those lines and wipes them.
      this.clearLog()
      frame.srcdoc = buildSrcdoc(next.html, {
        ...this.assets,
        style: next.css,
        script: next.js,
        lang: document.documentElement.lang,
        console: !this.hasAttribute('no-console')
      })
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
    return this.runs(next) || isDocument(next.html)
  }

  // Whether applying this edit would execute code. The narrower question, and the one the
  // Run button is about: markup and css are inert, so they are applied as they are typed,
  // and this is everything that is not.
  //
  // An inline `<script>` counts even though it was typed in the markup pane — it is js,
  // and a single-fence js demo is exactly where it lives. So does a `js` asset, because a
  // library that already ran does not re-run against markup replacing what it initialised.
  //
  // `isDocument` is deliberately not here, though it is in `reloads`. A sample that owns
  // its whole document can only ever be rebuilt, but rebuilding one that runs nothing
  // costs a reparse and nothing else — so it keeps the live typing that markup gets, and
  // a script in it is caught by `hasScript` like any other.
  private runs(next: Sources): boolean {
    return this.assets.js.length > 0 || !!next.js.trim() || hasScript(next.html) ||
      this.hasAttribute('reload')
  }

  // Whether this edit is a write to the sample's stylesheet and nothing else. One
  // predicate for the decision and the debounce in front of it, for the same reason
  // `reloads` is one: written apart, the debounce called a document sample's css edit
  // cheap while `render` reloaded it — one reload per keystroke, on the short delay.
  // `isDocument` is part of it because a sample that owns its whole document owns its
  // head, and there is no `<style>` of ours in there to write to.
  //
  // `last` is a required parameter and deliberately has no default. `render` has already
  // overwritten `this.rendered` by the time it asks, so it compares against the copy it
  // took first — and that copy is legitimately `undefined` on a first render or after
  // `runNow` has cleared it. A default would swallow exactly those two cases and answer
  // them with `this.rendered`, which by then is `next`: every field equal to itself, so
  // `true`, so a rebuild silently downgraded to a stylesheet write.
  private cssOnly(next: Sources, last: Sources | undefined): boolean {
    return !!last && this.loaded && last.html === next.html && last.js === next.js && !isDocument(next.html)
  }

  // Whether typing this text is typing code that would run: the js pane's own text, or
  // markup carrying an inline `<script>`. Only these wait on the Run button — a srcdoc
  // frame is same-origin, so half-typed js (`while (true` with the paren still to come)
  // hangs the whole tab, and no debounce makes that safe; it only decides how long the
  // reader gets before it happens.
  //
  // A url in `js` or the `reload` attribute still costs a rebuild (see `reloads`), but
  // the text being typed there is inert markup, and the js that re-runs comes from its
  // own pane or its own file — complete and valid, never mid-statement. What the rebuild
  // costs is the sample's live state, which is real, and which following the typing was
  // judged worth: the reader watching a preview not move until they find a button is the
  // worse failure for the two panes whose whole point is that they are not code.
  private hazard(from: string | undefined, next: Sources): boolean {
    if (from === 'js') return true
    return from === 'code' && hasScript(next.html)
  }

  // Markup and css follow the typing on a short delay: the frame is patched, its
  // stylesheet written to — a css edit is the one an author makes in bursts, which is why
  // `cssOnly` is asked first — or, for a sample that runs something, rebuilt whole.
  //
  // The `hazard` edits are the exception: those are offered rather than performed, and
  // the Run button is how they are asked for. `force` is the options panel writing
  // through `source`: turning a knob is already the reader asking, and a knob that did
  // nothing until a second click would be a bug.
  private schedule(force = false, from?: string): void {
    if (this.timer) clearTimeout(this.timer)
    const next = this.sources()
    this.syncRunPane()
    if (!force && !this.cssOnly(next, this.rendered) && this.hazard(from, next)) {
      // Nothing is scheduled and nothing is remembered about the edit: the button is
      // always live and always re-runs from whatever the blocks say when it is pressed,
      // so there is no pending state for this to keep.
      this.buildRun()
      return
    }
    this.timer = setTimeout(() => this.render(), PATCH_DELAY)
  }

  // Whether the pane the reader is looking at is one whose edits wait on Run — the js
  // pane, or markup that carries its own `<script>`, which is the single-fence js demo.
  // The class is the stylesheet's whole basis for the button: shown on that pane, absent
  // everywhere else, since edits anywhere else apply as they are typed and a button with
  // nothing to do is one to wonder about.
  private syncRunPane(): void {
    const current = this.pane
    this.classList.toggle('is-js-pane', current === 'js' ||
      (current === 'code' && hasScript(this.panes.get('code')?.code?.textContent ?? '')))
  }

  // Run means run, and it means it every time. Not "apply the edit" — pressed twice on a
  // sample nobody has touched it starts the demo over both times, which is most of what
  // anyone wants from a js sample: the counter back to zero, the animation from the top.
  // Forgetting what the frame holds is what lets `render` do the work it would otherwise
  // skip as already applied.
  //
  // On a sample with nothing to re-run — a markup or css pane, reached by the keyboard
  // shortcut — it means the smaller thing: stop waiting on the debounce and apply now.
  //
  // Keyed off what the sample is rather than off whether the button exists, because
  // `no-actions="run"` can take the button away and leave the shortcut as the only way to
  // apply a js edit. Without that, dropping the button would leave those edits with
  // nowhere to go.
  private runNow = (): void => {
    if (this.timer) clearTimeout(this.timer)
    if (this.runs(this.sources())) this.rendered = undefined
    this.render()
  }

  // One button, made the same way every time: the glyph, then the word for it. Icon-only
  // was a guess the reader had to hover to check, and these sit on the sample rather than
  // in a toolbar with a shape to learn — a word costs two characters of width and takes the
  // guessing away. It is also the accessible name, so there is no `aria-label` to drift out
  // of step with what the button says, and no `title` repeating either of them.
  //
  // The svg stays `aria-hidden`: it is the label drawn twice, and a screen reader that
  // picked it up would read it twice.
  private action(name: string, label: string, icon: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `code-preview-action code-preview-${name}`
    button.innerHTML = icon
    const text = document.createElement('span')
    text.textContent = label
    button.appendChild(text)
    button.addEventListener('click', onClick)
    this.actionGroup.appendChild(button)
    return button
  }

  // The pair in the code block's bottom corner, in the order the reader reaches for them:
  // get into the code, run the code. A child of the host rather than of the block, for the
  // reason the keyboard hint is one — a copy-button script reading the block's `innerText`
  // would otherwise put a button's accessible name on the clipboard, and `sources()` reads
  // that same text as the sample itself.
  private get actionGroup(): HTMLElement {
    if (!this.actions) {
      const actions = document.createElement('div')
      actions.className = 'code-preview-actions'
      // A group and not a toolbar, for the reason the widths are a group: these are plain
      // buttons, and the richer role obliges arrow-key navigation they do not need.
      actions.setAttribute('role', 'group')
      actions.setAttribute('aria-label', 'Sample actions')
      this.appendChild(actions)
      this.actions = actions
    }
    return this.actions
  }

  // Both buttons belong to the editor and neither one is built without it. A locked sample
  // is a code block on a docs page: the theme's own copy button is the whole of what it
  // needs, and a preview that renders once and never changes has nothing to re-run.
  //
  // Nothing to build means specifically no `actionGroup`: reading that getter is what puts
  // the box in the page, and an empty one is a reserved strip under every code block on the
  // page for nothing.
  private buildActions(): void {
    if (this.madeActions) return
    this.madeActions = true
    if (!this.hasEditor || !this.allows('edit')) return
    this.edit = this.action('edit', 'Edit', ICON.edit, this.toggleEdit)
    // A toggle and not a one-way door: pressing it again is how a pointer user gets back
    // out, since Escape is the keyboard's answer and a mouse has no Escape.
    this.edit.setAttribute('aria-pressed', 'false')
  }

  // Whether any pane has an editor waiting behind the button. `editMode` and not
  // `editable`, so this stays true to what was actually built — `attachEditors` runs first
  // and is the one place that decision is made.
  private get hasEditor(): boolean {
    return [...this.panes.values()].some((pane) => pane.editMode)
  }

  // Whether the page asked for this button. `no-actions` is spelled the way `no-edit` is,
  // because it is the same kind of decision and a second vocabulary for it would be one to
  // learn for nothing: bare turns both buttons off, and given names to drop —
  // `no-actions="run"` — it drops those and keeps the rest.
  private allows(action: string): boolean {
    const off = this.getAttribute('no-actions')
    if (off === null) return true
    const names = list(off.toLowerCase())
    return names.length > 0 && !names.includes(action)
  }

  private toggleEdit = (): void => {
    if (this.editing) this.exitEdit()
    else this.enterEdit()
  }

  // Into the code, from wherever the reader is. The pane already showing wins if it can be
  // typed into — Edit on the CSS tab means that stylesheet, not the markup — and otherwise
  // this switches to the first pane that can be, which is what makes it the way back from
  // the options panel.
  //
  // Everything a text field needs is put on the block here rather than at upgrade, because
  // until this moment the block is not one: a `role="textbox"` on something that takes no
  // keystrokes is a promise to a screen reader that the page cannot keep.
  //
  // `focus` is false only when the mode is following the reader across a tab switch,
  // where their focus is on the strip and belongs there.
  private enterEdit(focus = true): void {
    const showing = this.panes.get(this.pane)
    const target = showing?.editMode
      ? showing
      : [...this.panes.values()].find((pane) => pane.editMode)
    if (!target?.code || !target.editMode) return
    if (this.pane !== target.name) this.setAttribute('tab', target.name)
    const code = target.code
    this.editing = target
    code.setAttribute('contenteditable', target.editMode)
    code.setAttribute('role', 'textbox')
    // The textbox's name, worn for exactly as long as the role is: at rest the block is a
    // `code` element, whose ARIA role prohibits naming — the label lived there permanently
    // once, and that is a checker flag on every sample of every page. The markup's own
    // label still wins, and is not ours to take back on the way out.
    if (!code.hasAttribute('aria-label') && !code.hasAttribute('aria-labelledby')) {
      code.setAttribute('aria-label', this.labelOf(target))
      this.labelled = true
    }
    // The default for a textbox is a single line, and a code sample is not that.
    code.setAttribute('aria-multiline', 'true')
    // The keys in here that are not keys anywhere else. A shortcut that exists only in a
    // description is a shortcut nobody can look up; this is the field made for it.
    code.setAttribute('aria-keyshortcuts', EDITOR_KEYS)
    if (this.hint) {
      code.setAttribute('aria-describedby', this.hint.id)
      // The sentence flips with the state. A description is read when focus arrives and not
      // again, and focus does arrive — on the block, which is a different element from the
      // `pre` that was describing itself a moment ago — so each read gets the true half.
      this.hint.textContent = HINT_OPEN
    }
    this.classList.add('is-editing')
    this.edit?.setAttribute('aria-pressed', 'true')
    if (focus) code.focus()
  }

  // Back to a code block: not editable, not focusable, nothing announced about it. The
  // sample is applied on the way out — closing the editor is the second way to ask for a
  // run, the Run button being the first.
  private exitEdit(): void {
    const pane = this.editing
    if (!pane?.code) return
    const code = pane.code
    // Asked before the attribute goes, since removing it is what makes the block stop
    // being focusable — and a browser left with focus on a node that cannot hold it drops
    // it on the body, which restarts a keyboard user's next Tab from the top of the page.
    const inside = code.contains(this.ownerDocument.activeElement)
    this.editing = undefined
    for (const name of ['contenteditable', 'role', 'aria-multiline', 'aria-keyshortcuts', 'aria-describedby']) {
      code.removeAttribute(name)
    }
    if (this.labelled) {
      code.removeAttribute('aria-label')
      this.labelled = false
    }
    this.classList.remove('is-editing')
    this.edit?.setAttribute('aria-pressed', 'false')
    if (this.hint) this.hint.textContent = HINT_CLOSED
    // Back to the `pre`, which is a tab stop again the moment the editor is off the block
    // inside it — the reader carries on from where they were rather than from wherever a
    // button happens to sit, and Enter from there opens it again. Dropping focus is not an
    // option: the body is where a keyboard user's next Tab starts the whole page over.
    if (inside) (code.parentElement ?? this.edit)?.focus()
    // Not `runNow`: that one clears `rendered` to force a rebuild of a sample that did not
    // move, which is right for a button somebody pressed and wrong here — closing an
    // editor nobody typed in would restart a demo that was mid-animation. `render` skips
    // an unchanged sample on its own, so this is "apply whatever is different, if
    // anything", and the pending debounce is flushed into it.
    //
    // Not on the way out of the dom, though — `disconnectedCallback` closes the editor
    // too, and a frame that is being taken off the page has no business reloading first.
    if (this.timer) clearTimeout(this.timer)
    if (this.isConnected) this.render()
  }

  // Built the first time this sample is one that runs something — which is a question
  // about its text, so it can become true at the keystroke that types `<script>` into a
  // sample that had none. `attachEditors` builds it up front wherever the answer is
  // already yes, so that the common case is a button that was always there rather than one
  // appearing under the reader's hands.
  //
  // Appended after Edit, so the pair reads edit, run however late this one arrives.
  private buildRun(): void {
    if (this.run || !this.allows('run')) return
    // Ordering rather than politeness: this can be the first thing to touch the group, and
    // Edit belongs in front of it whenever there is one.
    this.buildActions()
    if (!this.hasEditor) return
    this.run = this.action('run', 'Run', ICON.run, this.runNow)
  }

  // The banner under the code block. A real element rather than the `::after` it once
  // was, because generated content changes silently: `role="alert"` is what makes a
  // script error something a screen reader hears at the moment it happens, and the
  // reader who just typed the edit is the one audience this banner exists for. It is
  // also selectable now, and an error message is the one string here worth copying into
  // a search box. `data-error` stays alongside it — the stylesheet keys the corner radii
  // off the attribute, and so may a host page's.
  private showError(message: string): void {
    this.dataset.error = message
    if (!this.errorBox) {
      const box = document.createElement('p')
      box.className = 'code-preview-error'
      box.setAttribute('role', 'alert')
      this.appendChild(box)
      this.errorBox = box
    }
    this.errorBox.hidden = false
    this.errorBox.textContent = message
  }

  private clearError(): void {
    delete this.dataset.error
    if (this.errorBox) {
      this.errorBox.hidden = true
      this.errorBox.textContent = ''
    }
  }

  // A line out of the frame's console. The strip is not a live region by class alone —
  // `role="log"` is, politely, which is exactly a console's temperament: additions are
  // announced, nothing re-reads, and `no-console` is the answer for a sample that would
  // not shut up. Under the preview rather than a pane of its own, so the logs are on
  // screen while the reader types the js that causes them.
  private onFrameLog = (event: Event): void => {
    if (this.hasAttribute('no-console')) return
    const { level, args } = (event as CustomEvent<{ level?: unknown, args?: unknown }>).detail ?? {}
    if (typeof level !== 'string' || !Array.isArray(args)) return

    if (!this.logBox) {
      const box = document.createElement('div')
      box.className = 'code-preview-console'
      box.setAttribute('role', 'log')
      box.setAttribute('aria-label', 'Console')
      box.hidden = true
      // Directly under the preview, whatever else the stack holds — `after` on the
      // viewport lands it ahead of the tab strip that was put there at upgrade.
      this.viewport?.after(box)
      this.logBox = box
    }
    const box = this.logBox

    const line = document.createElement('p')
    line.className = 'code-preview-console-line' +
      (level === 'error' ? ' is-error' : level === 'warn' ? ' is-warn' : '')
    line.textContent = args.map(logText).join(' ')

    // Follow the tail only if the reader was at it: a console that yanks the scroll back
    // down while they read an old line is worse than one that falls behind.
    const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 8
    box.appendChild(line)
    while (box.children.length > LOG_LIMIT) box.firstElementChild?.remove()
    if (stick) box.scrollTop = box.scrollHeight
    box.hidden = false
  }

  // A rebuilt frame is a new document and a new run of the sample, so the strip starts
  // over with it — the devtools default, and the same bargain the event counts make.
  // A patched frame keeps its document and so keeps its log.
  private clearLog(): void {
    if (this.logBox) {
      this.logBox.replaceChildren()
      this.logBox.hidden = true
    }
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
      // The frame's document is always worth re-measuring — a report from it means the
      // sample itself changed size. The wrapper is only worth it when its *width* moved:
      // its height is what `measure` writes, so a height-only report is our own write
      // coming back, and WebKit lays the frame's innards out a hair differently against
      // each integral height — measure on the echo and the two heights take turns
      // forever, a preview vibrating by one pixel. Reset to -1 so the first report
      // after a load always measures.
      this.vpWidth = -1
      this.resize = new ResizeObserver((entries) => {
        const news = entries.some((entry) => {
          if (entry.target !== this.viewport) return true
          const width = entry.contentRect.width
          if (width === this.vpWidth) return false
          this.vpWidth = width
          return true
        })
        if (news) this.fit()
      })
      this.resize.observe(doc.documentElement)
      if (this.viewport) this.resize.observe(this.viewport)
    }
    // srcdoc inherits the parent's origin, so the page can hear the sample's own
    // errors. Without this a broken edit just looks like a preview that quietly
    // stopped working.
    this.frame?.contentWindow?.addEventListener('error', (event) => {
      this.showError((event as ErrorEvent).message || 'Script error')
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
    // One pixel of dead-band, and it is the other half of the WebKit defense above: the
    // write itself can move the next measurement across the `ceil` boundary — the inner
    // layout is rounded against the integral height it is given — and a measure driven
    // off the document's own resize report would flap between the two values forever. A
    // real change is bigger than a pixel, and a preview one pixel short is invisible
    // where a preview vibrating by one is not.
    const current = parseFloat(frame.style.height) || 0
    if (Math.abs(content - current) > 1) frame.style.height = `${content}px`

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
    if (!pane.code || !EDITABLE.test(pane.language ?? '')) return false
    // Bare `no-edit` is what it always was: nothing here takes a keystroke. Given panes to
    // name — `no-edit="css js"` — it locks those and leaves the rest editable, which is the
    // sample whose markup is the point and whose stylesheet is context. A pane is named by
    // the tab's own name or by the fence's language, since `HTML` is what the tab says and
    // `code` is only the internal name for it.
    const locked = this.getAttribute('no-edit')
    if (locked !== null) {
      const names = list(locked.toLowerCase()).map((name) => PANE_OF[name] ?? name)
      if (!names.length || names.includes(pane.name)) return false
    }
    // Or the fence said so itself; see `addPane` for what it can have said.
    if (pane.locked) return false
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
  // out by keyboard. `enterEdit` and `onEditorKey` are the two halves of that.
  //
  // The jar is built here and then switched off, rather than built on the first Edit. Two
  // reasons, and the second is the one that decided it: CodeJar writes `white-space:
  // pre-wrap` and `overflow-wrap: break-word` inline on the block, so a jar made on demand
  // would reflow the sample under the reader's cursor at the moment they press the button;
  // and `set source` writes through the jar, which the options panel does to a sample
  // nobody has opened.
  private attachEditors(): void {
    let any = false
    for (const pane of this.panes.values()) {
      if (pane.jar || !this.editable(pane)) continue
      const code = pane.code!
      pane.jar = CodeJar(code, (element) => this.highlight(element, pane.language), { tab: '  ' })
      // The text is read back off the blocks, so the pane's name is all the report
      // carries: `schedule` needs it to tell an edit that is code being typed — held for
      // Run — from one that is markup or css, which follows the typing.
      pane.jar.onUpdate(() => this.schedule(false, pane.name))
      // A code block on a docs page is something you Tab past, and one that is quietly
      // editable is a text field in the middle of that — Tab indents once you are in it,
      // so the way out is a key nobody has been told about yet. Editing is opt-in per
      // block instead: the button says the block can take it, pressing the button is the
      // asking, and the hint is only owed to someone who asked.
      //
      // CodeJar's own feature test picks `plaintext-only` or `true`; what it picked is
      // remembered rather than re-derived here, and handed back by `enterEdit`.
      pane.editMode = code.getAttribute('contenteditable') ?? 'true'
      code.removeAttribute('contenteditable')
      this.buildHint()
      // The keyboard's half of the Edit button. Taking the block out of the tab order
      // solved the trap, and would have left a keyboard user with nothing but a small icon
      // in the corner to go and find; a tab stop on the block puts the affordance back
      // where they already are. `Enter` from here is what the button does, and the block
      // itself is what `aria-describedby` says it out of.
      //
      // The stop is on the `pre` and not on the block: the block is where the editor lands,
      // and one element cannot be both the thing you Tab to and the thing that swallows
      // Tab. The `pre` and not the pane's box either — with a copy-button script's
      // `.code-wrap` around it those are two different elements, and the one that scrolls
      // is this one. `showPane` then finds a `[tabindex]` inside the wrapper and leaves it
      // alone, which is the same tab stop counted once.
      const pre = code.parentElement
      if (pre) {
        pre.tabIndex = 0
        pre.setAttribute('aria-describedby', this.hint!.id)
        // A tab stop has to say what it is. A bare `pre` is a generic element, and a
        // focusable generic with no role and no name is a stop a screen reader has
        // nothing to announce at. In a tab strip the `pre` is already the tabpanel,
        // named by its tab; everywhere else — the single-fence page, or a `pre` inside a
        // copy-button script's wrapper — it takes the name the code block used to carry.
        // The markup's own `aria-label` still wins, since a docs page that has already
        // labelled a sample knows better than a language name.
        if (!pre.hasAttribute('role')) {
          pre.setAttribute('role', 'group')
          if (!pre.hasAttribute('aria-label')) pre.setAttribute('aria-label', this.labelOf(pane))
        }
      }
      any = true
    }
    if (!any) return
    // Capture, and on the host rather than the blocks: a listener added to a block
    // itself runs after CodeJar's, which has already called `preventDefault` on the
    // Tab by then. A stable reference, so reconnecting cannot double it up.
    this.addEventListener('keydown', this.onEditorKey, true)
    this.classList.add('is-editable')
    // A sample whose text is code — a js pane with an editor, or markup carrying its own
    // `<script>` — gets its button now rather than at the first keystroke: a button that
    // appears under the reader's hands is one they did not ask for and may already be
    // mid-click on something else. A sample that merely *reloads* (a `js` url, `reload`)
    // gets none: its edits follow the typing now, so there is nothing for Run to apply.
    if (this.panes.get('js')?.editMode || hasScript(this.sources().html)) this.buildRun()
    this.syncRunPane()
  }

  // WCAG 2.1.2, no keyboard trap. Tab indents inside a code editor, which means it cannot
  // also be the way out, and an editable block with no way out is the one accessibility
  // failure this element could ship that has no workaround at all.
  //
  // Escape closes the editor outright rather than handing Tab back one press at a time.
  // The block is only editable because somebody pressed Edit, so there is a state to leave
  // and leaving it is the honest answer: the block stops taking keystrokes, stops being a
  // tab stop, and focus lands on the button that opened it — which is where Tab carries on
  // from. Nothing to re-arm, and nothing to guess about on the way back in.
  private onEditorKey = (event: KeyboardEvent): void => {
    // Enter on the block itself, which is where Tab leaves a keyboard user — the same thing
    // the Edit button does, offered where they already are. Only on the `pre`: once the
    // editor is open Enter is a newline, and the block inside is what has focus then.
    const showing = this.panes.get(this.pane)
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey &&
      showing?.editMode && event.target === showing.code?.parentElement) {
      event.preventDefault()
      this.enterEdit()
      return
    }

    // Everything below is a key pressed in an editor: the listener is on the host, so an
    // Escape in the options panel or on a width button would otherwise close an editor the
    // reader is not in.
    const pane = this.paneAt(event.target)
    if (!pane) return

    // The other half of the Run button, for hands that are already on the keys — the
    // combination every editor with a run button binds, and it works in every pane rather
    // than only the ones that have one: in a markup or css pane it means "done typing,
    // apply it now" instead.
    //
    // Claimed only where one of those two is real. With nothing to re-run and nothing on
    // the debounce there is nothing for it to do, and a modified Enter is a key the page
    // may have its own plans for — not one to swallow for a no-op.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) &&
      (this.timer || this.runs(this.sources()))) {
      event.preventDefault()
      this.runNow()
      return
    }
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    this.exitEdit()
  }

  // The WCAG 2.1.2 advisory, and it has to reach two audiences that need two different
  // things: `aria-describedby` says it on focus for a screen reader, and the stylesheet
  // shows the same element while the editor is open, because a sighted keyboard user is
  // just as stuck in there and hears nothing.
  //
  // One per element however many editable panes it has — they all say the same sentence,
  // and it is the open editor that points at it.
  private buildHint(): void {
    if (this.hint) return
    const hint = document.createElement('p')
    hint.className = 'code-preview-hint'
    hint.id = `code-preview-hint-${++uid}`
    hint.textContent = HINT_CLOSED
    this.appendChild(hint)
    this.hint = hint
  }

  // The sample's name, wherever one is needed outside the block itself — the frame's
  // title, the editor's label, the tab stop's. The markup's own `aria-label` wins, since
  // a docs page that has already labelled a sample knows better than a language name.
  private labelOf(pane?: Pane): string {
    return pane?.code?.getAttribute('aria-label') ?? `${pane?.language ?? this.language} sample`
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
