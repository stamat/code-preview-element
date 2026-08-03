// The options panel: a second tab beside the code, with controls generated from a
// Custom Elements Manifest.
//
//   <script src="dist/code-preview-hljs.min.js"></script>
//   <script src="dist/code-preview-options.min.js"></script>
//
//   <code-preview css="dist/switch.css dist/switch-theme.css" js="dist/switch.js"
//                 manifest="dist/custom-elements.json" tab="options">
//     <pre><code class="language-html">&lt;switch-elemental&gt;…</code></pre>
//   </code-preview>
//
// Opt-in, and separate from both element bundles for the same reason the highlighter is:
// a page that does not import it pays nothing, and a `manifest` attribute on a page that
// has not is simply inert. Nothing here is in the default build.
//
// **Why a manifest rather than a format of our own.** `custom-elements.json` already has
// every field a panel needs, and `cssProperties[].syntax` is the Houdini registered-
// property syntax string — `<color>`, `<time>`, `ease | linear` — which is exactly a
// control type. The type information for the css side is already specified and nobody has
// to agree with us about it. Shipping one also buys editor autocomplete and a Storybook
// args table, which no format of ours would.
//
// **Where a knob writes**, which is the only hard decision in here. The element's premise
// is that the code block's text is the single source of truth and the preview is derived
// from it, so a knob that quietly mutates the live dom inside the frame would leave the
// code tab describing something that is not what is rendered. The two kinds of knob get
// two different answers, and both are honest:
//
//   - **A css custom property is not part of the sample.** A consumer setting one does it
//     in their own stylesheet, so the panel does the same: one `<style>` in the frame's
//     head, holding one rule. The rule is also rendered at the bottom of the panel to be
//     copied, which is worth more than the knobs are.
//   - **An attribute belongs to an element in the sample**, so a knob rewrites the source
//     and the code tab keeps telling the truth. Typing in the code tab can change the
//     same attributes back, so the controls are re-read from the source whenever the
//     Options tab is activated — the only moment a reader can see them.
//   - **An event is not a knob at all.** `events[]` is rendered read-only: the panel says
//     which events the element fires whether or not any has, and counts them as they
//     arrive, so a sample whose only visible behaviour is a `CustomEvent` stops being a
//     demo of nothing.
//
// An untouched knob writes nothing at all: no attribute, no declaration. That keeps the
// code tab clean, keeps the copyable rule down to what was actually changed, and makes
// resetting a knob a matter of emptying it rather than of computing a value.
import type { CodePreview } from './element'

// A control's shape, which is all the panel needs to decide out of a manifest entry.
// Storybook's vocabulary, minus the ones nothing here can produce.
export type ControlKind = 'checkbox' | 'number' | 'select' | 'text' | 'color' | 'range'

export interface Control {
  kind: ControlKind
  hidden?: boolean
  options?: string[]
  min?: number
  max?: number
  step?: number
}

// The escape hatch. The CEM schema sets no `additionalProperties: false`, so extension
// keys are legal and every other tool ignores this one.
export interface Extension {
  control?: ControlKind
  hidden?: boolean
  options?: string[]
  min?: number
  max?: number
  step?: number
}

// One `attributes[]` or `cssProperties[]` entry. The two are near enough the same shape
// to share a type, and `name` is what tells them apart.
export interface Entry {
  name: string
  description?: string
  default?: string
  // An attribute's TypeScript type. The analyzer also puts a `@cssprop {<color>}` here.
  type?: { text?: string }
  // Where the CEM schema itself puts a css property's Houdini syntax string.
  syntax?: string
  'x-code-preview'?: Extension
}

export interface Declaration {
  tagName?: string
  name?: string
  attributes?: Entry[]
  cssProperties?: Entry[]
  events?: Entry[]
}

export interface Manifest {
  modules?: { declarations?: Declaration[] }[]
}

// ---------------------------------------------------------------------------------
// The pure half. Exported and tested, the way `buildSrcdoc` and `scaleToFit` are.
// ---------------------------------------------------------------------------------

// A `<color>` syntax, including the multipliers Houdini allows on it.
const COLOR_SYNTAX = /^<color>[+#]?$/

// Nothing exhaustive — a named color is unrecognisable — but it catches every default
// the library this was written against actually uses.
const COLOR_VALUE = /^(#|rgba?\(|hsla?\(|oklch\(|lab\(|color(-mix)?\(|currentcolor\b|transparent\b|canvas(text)?\b|highlight(text)?\b)/i

// The tag's own opening tag, and only the first one.
//
// ponytail: `(?=[\s/>])` rather than `\b`, because a `\b` after `switch` also matches
// inside `<switch-elemental` and hyphens are what custom element names are made of. The
// alternation is what survives a `>` inside a quoted value (`aria-label="a > b"`).
// Anything more than this — the nth instance, a tag inside a comment — wants a real
// parser, and no sample this renders has one.
export const openTag = (tag: string): RegExp =>
  new RegExp(`<${tag.replace(/[^\w-]/g, '')}(?=[\\s/>])(?:"[^"]*"|'[^']*'|[^>'"])*>`, 'i')

const attributeIn = (name: string): RegExp =>
  new RegExp(`\\s+${name.replace(/[^\w:.-]/g, '').replace(/\./g, '\\.')}(\\s*=\\s*("[^"]*"|'[^']*'|[^\\s/>]+))?`, 'i')

// Splice one attribute into the sample's first `<tag …>`, leaving the rest of the markup
// byte-identical. `null` removes it, `''` writes it bare (`checked`), anything else
// writes `name="value"`.
//
// Deliberately not `DOMParser` → serialize: that reformats the author's markup on the
// first knob turn, and on a documentation page the markup *is* the documentation.
export function setAttributeInSource(src: string, tag: string, name: string, value: string | null): string {
  const open = openTag(tag).exec(src)
  if (!open) return src

  const before = open[0]
  const found = attributeIn(name).exec(before)
  const written = value === null ? '' : value === '' ? ` ${name}` : ` ${name}="${value.replace(/"/g, '&quot;')}"`

  let after: string
  if (found) {
    after = before.slice(0, found.index) + written + before.slice(found.index + found[0].length)
  } else if (written) {
    // Before the closing `>`, and before a self-closing slash — which belongs to
    // neither the tag name nor the attribute list.
    const end = /\s*\/?>$/.exec(before)
    if (!end) return src
    after = before.slice(0, end.index) + written + before.slice(end.index)
  } else {
    return src
  }

  return src.slice(0, open.index) + after + src.slice(open.index + before.length)
}

// What the sample currently says, so the controls can be re-read from it. A bare
// attribute reads as `''`, which is what writing one back takes.
export function readAttributes(src: string, tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  const open = openTag(tag).exec(src)
  if (!open) return out

  const inside = open[0].replace(/^<[\w-]+/, '').replace(/\s*\/?>$/, '')
  const each = /([\w:.-]+)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let found = each.exec(inside)
  while (found) {
    out[found[1].toLowerCase()] = found[4] ?? found[5] ?? found[6] ?? ''
    found = each.exec(inside)
  }
  return out
}

// The rule the frame gets and the reader copies — one string, so the two cannot differ.
//
// The selector is the element's own tag and never `:root`: a theme stylesheet sets these
// defaults *on the element*, and a property set on an element always beats one inherited
// from an ancestor, so `:root { --switch-… }` would silently do nothing.
export function cssRule(tag: string, touched: Record<string, string>): string {
  const declarations = Object.entries(touched)
  if (!declarations.length) return ''
  return `${tag} {\n${declarations.map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}\n`
}

// What the swatch beside a color field can show, given whatever the engine made of that
// field's value. `<input type="color">` holds an opaque `#rrggbb` and nothing else — the
// newer `alpha` attribute buys `#rrggbbaa`, still not the `transparent` keyword — so:
//
//   - a resolved color comes back as the hex the picker can hold;
//   - a fully transparent one comes back as `'transparent'`, which the stylesheet draws as
//     the crossed-out square a mac shows for no color, since a picker cannot;
//   - anything else is `null`, meaning leave the swatch alone. A swatch claiming a color
//     the sample does not have is worse than one that has not moved.
//
// The input is a *computed* color, which is what turns `hsl(…)`, a named color or a
// `color-mix(…)` into channels. Two serialisations, because a `color-mix()` in srgb comes
// back as `color(srgb …)` in some engines and `rgb()` in others, and the demo's own default
// is a `color-mix()`. Anything outside srgb — a real `color(display-p3 …)` — is `null`:
// clamping a wide-gamut color into a hex is a different color, quietly.
export function swatchFor(color: string, withAlpha = false): string | null {
  const text = color.trim()
  const rgb = /^rgba?\(([^)]*)\)$/i.exec(text)
  const srgb = /^color\(\s*srgb\s+([^)]*)\)$/i.exec(text)
  const parts = (rgb?.[1] ?? srgb?.[1] ?? '').split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return null
  // `color(srgb …)` is 0–1 per channel where `rgb()` is 0–255; a percentage is a
  // percentage in both.
  const scale = srgb ? 255 : 1
  const channels = parts.slice(0, 3).map((part) => part.endsWith('%') ? parseFloat(part) * 2.55 : Number(part) * scale)
  if (channels.some((channel) => !Number.isFinite(channel))) return null
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : Number(parts[3])
  // An alpha that did not parse is not an opaque one — "leave the swatch alone", like
  // every other value this cannot be sure about.
  if (!Number.isFinite(alpha)) return null
  if (alpha === 0) return 'transparent'
  const byte = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  const hex = '#' + channels.map(byte).join('')
  // A picker with `alpha` holds the eight-digit form, so a half-transparent sample stops
  // being drawn as an opaque one. Fully opaque stays six digits — same color, and the form
  // every engine takes.
  return withAlpha && alpha < 1 ? hex + byte(alpha * 255) : hex
}

// A `detail` on one line, for the events readout.
//
// Not `JSON.stringify`: half of these carry an element — `detail.panel`, `detail.tab` —
// which serialises as `{}` at best and throws on a cycle at worst. `instanceof Element` is
// no good either, since the event comes out of the frame and that is a different realm
// with a different `Element`; a `localName` is what a node has in every one of them.
// The same line in pieces, so the readout can be colored. highlight.js's own class names
// rather than classes of ours: a docs page already ships a syntax theme, and the token it
// paints green in a code block is the token this readout wants green too.
export function detailTokens(detail: unknown): Array<{ text: string, cls?: string }> {
  if (detail === null || detail === undefined) return []
  // A `detail` is whatever the sample felt like passing: a paragraph of text, a function, a
  // whole config object. One line means one line, and a value nobody can read at a glance is
  // one nothing is lost by cutting — the sample's own console is where a full payload is read.
  const clip = (text: string): string => text.length > 42 ? `${text.slice(0, 41)}…` : text
  const one = (value: unknown): { text: string, cls?: string } => {
    if (typeof value === 'string') return { text: clip(JSON.stringify(value)), cls: 'hljs-string' }
    if (typeof value === 'number') return { text: String(value), cls: 'hljs-number' }
    if (typeof value === 'function') return { text: 'ƒ', cls: 'hljs-literal' }
    if (Array.isArray(value)) return { text: `[${value.length}]` }
    if (value && typeof value === 'object') {
      const node = value as { localName?: unknown }
      return typeof node.localName === 'string'
        ? { text: `<${node.localName}>`, cls: 'hljs-tag' }
        : { text: '{…}' }
    }
    return { text: clip(String(value)), cls: 'hljs-literal' }
  }
  if (typeof detail !== 'object') return [one(detail)]
  const parts: Array<{ text: string, cls?: string }> = []
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    parts.push({ text: parts.length ? ', ' : '{ ' }, { text: key, cls: 'hljs-attr' }, { text: ': ' }, one(value))
  }
  return parts.length ? [...parts, { text: ' }' }] : []
}

export function describeDetail(detail: unknown): string {
  return detailTokens(detail).map((token) => token.text).join('')
}

// `'a' | 'b'` out of a TypeScript type, `ease | linear` out of a Houdini syntax string.
// A part that is neither — `string`, `<length>` — means the set is not closed and there
// is nothing to put in a `<select>`.
function unionOf(text: string, quoted: boolean): string[] | undefined {
  if (!text.includes('|')) return undefined
  const out: string[] = []
  for (const part of text.split('|').map((one) => one.trim()).filter(Boolean)) {
    const literal = /^'([^']*)'$/.exec(part) ?? /^"([^"]*)"$/.exec(part)
    if (literal) {
      out.push(literal[1])
    } else if (quoted) {
      // `'sm' | 'md' | undefined` is still a closed set of two; anything else is not.
      if (!/^(undefined|null)$/.test(part)) return undefined
    } else if (/^[\w-]+$/.test(part)) {
      out.push(part)
    } else {
      return undefined
    }
  }
  return out.length ? out : undefined
}

// Manifest entry → control.
export function controlFor(entry: Entry): Control {
  const extension = entry['x-code-preview'] ?? {}
  // The extension wins over everything sniffed below — that is what it is for — and
  // carries the numbers a `range` needs, which no manifest field can express.
  const decided = (kind: ControlKind, options?: string[]): Control => ({
    kind: extension.control ?? kind,
    hidden: extension.hidden,
    options: extension.options ?? options,
    min: extension.min,
    max: extension.max,
    step: extension.step
  })

  // A css custom property is told apart from an attribute by its own name, which is the
  // one thing about it that can be neither missing nor mistyped.
  const css = entry.name.startsWith('--')
  // `syntax` is where the schema puts the Houdini string; the analyzer puts a
  // `@cssprop {<color>}` into `type.text` instead. Both are the same claim.
  const declared = ((css ? entry.syntax ?? entry.type?.text : entry.type?.text) ?? '').trim()

  const union = unionOf(declared, !css)
  if (union) return decided('select', union)

  if (css) {
    // `<input type="color">` cannot be the color control. `currentcolor`, `Canvas`,
    // `transparent` and `color-mix(in srgb, currentcolor 22%, transparent)` are all real
    // defaults, a native color input can hold none of them, and swapping one out for a
    // hex value is how a knob silently destroys a theme that was correct. The text field
    // is the control; the picker sits beside it and writes hex into it.
    const color = declared ? COLOR_SYNTAX.test(declared) : COLOR_VALUE.test(entry.default ?? '')
    return decided(color ? 'color' : 'text')
  }

  if (/^boolean$/i.test(declared)) return decided('checkbox')
  if (/^number$/i.test(declared)) return decided('number')
  return decided('text')
}

export function declarations(manifest: Manifest): Declaration[] {
  const modules = manifest.modules ?? []
  const out: Declaration[] = []
  for (const module of modules) {
    for (const declaration of module.declarations ?? []) {
      if (declaration.tagName) out.push(declaration)
    }
  }
  return out
}

// Which declaration this sample is about: `manifest-tag` if the markup says, otherwise
// the first declared tag that actually appears in the source. That default is what makes
// a one-element manifest and a whole library's cumulative one behave identically.
export function pickDeclaration(manifest: Manifest, src: string, wanted?: string | null): Declaration | undefined {
  const all = declarations(manifest)
  if (wanted) return all.find((declaration) => declaration.tagName === wanted)

  let best: Declaration | undefined
  let at = Infinity
  for (const declaration of all) {
    const found = openTag(declaration.tagName as string).exec(src)
    if (found && found.index < at) {
      at = found.index
      best = declaration
    }
  }
  return best
}

// ---------------------------------------------------------------------------------
// The panel.
// ---------------------------------------------------------------------------------

// One request per url however many previews a page has of the same element — a docs page
// with twenty samples of one switch is one fetch.
const manifests = new Map<string, Promise<Manifest>>()

function loadManifest(url: string): Promise<Manifest> {
  let pending = manifests.get(url)
  if (!pending) {
    // The call is inside the chain so that a `fetch` which throws rather than rejects —
    // a url the page's CSP refuses, an engine without one at all — comes back as a
    // rejection like every other failure. Thrown from here it would escape the sweep in
    // `install` and cost every later preview on the page its panel too.
    pending = Promise.resolve().then(() => fetch(url)).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return response.json() as Promise<Manifest>
    })
    manifests.set(url, pending)
    // A failure is not worth caching: leaving it in the map means one transient network
    // error costs every preview that mounts later its panel too, until the page reloads.
    pending.catch(() => manifests.delete(url))
  }
  return pending
}

// An event this sample has not fired yet — and the state every count goes back to when the
// frame is rebuilt, since that is a new document with a new sample in it.
const NEVER = '—'

// A name over the preview for a moment, because the preview is where the reader is looking
// when they click the thing that fires it — the panel readout is the record, this is the
// notice. Opt out with `no-toast` on the element, which a sample that fires on every
// pointermove wants.
//
// One box per element, reused: a second event mid-fade replaces the name and restarts the
// animation rather than stacking, which keeps this a notice and not a log. Opacity only, so
// there is nothing here for `prefers-reduced-motion` to object to.
//
// ponytail: absolutely positioned inside the viewport, which is a scroll container — a
// sample tall enough to scroll (past `max-height: 70vh`) scrolls its toast away with it.
// Anchor positioning fixes that properly once Firefox ships it.
function toast(host: CodePreview, name: string): void {
  if (host.hasAttribute('no-toast')) return
  const viewport = host.querySelector('.code-preview-viewport')
  if (!viewport) return
  let node = viewport.querySelector<HTMLElement>('.code-preview-toast')
  if (!node) {
    node = document.createElement('div')
    node.className = 'code-preview-toast'
    // Not a live region: the panel's `aria-live` already says an event fired, and saying it
    // twice is worse than not saying it here at all.
    node.setAttribute('aria-hidden', 'true')
    viewport.appendChild(node)
  }
  node.textContent = name
  node.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], 1600)
}

// One piece of a `detail` line. Punctuation carries no class and stays a text node, so a
// readout is a handful of spans rather than one per character.
function paint(token: { text: string, cls?: string }): Node | string {
  if (!token.cls) return token.text
  const span = document.createElement('span')
  span.className = token.cls
  span.textContent = token.text
  return span
}

// Built once per element, and only ever from `buildOptions`.
const panelled = new WeakSet<CodePreview>()

export function buildOptions(host: CodePreview): void {
  const url = host.getAttribute('manifest')
  // No sample means no tab strip worth building, and nothing for the controls to write
  // their attributes into.
  if (!url || !host.codePanel || panelled.has(host)) return
  panelled.add(host)

  const panel = document.createElement('div')
  panel.className = 'code-preview-options'
  host.appendChild(panel)
  // The strip, the ids, the roles, the roving tabindex and the arrow keys are the
  // element's — this is one more pane beside the sample's own, and the only thing this
  // bundle has to say about it is that it exists. `tab="options"` already works: the
  // attribute was the state before either of us was involved.
  host.addPane('options', panel)

  // Filled in once the manifest lands. Called at the two moments the host knows about —
  // the tab changing and the frame loading — which are the only ones where either half of
  // it has anything new to say: the controls are re-read from a source the reader may have
  // typed into, and the frame's listeners are put back on a document that is new.
  //
  // Unconditional, and not only while the panel is showing: an event fired while the
  // reader is on the code tab still has to be counted, so the frame's listeners cannot
  // wait for the panel to be looked at. Re-reading the controls costs nothing here — the
  // values come from the sample either way.
  let refresh = (): void => {}
  host.onPanelSync = () => refresh()

  loadManifest(url).then((manifest) => {
    const declaration = pickDeclaration(manifest, host.source, host.getAttribute('manifest-tag'))
    if (!declaration) {
      // Not an error the reader can do anything about, and not the sample's fault, so it
      // does not go in the error banner — that one is for a script the reader is editing.
      console.warn(`code-preview: ${url} documents no tag found in this sample`)
      return
    }
    refresh = fillPanel(host, panel, declaration)
    refresh()
  }).catch((error) => {
    console.warn(`code-preview: could not read ${url} —`, error)
  })
}

// Everything below the tab strip. Returns the function that re-reads the sample's
// attributes into the controls.
function fillPanel(host: CodePreview, panel: HTMLElement, declaration: Declaration): () => void {
  const tag = declaration.tagName as string
  const attributes = (declaration.attributes ?? []).map((entry) => [entry, controlFor(entry)] as const).filter(([, control]) => !control.hidden)
  const properties = (declaration.cssProperties ?? []).map((entry) => [entry, controlFor(entry)] as const).filter(([, control]) => !control.hidden)

  // Only what the reader has turned. An untouched knob writes no declaration, which is
  // what keeps the copyable rule down to what was actually changed.
  const touched: Record<string, string> = {}

  // A `div` with `white-space: pre` rather than a `<pre>`: copy-button scripts sweep the
  // page for `pre` and wrap each one, and a panel of knobs is not a code block — the
  // button they add lands on top of the rule, and whether it lands at all is a race
  // between their DOMContentLoaded and this manifest's fetch.
  const output = document.createElement('div')
  output.className = 'code-preview-rule'
  output.hidden = true

  const writeRule = (): void => {
    const rule = cssRule(tag, touched)
    host.setFrameStyle(rule)
    output.textContent = rule
    output.hidden = !rule
  }

  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>()
  // Properties the manifest documents without a default, waiting on the frame to say
  // what they resolve to. A lazy frame has usually not loaded by the time the manifest
  // has, so this cannot be answered when the control is built.
  const undocumented: Array<[HTMLInputElement, string]> = []
  // Each color knob's "make the swatch agree with the field", called on every edit and
  // again whenever the panel is re-read — a placeholder filled in from the frame is a
  // color the swatch can show too.
  const swatches: Array<() => void> = []

  // A group per kind, because the three write to different places — the source, a
  // stylesheet, nowhere — and a reader is owed that distinction.
  //
  // `<details open>`/`<summary>` rather than the `<fieldset>`/`<legend>` this was: three
  // groups and the rule below them is a tall panel, and the reader of a docs page usually
  // wants one of the three. It costs nothing to name the set either way — `<details>` maps
  // to `group` and its `<summary>` is that group's name, exactly as a `<legend>` is — and
  // the disclosure is the browser's, so there is no ARIA and no key handling to get wrong.
  // Open on arrival, so a panel nobody touches reads as it always did.
  const group = (label: string, rows: HTMLElement[]): HTMLElement | undefined => {
    if (!rows.length) return undefined
    const details = document.createElement('details')
    details.className = 'code-preview-group'
    details.open = true
    const summary = document.createElement('summary')
    summary.textContent = label
    const knobs = document.createElement('div')
    knobs.className = 'code-preview-knobs'
    for (const row of rows) knobs.appendChild(row)
    details.append(summary, knobs)
    panel.appendChild(details)
    return details
  }

  const row = (entry: Entry, control: HTMLElement): HTMLElement => {
    const label = document.createElement('label')
    label.className = 'code-preview-knob'
    if (entry.description) label.title = entry.description
    const name = document.createElement('span')
    name.className = 'code-preview-knob-name'
    name.textContent = entry.name
    label.append(name, control)
    return label
  }

  // Attributes are read out of the sample, so their controls start at whatever the
  // markup says. Rendered in manifest order — the author orders the JSDoc tags.
  group('Attributes', attributes.map(([entry, control]) => {
    const input = inputFor(control)
    // The manifest's default as a placeholder rather than a value: an empty field means
    // "whatever the element does on its own", which is also what emptying it writes. A
    // select says it on its empty option, the same way a custom property's does. A
    // checkbox has no room to say so at all — one documented to default true reads
    // unchecked when the sample omits the attribute, which is the one control here
    // whose empty state can disagree with the element's. The description carries it.
    if (entry.default) {
      if (input instanceof HTMLSelectElement) input.options[0].textContent = `default (${entry.default})`
      else if (input instanceof HTMLInputElement && input.type !== 'checkbox') input.placeholder = entry.default
    }
    // On the control as well as the row: a `title` on the input is what a screen reader
    // gets as the field's description when focus lands there — the row's own tooltip
    // never follows a keyboard.
    if (entry.description) input.title = entry.description
    inputs.set(entry.name.toLowerCase(), input)
    input.addEventListener('input', () => {
      const value = input instanceof HTMLInputElement && input.type === 'checkbox'
        // A boolean attribute is its own presence, so on writes it bare and off removes it.
        ? (input.checked ? '' : null)
        : (input.value === '' ? null : input.value)
      host.source = setAttributeInSource(host.source, tag, entry.name, value)
    })
    return row(entry, input)
  }))

  group('Custom properties', properties.map(([entry, control]) => {
    const input = inputFor(control)
    // The manifest's default as a placeholder rather than a value, so an empty control
    // reads as untouched — which is exactly what it is, and what it writes.
    if (input instanceof HTMLSelectElement) {
      if (entry.default) input.options[0].textContent = `default (${entry.default})`
    } else if (entry.default) {
      input.placeholder = entry.default
    } else {
      // Documented without a default: ask the frame, once it has something to ask.
      undocumented.push([input, entry.name])
    }
    if (entry.description) input.title = entry.description
    input.addEventListener('input', () => {
      const value = input.value.trim()
      if (value) touched[entry.name] = value
      else delete touched[entry.name]
      writeRule()
    })

    // The second half of the condition is narrowing rather than doubt — a color is a text
    // field by construction — but an `x-code-preview.control` naming `select` would make it
    // a set of colors to choose between, and a picker beside that is meaningless.
    if (control.kind !== 'color' || !(input instanceof HTMLInputElement)) return row(entry, input)

    // The picker, beside the text field rather than instead of it. The field is what is
    // read — it is the only one of the two that can hold `currentcolor` or a
    // `color-mix(…)` — and the picker writes a hex into it.
    const swatch = document.createElement('input')
    swatch.type = 'color'
    // The opacity slider. Unknown attributes are ignored, so an engine without it keeps the
    // opaque picker it always had; `canAlpha` is what decides whether an `#rrggbbaa` is safe
    // to write back, since a picker without the attribute rejects one and keeps its old value.
    swatch.toggleAttribute('alpha', true)
    const canAlpha = 'alpha' in swatch
    swatch.className = 'code-preview-swatch'
    swatch.tabIndex = -1
    swatch.setAttribute('aria-label', `Pick a color for ${entry.name}`)
    swatch.addEventListener('input', () => {
      input.value = swatch.value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // The other direction, which the swatch fills the whole button with a color to be
    // worth doing: a button showing black beside a field that says `oklch(…)` is a lie the
    // size of the control. The value is resolved by setting it on the swatch and reading
    // the computed color back — the engine is what knows what a named color or a
    // `color-mix(…)` comes to — and an invalid value is rejected by the setter, so an
    // unfinished `#7c5` never reaches it.
    //
    // ponytail: resolved in *this* document, not the frame's, so `currentcolor` here is
    // the panel's text color rather than the sample's. Reading it from the frame means
    // putting a probe element inside the sample, which is a mutation a library that
    // watches its own children would see — and this is a swatch.
    const showSwatch = (): void => {
      const value = (input.value.trim() || input.placeholder || '').trim()
      swatch.style.color = ''
      swatch.style.color = value
      const shown = swatch.style.color ? swatchFor(getComputedStyle(swatch).color, canAlpha) : null
      swatch.style.color = ''
      swatch.classList.toggle('is-transparent', shown === 'transparent')
      if (shown && shown !== 'transparent') swatch.value = shown
    }
    input.addEventListener('input', showSwatch)
    swatches.push(showSwatch)
    const pair = document.createElement('span')
    pair.className = 'code-preview-color'
    pair.append(input, swatch)
    return row(entry, pair)
  }))

  // What the sample fires. Read-only, and rendered whether or not anything has fired yet:
  // the list is the documentation half, the count and the last `detail` are the live half.
  // An element whose entire api is a `CustomEvent` is otherwise a preview of a thing that
  // appears to do nothing when you click it.
  const events = (declaration.events ?? []).filter((entry) => !entry['x-code-preview']?.hidden)
  const readouts = new Map<string, { count: HTMLElement, detail: HTMLElement, line: HTMLElement }>()

  const eventsGroup = group('Events', events.map((entry) => {
    // A `div` rather than the `<label>` the knobs use: there is no control here to label,
    // and a label pointing at nothing is one a screen reader still offers to click. Its own
    // class for the same reason — the row sits next to its name rather than in the knobs'
    // control column, because a count is a word wide and a knob is a field wide.
    const line = document.createElement('div')
    line.className = 'code-preview-event'
    if (entry.description) line.title = entry.description
    const name = document.createElement('span')
    name.className = 'code-preview-knob-name'
    name.textContent = entry.name
    // How many, and what came with the last one — two cells, so the counts line up down the
    // group instead of each `detail` starting wherever its own count happened to end.
    const readout = document.createElement('span')
    readout.className = 'code-preview-event-value'
    const count = document.createElement('span')
    count.className = 'code-preview-event-count'
    count.textContent = NEVER
    const detail = document.createElement('span')
    detail.className = 'code-preview-event-detail'
    readout.append(count, detail)
    readouts.set(entry.name, { count, detail, line })
    line.append(name, readout)
    return line
  }))

  // `aria-live` rather than `role="log"`: the role would take the group's name off its
  // `<summary>`, and politeness is the half of it worth having. Set after the rows are in,
  // so building the panel announces nothing — a live region only reports what changes
  // after it exists. A closed group announces nothing either, which is the same bargain the
  // hidden pane already makes: the toast is what says an event fired.
  eventsGroup?.setAttribute('aria-live', 'polite')

  // The listeners go on the frame's *document*, in the capture phase. Capture is what
  // catches an event that does not bubble — which is most of these, dispatched on the
  // element itself — since every event passes its target's ancestors on the way down
  // whatever `bubbles` says. The document is what survives the `innerHTML` patch a
  // keystroke does, since patching only ever touches body.
  //
  // A rebuild is a new document and a new sample, so it needs its listeners back and its
  // counts start again. Nothing is ever removed: the listeners die with the document they
  // were added to.
  const listening = new WeakSet<Document>()
  const listen = (): void => {
    const doc = host.frameDocument
    if (!doc || !events.length || listening.has(doc)) return
    listening.add(doc)
    for (const entry of events) {
      const readout = readouts.get(entry.name)
      if (!readout) continue
      readout.count.textContent = NEVER
      readout.detail.replaceChildren()
      let fired = 0
      doc.addEventListener(entry.name, (event) => {
        fired += 1
        readout.count.textContent = `${fired}×`
        readout.detail.replaceChildren(...detailTokens((event as CustomEvent).detail).map(paint))
        // A count that ticks over is a change worth seeing happen — a row that only ever
        // reads `7×` says an event fired at some point, not that one fired just now. WAAPI
        // rather than a class and a keyframe, because restarting a css animation on every
        // event needs a reflow poke and this does not. An engine that will not interpolate
        // `color-mix` steps between the two instead, which still flashes.
        readout.line.animate?.([
          { backgroundColor: 'color-mix(in srgb, var(--code-preview-accent, var(--accent, #0969da)) 22%, transparent)' },
          { backgroundColor: 'transparent' }
        ], 450)
        toast(host, entry.name)
      }, true)
    }
  }

  panel.appendChild(output)

  return () => {
    const current = readAttributes(host.source, tag)
    for (const [name, input] of inputs) {
      const value = current[name]
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = value !== undefined
      else input.value = value ?? ''
    }
    for (const [input, name] of undocumented) {
      if (!input.placeholder) input.placeholder = computed(host, tag, name)
    }
    for (const showSwatch of swatches) showSwatch()
    listen()
  }
}

function inputFor(control: Control): HTMLInputElement | HTMLSelectElement {
  if (control.kind === 'select') {
    const select = document.createElement('select')
    // The empty option is what "leave it alone" looks like in a select, and is what
    // makes resetting one knob possible without a reset button.
    const unset = document.createElement('option')
    unset.value = ''
    unset.textContent = 'default'
    select.appendChild(unset)
    for (const option of control.options ?? []) {
      const item = document.createElement('option')
      item.value = option
      item.textContent = option
      select.appendChild(item)
    }
    return select
  }

  const input = document.createElement('input')
  input.type = control.kind === 'checkbox' || control.kind === 'number' || control.kind === 'range' ? control.kind : 'text'
  if (control.min !== undefined) input.min = String(control.min)
  if (control.max !== undefined) input.max = String(control.max)
  if (control.step !== undefined) input.step = String(control.step)
  return input
}

// What the frame's own engine says a property resolves to, for a manifest entry with no
// documented default. Empty before the frame has loaded, which is the common case at
// build time and costs nothing — the placeholder is a courtesy, not the state.
function computed(host: CodePreview, tag: string, name: string): string {
  const doc = host.frameDocument
  const target = doc?.querySelector(tag)
  if (!target || !doc?.defaultView) return ''
  return doc.defaultView.getComputedStyle(target).getPropertyValue(name).trim()
}

// The element and this file are two separate scripts, so the class to hang the hook on
// is the one in the registry — importing `CodePreview` here would bundle a second copy of
// element.ts whose statics nothing ever reads. The type import above erases at compile
// time and brings none of it.
//
// Both load orders work: the hook covers every element that upgrades from here on, and
// the sweep covers the ones that upgraded before this script ran.
function install(): void {
  const registered = customElements.get('code-preview') as unknown as { options?: (host: CodePreview) => void } | undefined
  if (!registered) return
  registered.options = buildOptions
  document.querySelectorAll<CodePreview>('code-preview[manifest]').forEach((host) => buildOptions(host))
}

install()
if (!customElements.get('code-preview')) customElements.whenDefined('code-preview').then(install)
