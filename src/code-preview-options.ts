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
}

export interface Manifest {
  modules?: { declarations?: Declaration[] }[]
}

// ---------------------------------------------------------------------------------
// The pure half. Exported and tested, the way `buildSrcdoc` and `scaleToFit` are.
// ---------------------------------------------------------------------------------

// A `<color>` syntax, including the multipliers Houdini allows on it.
const COLOR_SYNTAX = /^<color>[+#]?$/

// Nothing exhaustive — a named colour is unrecognisable — but it catches every default
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
  new RegExp(`\\s+${name.replace(/[^\w:.-]/g, '')}(\\s*=\\s*("[^"]*"|'[^']*'|[^\\s/>]+))?`, 'i')

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
    // `<input type="color">` cannot be the colour control. `currentcolor`, `Canvas`,
    // `transparent` and `color-mix(in srgb, currentcolor 22%, transparent)` are all real
    // defaults, a native colour input can hold none of them, and swapping one out for a
    // hex value is how a knob silently destroys a theme that was correct. The text field
    // is the control; the picker sits beside it and writes hex into it.
    const colour = declared ? COLOR_SYNTAX.test(declared) : COLOR_VALUE.test(entry.default ?? '')
    return decided(colour ? 'color' : 'text')
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
  }
  return pending
}

// Ids have to be unique on the page: a tab points at its panel with `aria-controls` and
// the panel points back with `aria-labelledby`, and a docs page has many of both.
let uid = 0

// Everything that can hold focus without being given a tab stop. The same list
// `<tabs-elemental>` uses next door, and for the same question.
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]'

// Show or hide one of the two panes.
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

// Built once per element, and only ever from `buildOptions`.
const panelled = new WeakSet<CodePreview>()

export function buildOptions(host: CodePreview): void {
  const url = host.getAttribute('manifest')
  const codePanel = host.codePanel
  if (!url || !codePanel || panelled.has(host)) return
  panelled.add(host)

  // What the stylesheet keys the code block's `display: none` off, so that hiding it does
  // not depend on this script having found the right box to put `hidden` on — a
  // copy-button script that runs later wraps that box, and the wrapper would stay.
  host.classList.add('is-tabbed')

  const id = `code-preview-${++uid}`

  // The code block becomes a tabpanel in place. Its own id is kept if it has one: a docs
  // page may already be linking to that block, and taking the anchor away to write a
  // generated one breaks a link that used to work.
  if (!codePanel.id) codePanel.id = `${id}-code`
  codePanel.setAttribute('role', 'tabpanel')
  codePanel.setAttribute('aria-labelledby', `${id}-code-tab`)

  const panel = document.createElement('div')
  panel.className = 'code-preview-options'
  panel.id = `${id}-options`
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', `${id}-options-tab`)
  host.appendChild(panel)

  // Find-in-page reveals a pane hidden `until-found` on its own; this is how the tab strip
  // hears about it and stops disagreeing with it. The reader searched for a line of the
  // sample, so the sample is what they get, on the tab that holds it.
  codePanel.addEventListener('beforematch', () => host.setAttribute('tab', 'code'))
  panel.addEventListener('beforematch', () => host.setAttribute('tab', 'options'))

  // Real APG tabs, unlike the width buttons — those deliberately stayed plain buttons
  // with `aria-pressed`, because they switch no panels and the richer role would oblige
  // arrow-key handling they do not need to be usable. These do switch panels.
  const tablist = document.createElement('div')
  tablist.className = 'code-preview-tabs'
  tablist.setAttribute('role', 'tablist')
  tablist.setAttribute('aria-label', 'Code and options')

  // `controls` is passed rather than derived: the code block may have arrived with an id
  // of its own, which it keeps, and a tab pointing at the id it would have been given
  // points at nothing at all.
  const tabFor = (name: string, label: string, controls: HTMLElement): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'code-preview-tab'
    button.id = `${id}-${name}-tab`
    button.textContent = label
    button.dataset.tab = name
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-controls', controls.id)
    // The attribute is the state, exactly as `viewport-width` is: a click, a script and
    // hand-written markup all arrive at the same place.
    button.addEventListener('click', () => host.setAttribute('tab', name))
    return button
  }

  const tabs = [tabFor('code', 'Code', codePanel), tabFor('options', 'Options', panel)]
  for (const tab of tabs) tablist.appendChild(tab)
  // Prepended, so the tabs sit at the start of the bar whether or not `viewport-widths`
  // has already put its buttons in it.
  host.toolbar.prepend(tablist)

  // Automatic activation, which is what the APG asks for wherever showing a panel costs
  // nothing — both of these are already in the page. Arrows wrap, as they do in every
  // other APG list, and a modifier held down means the key was meant for the browser.
  tablist.addEventListener('keydown', (event) => {
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
  })

  // Filled in once the manifest lands. Re-reading the source and the frame is only worth
  // anything at the moments the reader can actually see the controls, which is what the
  // host calls `sync` for.
  let refresh = (): void => {}

  const sync = (): void => {
    const options = (host.getAttribute('tab') ?? 'code') === 'options'
    for (const tab of tabs) {
      const selected = (tab.dataset.tab === 'options') === options
      tab.setAttribute('aria-selected', String(selected))
      // Roving tabindex: one tab stop for the whole list, arrows move within it.
      tab.tabIndex = selected ? 0 : -1
    }
    // Focus cannot be left in the pane about to be hidden. Hiding the element focus is in
    // drops it on the body, and a keyboard user's next Tab starts again from the top of
    // the page — for a screen reader that is the whole document between them and the
    // widget they were just in. The tab they switched *to* is where it goes, which is
    // where a click would have left it anyway, so the two paths agree.
    //
    // Only when focus really was in there: clicking a tab and arrowing to one have both
    // already focused the button by the time this runs, and find-in-page reveals a pane
    // with focus still on the body. This is for the third caller, a script or an author's
    // markup writing `tab` while the reader is in the editor.
    const leaving = options ? codePanel : panel
    if (leaving.contains(document.activeElement)) {
      tabs.find((tab) => (tab.dataset.tab === 'options') === options)?.focus()
    }
    showPane(panel, options)
    showPane(codePanel, !options)
    if (options) refresh()
  }

  host.onPanelSync = sync
  sync()

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

  // A group per kind, because the two write to different places and a reader is owed
  // that distinction. `<fieldset>`/`<legend>` rather than a heading and an ARIA group:
  // it is the native way to name a set of controls, and there is nothing to get wrong.
  const group = (label: string, rows: HTMLElement[]): void => {
    if (!rows.length) return
    const fieldset = document.createElement('fieldset')
    fieldset.className = 'code-preview-group'
    const legend = document.createElement('legend')
    legend.textContent = label
    const knobs = document.createElement('div')
    knobs.className = 'code-preview-knobs'
    for (const row of rows) knobs.appendChild(row)
    fieldset.append(legend, knobs)
    panel.appendChild(fieldset)
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
    // checkbox has no room to say so, and its default is visible in the box either way.
    if (entry.default && input instanceof HTMLInputElement && input.type !== 'checkbox') input.placeholder = entry.default
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
    input.addEventListener('input', () => {
      const value = input.value.trim()
      if (value) touched[entry.name] = value
      else delete touched[entry.name]
      writeRule()
    })

    if (control.kind !== 'color') return row(entry, input)

    // The picker, beside the text field rather than instead of it. It can only hold a
    // hex value, so it writes one in and never reads the field back — a field holding
    // `color-mix(…)` is not something a swatch can show, and pretending otherwise is
    // how the value would get quietly rewritten.
    const swatch = document.createElement('input')
    swatch.type = 'color'
    swatch.className = 'code-preview-swatch'
    swatch.tabIndex = -1
    swatch.setAttribute('aria-label', `Pick a colour for ${entry.name}`)
    swatch.addEventListener('input', () => {
      input.value = swatch.value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const pair = document.createElement('span')
    pair.className = 'code-preview-colour'
    pair.append(input, swatch)
    return row(entry, pair)
  }))

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
