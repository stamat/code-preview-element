// Two halves, both about mistakes that are silent rather than loud.
//
// `buildSrcdoc`: a missing doctype puts the frame in quirks mode, where the old box
// model misrepresents every layout sample; a sample parsed into `head` instead of
// `body` renders as nothing at all.
//
// The element in a dom: writing the sample straight into the frame's about:blank
// document — which already has a body, so it looks like a legitimate target — loads
// no stylesheet and fires no load event, so nothing sizes either. That one shipped
// once, hence the jsdom half.
//
// Not covered, because jsdom would assert fiction: sizing (no layout engine) and the
// patch-on-edit path (jsdom fires an iframe's load event without ever rendering the
// srcdoc). Those need a real browser — `npm run dev` and the site.
//
// The source is TypeScript for the browser, so it goes through esbuild (a poops
// dependency). Twice: esm to import `buildSrcdoc` here, iife to run inside jsdom.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import path from 'node:path'

const src = (name) => path.resolve(import.meta.dirname, `../src/${name}.ts`)

const bundle = async(entry, format) => (await build({
  entryPoints: [entry],
  bundle: true,
  format,
  target: 'es2019',
  write: false,
  logLevel: 'silent'
})).outputFiles[0].text

let buildSrcdoc
let scaleToFit
// The options panel's pure half: what a manifest entry becomes, what a knob writes into
// the sample, and what the copyable rule says.
let setAttributeInSource
let readAttributes
let controlFor
let cssRule
let pickDeclaration
// The three bundles: the default, which expects the page to have brought a highlighter,
// the one with highlight.js inside it, and the opt-in options panel that goes on top of
// either. Most of what follows is about the element rather than any build, and runs
// against `bundled` because it can assert colour.
let plain
let bundled
let options

before(async() => {
  // codejar reads `window` at module scope; the class declaration and its
  // registration need `HTMLElement` and `customElements`.
  globalThis.window = globalThis
  globalThis.HTMLElement = class {}
  globalThis.customElements = { get: () => undefined, define: () => {}, whenDefined: () => new Promise(() => {}) }
  globalThis.document = { querySelectorAll: () => [] }
  const esm = await bundle(src('code-preview'), 'esm')
  ;({ buildSrcdoc, scaleToFit } = await import(`data:text/javascript;base64,${Buffer.from(esm).toString('base64')}`))
  const panel = await bundle(src('code-preview-options'), 'esm')
  ;({ setAttributeInSource, readAttributes, controlFor, cssRule, pickDeclaration } =
    await import(`data:text/javascript;base64,${Buffer.from(panel).toString('base64')}`))
  delete globalThis.document
  plain = await bundle(src('code-preview'), 'iife')
  bundled = await bundle(src('code-preview-hljs'), 'iife')
  options = await bundle(src('code-preview-options'), 'iife')
})

test('an emulated viewport is scaled down to the space available, never up', () => {
  assert.equal(scaleToFit(512, 1024), 0.5)
  // Already wide enough, or wider: leave it alone rather than blurring a sample that
  // was rendering correctly.
  assert.equal(scaleToFit(1024, 1024), 1)
  assert.equal(scaleToFit(1600, 1024), 1)
  // No emulated width asked for, and nothing measured yet (a lazy frame before it
  // has been laid out) both mean don't scale.
  assert.equal(scaleToFit(700, 0), 1)
  assert.equal(scaleToFit(0, 1024), 1)
})

test('the frame document is a real document, with the assets in it', () => {
  const doc = buildSrcdoc('<button class="btn">Hi</button>', {
    css: ['../../dist/lib.css'],
    js: ['../../js/lib.js']
  })

  assert.ok(doc.startsWith('<!DOCTYPE html>'), 'no doctype: the frame would render in quirks mode')
  assert.match(doc, /<link rel="stylesheet" href="\.\.\/\.\.\/dist\/lib\.css">/)
  assert.match(doc, /<script src="\.\.\/\.\.\/js\/lib\.js"><\/script>/)
  // The stylesheet has to be in place before a script from `js` measures anything.
  assert.ok(doc.indexOf('stylesheet') < doc.indexOf('lib.js'), 'css must come before js')
  assert.match(doc, /<body><button class="btn">Hi<\/button><\/body>/)
})

test('an explicit body keeps head-eligible markup out of head', () => {
  // Without it the parser puts the title in head and the frame renders empty.
  assert.match(buildSrcdoc('<title>x</title>hello'), /<body><title>x<\/title>hello<\/body>/)
})

test('head defaults to body padding and can be replaced', () => {
  assert.match(buildSrcdoc('<p>x</p>'), /<style>body\{margin:0;padding:1rem\}<\/style>/)
  assert.match(buildSrcdoc('<p>x</p>', { head: '<style>body{padding:0}</style>' }), /padding:0/)
})

test('a url with a quote in it cannot close the attribute it sits in', () => {
  assert.match(buildSrcdoc('<p>x</p>', { css: ['a".css'] }), /href="a&quot;\.css"/)
})

test('a sample that brings its own document owns its head', () => {
  const own = '<!DOCTYPE html><html><head><title>mine</title></head><body>hi</body></html>'
  assert.equal(buildSrcdoc(own, { css: ['x.css'] }), own)
})

// Boots the element in a jsdom page and hands back what the tests poke at.
function mount(
  attributes = 'css="../../dist/lib.css" theme-attribute="data-color-scheme" no-edit',
  block = '<pre><code class="hljs language-html">&lt;button class="btn"&gt;Hi&lt;/button&gt;</code></pre>',
  // Which bundle to boot, and a hook to put things on the page before it runs — both
  // only for the default build, which reads its highlighter off the window.
  { script: source = bundled, setup } = {}
) {
  const page = new JSDOM(`<!DOCTYPE html><html data-theme="dark"><body>
    <code-preview ${attributes}>
      ${block}
    </code-preview>
  </body></html>`, { runScripts: 'dangerously' })

  setup?.(page.window)
  const script = page.window.document.createElement('script')
  script.textContent = source
  page.window.document.head.appendChild(script)

  return page.window.document.querySelector('code-preview')
}

test('the element renders through srcdoc, not into about:blank', () => {
  const element = mount()
  const viewport = element.querySelector('.code-preview-viewport')
  const frame = element.querySelector('iframe')

  assert.ok(frame, 'the element did not upgrade: no iframe')
  assert.equal(frame.parentElement, viewport, 'the frame belongs in the wrapper that owns the border and the height cap')
  assert.equal(viewport, element.firstElementChild, 'the preview belongs in front of the code it renders')
  assert.match(frame.getAttribute('srcdoc') ?? '', /<link rel="stylesheet" href="\.\.\/\.\.\/dist\/lib\.css">/)
  assert.match(frame.getAttribute('srcdoc') ?? '', /<body><button class="btn">Hi<\/button><\/body>/)
  assert.equal(frame.contentDocument.body.innerHTML, '', 'the sample was written into about:blank')

  // no-edit leaves the block alone — CodeJar sets contenteditable when it takes over.
  assert.equal(element.querySelector('code').getAttribute('contenteditable'), null)

  // The frame is sized to its whole document and must never scroll: a scrollbar inside
  // the preview is scaled along with everything else and steals width from the layout
  // being demonstrated. The wrapper is the one thing that scrolls — the cap is there.
  assert.equal(frame.getAttribute('scrolling'), 'no')
})

// Layout shift: the stylesheet reserves a height for the preview before there is one,
// and a measurement taken before the frame has loaded would be the blank document's —
// zero — which collapses that reservation and shifts the page twice over. jsdom never
// loads a srcdoc, so this is exactly the pre-load state.
test('nothing is measured before the frame has loaded', () => {
  const viewport = mount().querySelector('.code-preview-viewport')
  assert.equal(viewport.style.height, '', 'a blank frame was measured over the reserved height')
})

// Moving the element in the dom disconnects and reconnects it, and rebuilding on the
// way back in would stack a second preview and a second width bar on the first.
test('reconnecting moves the element rather than rebuilding it', () => {
  const element = mount('viewport-widths="375 768"')
  const body = element.ownerDocument.body

  element.remove()
  body.appendChild(element)

  assert.equal(element.querySelectorAll('.code-preview-viewport').length, 1)
  assert.equal(element.querySelectorAll('.code-preview-bar').length, 1)
})

test('a plain block gets highlighted, a pre-highlighted one is left alone', () => {
  // Hand-written markup: no spans, so the element runs hljs over it.
  const plain = mount('no-edit', '<pre><code class="language-html">&lt;b&gt;hi&lt;/b&gt;</code></pre>')
  const code = plain.querySelector('code')
  assert.ok(code.querySelector('.hljs-tag'), 'a plain sample was left monochrome')
  assert.match(code.className, /\bhljs\b/)
  assert.equal(code.textContent, '<b>hi</b>', 'highlighting must not alter the sample itself')

  // Already highlighted by a site generator: re-running hljs would be work for an
  // identical result, and any version skew would reshuffle the block on load.
  const done = mount('no-edit', '<pre><code class="hljs language-html"><span class="hljs-tag">KEEP</span></code></pre>')
  assert.equal(done.querySelector('code').innerHTML, '<span class="hljs-tag">KEEP</span>')
})

// The default bundle, which carries no highlighter. It is the one most people load, so
// both outcomes of a hook looked up at runtime have to be covered: a page that brought
// hljs, and a page that did not.
const UNCOLOURED = '<pre><code class="language-html">&lt;b&gt;hi&lt;/b&gt;</code></pre>'

test('the default build previews with no highlighter at all', () => {
  const element = mount('no-edit', UNCOLOURED, { script: plain })

  assert.ok(element.querySelector('iframe'), 'the element did not upgrade without hljs')
  assert.match(element.querySelector('iframe').getAttribute('srcdoc') ?? '', /<body><b>hi<\/b><\/body>/)
  // Monochrome is the honest outcome, and it must not have eaten the sample trying.
  assert.equal(element.querySelector('code').textContent, '<b>hi</b>')
})

test('the default build highlights through the page global', () => {
  const seen = []
  const element = mount('no-edit', UNCOLOURED, {
    script: plain,
    setup: (window) => {
      window.hljs = { highlightElement: (el) => seen.push(el.className) }
    }
  })

  // The adapter's job either side of the hljs call: the language class hljs needs,
  // and the `highlighted` flag that would otherwise make the next pass a no-op.
  assert.deepEqual(seen, ['hljs language-html'])
  assert.equal(element.querySelector('code').dataset.highlighted, undefined)
})

test('no width switcher unless one is asked for', () => {
  assert.equal(mount().querySelector('.code-preview-bar'), null)
})

test('the width switcher drives the viewport-width attribute', () => {
  const element = mount('viewport-widths="375 1024" no-edit')
  const bar = element.querySelector('.code-preview-bar')
  const buttons = [...bar.querySelectorAll('.code-preview-width')]

  assert.deepEqual(buttons.map((b) => b.textContent), ['Fit', '375px', '1024px'])
  // The role is on the group of buttons rather than on the bar, because the bar is a
  // strip that the options panel's tab list shares.
  assert.equal(bar.querySelector('.code-preview-widths').getAttribute('role'), 'group')
  // Nothing emulated to begin with, so "Fit" is the one held down.
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false'])

  buttons[2].click()
  assert.equal(element.getAttribute('viewport-width'), '1024')
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'true'])

  buttons[0].click()
  assert.equal(element.hasAttribute('viewport-width'), false, 'Fit means no emulated width at all')
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true')
})

// jsdom has no layout, so the wrapper measures 0 wide and nothing ever scales here.
// The width is still applied, which is the half that broke once: a viewport narrower
// than the column is a phone preview, not a no-op.
test('an emulated width is applied whether or not it needs scaling', () => {
  const element = mount('viewport-widths="375 1024" no-edit')
  const frame = element.querySelector('iframe')
  const [fit, phone] = element.querySelectorAll('.code-preview-width')

  phone.click()
  assert.equal(frame.style.width, '375px')
  assert.equal(frame.style.transform, '', 'nothing to scale when the width already fits')

  fit.click()
  assert.equal(frame.style.width, '', 'Fit hands the frame back its natural width')
})

test('an initial viewport-width is what the switcher shows as pressed', () => {
  const element = mount('viewport-width="768" viewport-widths="375 768" no-edit')
  const pressed = element.querySelectorAll('.code-preview-width[aria-pressed="true"]')
  assert.equal(pressed.length, 1)
  assert.equal(pressed[0].textContent, '768px')
})

// ---------------------------------------------------------------------------------
// The options panel. The pure half first: a knob that rewrites the sample is the one
// place in this package where being subtly wrong reformats someone's documentation.
// ---------------------------------------------------------------------------------

const SAMPLE = '<p>Status: <switch-elemental checked value="on">\n  <button>Go</button>\n</switch-elemental></p>'

test('an attribute knob splices the opening tag and leaves the rest byte-identical', () => {
  // Replace: the value changes, the quoting, the spacing and the newline do not.
  assert.equal(
    setAttributeInSource(SAMPLE, 'switch-elemental', 'value', 'pro'),
    '<p>Status: <switch-elemental checked value="pro">\n  <button>Go</button>\n</switch-elemental></p>'
  )
  // Add, before the closing angle bracket.
  assert.equal(
    setAttributeInSource('<demo-badge></demo-badge>', 'demo-badge', 'label', 'New'),
    '<demo-badge label="New"></demo-badge>'
  )
  // A bare boolean, which is what a checked checkbox writes.
  assert.equal(
    setAttributeInSource('<demo-badge label="New">', 'demo-badge', 'uppercase', ''),
    '<demo-badge label="New" uppercase>'
  )
  // Remove, taking the whitespace in front of it so nothing is left dangling.
  assert.equal(
    setAttributeInSource(SAMPLE, 'switch-elemental', 'checked', null),
    '<p>Status: <switch-elemental value="on">\n  <button>Go</button>\n</switch-elemental></p>'
  )
  // Removing something that was never there is not a rewrite at all.
  assert.equal(setAttributeInSource(SAMPLE, 'switch-elemental', 'disabled', null), SAMPLE)
  // A tag the sample does not contain leaves it alone rather than guessing.
  assert.equal(setAttributeInSource(SAMPLE, 'other-elemental', 'value', 'x'), SAMPLE)
})

// The reason the tag regex is an alternation rather than `[^>]*`: a `>` inside a quoted
// value would otherwise end the tag early, and the splice would land in the middle of it.
test('a > inside a quoted value does not end the tag', () => {
  const src = '<demo-badge aria-label="a > b" count="1">'
  assert.equal(
    setAttributeInSource(src, 'demo-badge', 'count', '2'),
    '<demo-badge aria-label="a > b" count="2">'
  )
  assert.deepEqual(readAttributes(src, 'demo-badge'), { 'aria-label': 'a > b', count: '1' })
})

// `\b` after the tag name also matches inside a longer hyphenated one, and hyphens are
// what custom element names are made of — `<switch>` must not match `<switch-elemental>`.
test('a tag name matches only whole, hyphens and all', () => {
  assert.equal(setAttributeInSource(SAMPLE, 'switch', 'value', 'x'), SAMPLE)
  const self = '<demo-badge label="New"/>'
  assert.equal(setAttributeInSource(self, 'demo-badge', 'count', '2'), '<demo-badge label="New" count="2"/>')
})

test('attributes are read back out of the sample, bare ones included', () => {
  assert.deepEqual(readAttributes(SAMPLE, 'switch-elemental'), { checked: '', value: 'on' })
  assert.deepEqual(readAttributes(SAMPLE, 'missing-elemental'), {})
})

test('a manifest entry decides its own control', () => {
  const kind = (entry) => controlFor(entry).kind

  assert.equal(kind({ name: 'checked', type: { text: 'boolean' } }), 'checkbox')
  assert.equal(kind({ name: 'count', type: { text: 'number' } }), 'number')
  assert.equal(kind({ name: 'label', type: { text: 'string' } }), 'text')
  assert.equal(kind({ name: 'label' }), 'text')

  // A closed set of string literals is a select; `string | number` is not a set.
  assert.deepEqual(controlFor({ name: 'tone', type: { text: "'quiet' | 'loud'" } }), {
    kind: 'select', options: ['quiet', 'loud'], hidden: undefined, min: undefined, max: undefined, step: undefined
  })
  assert.equal(kind({ name: 'tone', type: { text: 'string | number' } }), 'text')
  // A union the analyzer widened with `undefined` is still a set of two.
  assert.deepEqual(controlFor({ name: 'tone', type: { text: "'quiet' | 'loud' | undefined" } }).options, ['quiet', 'loud'])

  // A css property is told apart by its own name, and a Houdini union is a select too.
  assert.deepEqual(controlFor({ name: '--weight', syntax: 'normal | 500 | 700' }).options, ['normal', '500', '700'])
  // `<color>` is a *text* field plus a swatch, never `<input type="color">` — a native
  // colour input cannot hold `currentcolor`, `Canvas` or `color-mix(…)`.
  assert.equal(kind({ name: '--bg', syntax: '<color>' }), 'color')
  assert.equal(kind({ name: '--bg', type: { text: '<color>' } }), 'color', 'the analyzer writes the syntax into type.text')
  assert.equal(kind({ name: '--radius', syntax: '<length>' }), 'text')
  assert.equal(kind({ name: '--pad', syntax: '<length>+' }), 'text')
  // No syntax at all: sniff the default, which is the only claim left to read.
  assert.equal(kind({ name: '--bg', default: 'color-mix(in srgb, currentcolor 22%, transparent)' }), 'color')
  assert.equal(kind({ name: '--bg', default: 'currentcolor' }), 'color')
  assert.equal(kind({ name: '--radius', default: '6px' }), 'text')

  // The extension wins over all of it, and is the only way to ask for a range.
  const ranged = controlFor({ name: '--duration', syntax: '<time>', 'x-code-preview': { control: 'range', min: 0, max: 1000, step: 25 } })
  assert.equal(ranged.kind, 'range')
  assert.deepEqual([ranged.min, ranged.max, ranged.step], [0, 1000, 25])
  assert.equal(controlFor({ name: '--inset', syntax: '<length>', 'x-code-preview': { hidden: true } }).hidden, true)
})

test('an untouched panel writes no rule at all', () => {
  assert.equal(cssRule('switch-elemental', {}), '')
  assert.equal(
    cssRule('switch-elemental', { '--track': '#7c5cff', '--duration': '400ms' }),
    'switch-elemental {\n  --track: #7c5cff;\n  --duration: 400ms;\n}\n'
  )
})

// A cumulative manifest of a whole library and a single element's own have to behave
// identically, which is what picking by "first declared tag present in the sample" buys.
test('the declaration is the first documented tag the sample actually uses', () => {
  const manifest = {
    modules: [
      { declarations: [{ kind: 'class', name: 'Helper' }, { tagName: 'menu-elemental' }] },
      { declarations: [{ tagName: 'switch-elemental' }] }
    ]
  }
  assert.equal(pickDeclaration(manifest, SAMPLE)?.tagName, 'switch-elemental')
  assert.equal(pickDeclaration(manifest, SAMPLE, 'menu-elemental')?.tagName, 'menu-elemental')
  assert.equal(pickDeclaration(manifest, '<p>nothing here</p>'), undefined)
})

// The panel in a dom. jsdom cannot fetch the manifest, so what is asserted here is
// everything that has to be right *before* it lands — which is also everything that
// causes layout shift if it is not.
function mountWithOptions(attributes = 'manifest="m.json" no-edit') {
  return mount(attributes, undefined, {
    script: `${bundled}\n${options}`,
    // Never resolves, which *is* the state under test: everything below has to be right
    // before the manifest lands, or the panel grows into place and shifts the page.
    setup: (window) => { window.fetch = () => new Promise(() => {}) }
  })
}

test('no manifest, no tabs — every page that has none renders as it did', () => {
  const element = mount('no-edit', undefined, { script: `${bundled}\n${options}` })
  assert.equal(element.querySelector('.code-preview-tabs'), null)
  assert.equal(element.querySelector('.code-preview-options'), null)
  assert.equal(element.querySelector('pre').getAttribute('role'), null)
})

test('the tabs are built before the manifest lands, so the box does not grow later', () => {
  const element = mountWithOptions()
  const tabs = [...element.querySelectorAll('[role="tab"]')]

  assert.equal(element.querySelector('.code-preview-tabs').getAttribute('role'), 'tablist')
  assert.deepEqual(tabs.map((tab) => tab.textContent), ['Code', 'Options'])
  // The code block is the other tabpanel, in place.
  const code = element.querySelector('pre')
  assert.equal(code.getAttribute('role'), 'tabpanel')
  assert.equal(tabs[0].getAttribute('aria-controls'), code.id)
  assert.equal(code.getAttribute('aria-labelledby'), tabs[0].id)
  // Read-only, so nothing inside it can take focus and the panel itself has to.
  assert.equal(code.getAttribute('tabindex'), '0')
})

test('the tabs and the width buttons share one bar', () => {
  const element = mountWithOptions('manifest="m.json" viewport-widths="375" no-edit')
  const bar = element.querySelectorAll('.code-preview-bar')
  assert.equal(bar.length, 1, 'two bars is two borders and two reservations')
  assert.equal(bar[0].querySelector('.code-preview-tabs').nextElementSibling.className, 'code-preview-widths')
  // The width buttons keep the plain-button treatment they had: they switch no panels.
  assert.equal(bar[0].querySelector('.code-preview-widths').getAttribute('role'), 'group')
})

test('the tab attribute is the state, whoever writes it', () => {
  const element = mountWithOptions()
  const [code, options] = element.querySelectorAll('[role="tab"]')
  const panel = element.querySelector('.code-preview-options')
  const block = element.querySelector('pre')

  assert.deepEqual([code.getAttribute('aria-selected'), options.getAttribute('aria-selected')], ['true', 'false'])
  assert.equal(panel.hasAttribute('hidden'), true)
  assert.equal(block.hasAttribute('hidden'), false)
  // Roving tabindex: one tab stop for the list, arrows move inside it.
  assert.deepEqual([code.getAttribute('tabindex'), options.getAttribute('tabindex')], ['0', '-1'])

  options.click()
  assert.equal(element.getAttribute('tab'), 'options', 'the click writes the attribute and nothing else')
  assert.equal(panel.hasAttribute('hidden'), false)
  assert.equal(block.hasAttribute('hidden'), true)

  // A script setting the attribute takes the same path as the click did.
  element.setAttribute('tab', 'code')
  assert.equal(code.getAttribute('aria-selected'), 'true')
  assert.equal(panel.hasAttribute('hidden'), true)
})

test('tab="options" in the markup opens on the panel', () => {
  const element = mountWithOptions('manifest="m.json" tab="options" no-edit')
  assert.equal(element.querySelector('.code-preview-options').hasAttribute('hidden'), false)
  assert.equal(element.querySelector('pre').hasAttribute('hidden'), true)
  // The stylesheet hides the code block off this class rather than off the `hidden` above,
  // which lands on whatever box existed when the panel was built. A copy-button script
  // that runs later wraps that box, and the wrapper is what the reader would still see.
  assert.equal(element.classList.contains('is-tabbed'), true)
})

test('no panel, no is-tabbed — the class cannot hide a code block for good', () => {
  // `manifest` on a page that never loaded this script is inert by design, and so is one
  // whose manifest names no tag in the sample.
  assert.equal(mount('tab="options" no-edit', undefined, { script: bundled }).classList.contains('is-tabbed'), false)
})

// The panel once the manifest has landed. jsdom cannot fetch, so the fetch is the thing
// stubbed and everything downstream of it is real.
const MANIFEST = {
  modules: [{
    declarations: [{
      kind: 'class',
      tagName: 'demo-badge',
      attributes: [
        { name: 'label', type: { text: 'string' }, default: 'Badge' },
        { name: 'tone', type: { text: "'quiet' | 'loud'" } },
        { name: 'uppercase', type: { text: 'boolean' } }
      ],
      cssProperties: [
        { name: '--demo-badge-bg', syntax: '<color>', default: 'currentcolor' },
        { name: '--demo-badge-radius', syntax: '<length>', default: '6px' },
        { name: '--demo-badge-weight', syntax: 'normal | 600', default: '600' }
      ]
    }]
  }]
}

const BADGE = '<pre><code class="language-html">&lt;demo-badge label="New"&gt;&lt;/demo-badge&gt;</code></pre>'

// The panel is filled off a promise, so every test below has to let the microtasks run.
async function mountFilled(attributes = 'manifest="m.json" tab="options" no-edit') {
  const element = mount(attributes, BADGE, {
    script: `${bundled}\n${options}`,
    setup: (window) => {
      window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) })
    }
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  return element
}

test('the controls are generated from the manifest, grouped by where they write', async() => {
  const element = await mountFilled()
  const groups = [...element.querySelectorAll('.code-preview-group legend')].map((one) => one.textContent)
  assert.deepEqual(groups, ['Attributes', 'Custom properties'])

  const knobs = [...element.querySelectorAll('.code-preview-knob')]
  assert.deepEqual(knobs.map((knob) => knob.querySelector('.code-preview-knob-name').textContent),
    ['label', 'tone', 'uppercase', '--demo-badge-bg', '--demo-badge-radius', '--demo-badge-weight'])

  // Each control is what the manifest's own type says it should be.
  assert.equal(knobs[0].querySelector('input').type, 'text')
  assert.deepEqual([...knobs[1].querySelectorAll('option')].map((o) => o.value), ['', 'quiet', 'loud'])
  assert.equal(knobs[2].querySelector('input').type, 'checkbox')
  // A colour is a text field plus a swatch, never a native colour input on its own.
  assert.equal(knobs[3].querySelector('.code-preview-colour > input').type, 'text')
  assert.equal(knobs[3].querySelector('.code-preview-swatch').type, 'color')
  assert.deepEqual([...knobs[5].querySelectorAll('option')].map((o) => o.value), ['', 'normal', '600'])

  // The manifest's default is a placeholder and not a value: an empty control means
  // "whatever the element does on its own", which is also what emptying it writes.
  assert.equal(knobs[3].querySelector('input').placeholder, 'currentcolor')
  assert.equal(knobs[3].querySelector('input').value, '')
  // The one attribute the sample actually sets is read out of the sample, not the manifest.
  assert.equal(knobs[0].querySelector('input').value, 'New')
  assert.equal(knobs[0].querySelector('input').placeholder, 'Badge')
})

test('a custom property knob writes a rule and never touches the sample', async() => {
  const element = await mountFilled()
  const source = element.source
  const rule = element.querySelector('.code-preview-rule')
  const [colour, radius] = [...element.querySelectorAll('.code-preview-knob')].slice(3)
    .map((knob) => knob.querySelector('input, select'))

  // Untouched: no rule at all, and nothing rendered to copy.
  assert.equal(rule.hasAttribute('hidden'), true)
  // Not a `pre`, or a copy-button script wraps it and hangs a button over the panel.
  assert.notEqual(rule.tagName, 'PRE')

  colour.value = '#7c5cff'
  colour.dispatchEvent(new element.ownerDocument.defaultView.Event('input'))
  radius.value = '999px'
  radius.dispatchEvent(new element.ownerDocument.defaultView.Event('input'))

  assert.equal(rule.hasAttribute('hidden'), false)
  // The selector is the element's own tag, never `:root` — a property set on an element
  // beats one inherited from an ancestor, so `:root { --demo-… }` would do nothing.
  assert.equal(rule.textContent, 'demo-badge {\n  --demo-badge-bg: #7c5cff;\n  --demo-badge-radius: 999px;\n}\n')
  assert.equal(element.source, source, 'a custom property is not part of the sample')

  // Emptying a knob deletes the declaration rather than writing a computed default.
  radius.value = ''
  radius.dispatchEvent(new element.ownerDocument.defaultView.Event('input'))
  assert.equal(rule.textContent, 'demo-badge {\n  --demo-badge-bg: #7c5cff;\n}\n')
})

test('an attribute knob rewrites the sample, and the code tab keeps telling the truth', async() => {
  const element = await mountFilled()
  const window = element.ownerDocument.defaultView
  const [label, tone, uppercase] = [...element.querySelectorAll('.code-preview-knob')].slice(0, 3)
    .map((knob) => knob.querySelector('input, select'))

  label.value = 'Beta'
  label.dispatchEvent(new window.Event('input'))
  assert.equal(element.source, '<demo-badge label="Beta"></demo-badge>')

  // A boolean attribute is its own presence: on writes it bare, off removes it.
  uppercase.checked = true
  uppercase.dispatchEvent(new window.Event('input'))
  assert.equal(element.source, '<demo-badge label="Beta" uppercase></demo-badge>')
  uppercase.checked = false
  uppercase.dispatchEvent(new window.Event('input'))
  assert.equal(element.source, '<demo-badge label="Beta"></demo-badge>')

  // The empty option in a select means unset, which is a removal and not a value.
  tone.value = 'loud'
  tone.dispatchEvent(new window.Event('input'))
  assert.equal(element.source, '<demo-badge label="Beta" tone="loud"></demo-badge>')
  tone.value = ''
  tone.dispatchEvent(new window.Event('input'))
  assert.equal(element.source, '<demo-badge label="Beta"></demo-badge>')
})

// Typing in the code tab can change the very attributes the panel is showing. No live
// observer for it: the controls are re-read when the panel is opened, which is the only
// moment a reader can see them.
test('the attribute knobs are re-read whenever the options tab is opened', async() => {
  const element = await mountFilled('manifest="m.json" no-edit')
  const [label,, uppercase] = [...element.querySelectorAll('.code-preview-knob')].slice(0, 3)
    .map((knob) => knob.querySelector('input, select'))
  assert.equal(label.value, 'New')

  // Stand in for the reader editing the block by hand.
  element.querySelector('code').textContent = '<demo-badge label="Edited" uppercase></demo-badge>'
  element.querySelectorAll('[role="tab"]')[1].click()

  assert.equal(label.value, 'Edited')
  assert.equal(uppercase.checked, true)
})

// The panel replaces the code block and nothing above it: the preview must not reload,
// remeasure or move when a tab is clicked.
test('switching tabs leaves the preview alone', () => {
  const element = mountWithOptions()
  const frame = element.querySelector('iframe')
  const before = frame.getAttribute('srcdoc')

  element.querySelectorAll('[role="tab"]')[1].click()
  assert.equal(element.querySelector('iframe'), frame, 'the frame was rebuilt')
  assert.equal(frame.getAttribute('srcdoc'), before, 'the frame was re-rendered')
})
