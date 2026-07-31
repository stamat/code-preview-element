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
let swatchFor
let describeDetail
let detailTokens
// The three bundles: the default, which expects the page to have brought a highlighter,
// the one with highlight.js inside it, and the opt-in options panel that goes on top of
// either. Most of what follows is about the element rather than any build, and runs
// against `bundled` because it can assert color.
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
  ;({ setAttributeInSource, readAttributes, controlFor, cssRule, pickDeclaration, swatchFor, describeDetail, detailTokens } =
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
  assert.match(doc, /<script src="\.\.\/\.\.\/js\/lib\.js" defer><\/script>/)
  // The stylesheet has to be in place before a script from `js` measures anything.
  assert.ok(doc.indexOf('stylesheet') < doc.indexOf('lib.js'), 'css must come before js')
  assert.match(doc, /<body><button class="btn">Hi<\/button><\/body>/)
})

// The failure this prevents is silent and total: a custom element bundle in head runs
// before the body is parsed, so `define` is called first and the parser upgrades each
// element the moment it opens its tag — with none of its light-DOM children parsed yet.
// Every element that reads its own children on connect finds nothing and bails. The
// sample renders, the markup is right, and not one element is alive.
test('a script from `js` is deferred, or it upgrades elements that have no children yet', () => {
  const doc = buildSrcdoc('<my-widget><button>Hi</button></my-widget>', { js: ['lib.js', 'plugin.js'] })
  assert.match(doc, /<script src="lib\.js" defer><\/script>/)
  // Deferred scripts keep their order, which a library plus its plugin depends on.
  assert.ok(doc.indexOf('lib.js') < doc.indexOf('plugin.js'), 'defer must not reorder')
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
const UNcolorED = '<pre><code class="language-html">&lt;b&gt;hi&lt;/b&gt;</code></pre>'

test('the default build previews with no highlighter at all', () => {
  const element = mount('no-edit', UNcolorED, { script: plain })

  assert.ok(element.querySelector('iframe'), 'the element did not upgrade without hljs')
  assert.match(element.querySelector('iframe').getAttribute('srcdoc') ?? '', /<body><b>hi<\/b><\/body>/)
  // Monochrome is the honest outcome, and it must not have eaten the sample trying.
  assert.equal(element.querySelector('code').textContent, '<b>hi</b>')
})

test('the default build highlights through the page global', () => {
  const seen = []
  const element = mount('no-edit', UNcolorED, {
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

// WCAG 2.1.2, and the one accessibility failure here that has no workaround: Tab indents
// inside the editor, so a keyboard user who tabs into it has nothing left to press. The
// assertion is on `defaultPrevented`, because that is exactly the difference between a
// Tab the editor ate and a Tab the browser gets to move focus with.
test('Escape hands Tab back, and leaving the editor takes it again', () => {
  const element = mount('css="../../dist/lib.css" viewport-widths="375"', undefined, {
    // CodeJar edits through execCommand, which jsdom has no implementation of. The
    // editing is not what is under test here; which handler ran is.
    setup: (win) => { win.document.execCommand = () => true }
  })
  const code = element.querySelector('code')
  const win = element.ownerDocument.defaultView

  // CodeJar leaves a block that is editable and nothing else — no role, no name.
  assert.equal(code.getAttribute('role'), 'textbox')
  assert.equal(code.getAttribute('aria-multiline'), 'true')
  assert.equal(code.getAttribute('aria-keyshortcuts'), 'Escape')
  assert.match(code.getAttribute('aria-label'), /html/i)

  // The advisory the criterion asks for, said once to both audiences: `aria-describedby`
  // for a screen reader, and the same element shown by the stylesheet for everyone else.
  // A live region as well as a description, because it changes and a description is read
  // on arrival and never again.
  const hint = element.querySelector('.code-preview-hint')
  assert.ok(hint, 'no keyboard hint')
  assert.equal(code.getAttribute('aria-describedby'), hint.id)
  assert.equal(hint.getAttribute('role'), 'status')

  const press = (key) => {
    const event = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    code.dispatchEvent(event)
    return event.defaultPrevented
  }

  // The hint is advice about a key, so it is for whoever arrived on keys. A pointer user
  // can click straight back out and does not need a sentence under every sample they
  // click into — but the moment they touch the keyboard they are in the same trap, so it
  // has to turn up late rather than not at all.
  const arrive = (kind) => {
    win.document.dispatchEvent(kind === 'key'
      ? new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      : new win.Event('pointerdown', { bubbles: true }))
    code.dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }))
  }
  arrive('key')
  assert.ok(element.classList.contains('is-key-focus'), 'tabbing into the editor showed no hint')
  code.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }))
  arrive('pointer')
  assert.equal(element.classList.contains('is-key-focus'), false, 'clicking into the editor showed the hint anyway')
  press('a')
  assert.ok(element.classList.contains('is-key-focus'), 'typing after a click never brought the hint back')

  assert.equal(press('Tab'), true, 'Tab stopped indenting')
  press('Escape')
  assert.equal(press('Tab'), false, 'Escape did not hand Tab back: the editor is a keyboard trap')
  assert.match(hint.textContent, /Tab now leaves/, 'Escape gave no sign it had done anything')

  // Blur re-arms it, so coming back finds an editor that indents again.
  code.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }))
  assert.equal(press('Tab'), true, 'indenting never came back')
  assert.match(hint.textContent, /Press Esc/)

  // An Escape pressed elsewhere in the element — a width button, a panel field — is not
  // the editor's, and must not hand Tab back on its behalf.
  element.querySelector('.code-preview-width')
    .dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  assert.equal(press('Tab'), true, 'an Escape outside the editor released Tab')
})

// The other half of demonstrating an accessible component: it has to survive being used.
// CodeJar reports an update on every keyup, not only the ones that changed the text — the
// Escape this element now asks people to press is one of them — and rendering that would
// reload the frame's document under a keyboard user who has since tabbed into the preview
// and focused a control in there.
test('a keystroke that changed nothing does not reload the frame', async() => {
  // `reload` because the rebuild is the case that costs the most and the only one jsdom
  // can be asked about: it renders no srcdoc, so the patch path writes into a document
  // that never held the sample.
  const element = mount('css="../../dist/lib.css" reload', undefined, {
    setup: (win) => { win.document.execCommand = () => true }
  })
  const win = element.ownerDocument.defaultView
  const frame = element.querySelector('iframe')
  assert.ok(element.querySelector('code').hasAttribute('contenteditable'), 'the editor never attached')

  // Writing srcdoc with the identical string still counts, so the assertion cannot be on
  // its value: the reload is the attribute being written at all.
  let writes = 0
  new win.MutationObserver((records) => { writes += records.length })
    .observe(frame, { attributes: true, attributeFilter: ['srcdoc'] })

  element.querySelector('code').dispatchEvent(new win.KeyboardEvent('keyup', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 800))

  assert.equal(writes, 0, 'an unchanged sample rebuilt the frame')
})

// The third case that has to reload, and the one that fails most quietly. A js demo has
// its script inside the sample, because there is only ever one fence — and `innerHTML`
// never executes a script it inserts. The first paint goes through srcdoc and works, so
// the demo is only dead from the first keystroke on, with nothing in the console.
//
// Asserting the path rather than its result, which is all jsdom can honestly be asked:
// it fires the frame's load without ever rendering the srcdoc, so a patch lands in a
// document that never held the sample. The control case is what proves the patch path
// was armed at all — without it, "rebuilt" would pass for the wrong reason.
test('a sample carrying its own script reloads the frame instead of patching it', async() => {
  const block = (sample) => `<pre><code class="language-html">${sample}</code></pre>`

  const rebuilds = async(sample, edited) => {
    const element = mount('css="../../dist/lib.css" no-edit', block(sample))
    const win = element.ownerDocument.defaultView
    const frame = element.querySelector('iframe')
    // Let the frame's load fire: `loaded` is what arms patching in the first place.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Writing srcdoc with an identical string still counts, so the assertion cannot be
    // on its value: the reload is the attribute being written at all.
    let writes = 0
    new win.MutationObserver((records) => { writes += records.length })
      .observe(frame, { attributes: true, attributeFilter: ['srcdoc'] })

    element.source = edited
    await new Promise((resolve) => setTimeout(resolve, 800))
    return writes
  }

  assert.equal(await rebuilds('&lt;b&gt;hi&lt;/b&gt;', '<b>bye</b>'), 0,
    'plain markup rebuilt the frame, or the patch path was never armed and the case below proves nothing')
  assert.equal(await rebuilds('&lt;b&gt;hi&lt;/b&gt;&lt;script&gt;go()&lt;/script&gt;', '<b>bye</b><script>go()</script>'), 1,
    'an inline script was patched in, so it never ran again')
  // A script arriving with the edit counts too — the sample that had none until now is
  // exactly the one being typed.
  assert.equal(await rebuilds('&lt;b&gt;hi&lt;/b&gt;', '<b>hi</b><script src="x.js"></script>'), 1)
  // `<scriptish>` is not a script, and neither is prose about one.
  assert.equal(await rebuilds('&lt;b&gt;hi&lt;/b&gt;', '<b>hi</b><p>the &lt;script&gt; tag</p>'), 0)
})

test('no width switcher unless one is asked for', () => {
  assert.equal(mount().querySelector('.code-preview-bar'), null)
})

test('the width switcher drives the viewport-width attribute', () => {
  // The repeated width is deliberate: a duplicate in the attribute must not become a
  // second identical button.
  const element = mount('viewport-widths="375 1024 375" no-edit')
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
  // color input cannot hold `currentcolor`, `Canvas` or `color-mix(…)`.
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

// The swatch fills the whole button, so what it shows has to be true. A picker holds an
// opaque `#rrggbb`, or an `#rrggbbaa` where the engine takes the `alpha` attribute, and
// nothing else: everything it cannot hold either becomes the crossed-out square
// (`transparent`) or leaves the swatch where it was.
test('the swatch only ever shows a color a picker can actually hold', () => {
  assert.equal(swatchFor('rgb(124, 92, 255)'), '#7c5cff')
  assert.equal(swatchFor('rgba(0, 0, 0, 0.5)'), '#000000')
  // The modern serialisation, and percentages in either position.
  assert.equal(swatchFor('rgb(255 0 0 / 50%)'), '#ff0000')
  assert.equal(swatchFor('rgb(100% 0% 0%)'), '#ff0000')
  // A `color-mix()` in srgb comes back in this form in some engines, 0–1 per channel.
  assert.equal(swatchFor('color(srgb 1 0 0)'), '#ff0000')
  assert.equal(swatchFor('color(srgb 0 0 0 / 0)'), 'transparent')

  // `transparent` computes to a zero alpha in every engine, and that is the one case the
  // stylesheet draws itself rather than handing to the picker.
  assert.equal(swatchFor('rgba(0, 0, 0, 0)'), 'transparent')
  assert.equal(swatchFor('rgb(0 0 0 / 0%)'), 'transparent')

  // A picker carrying the `alpha` attribute holds the eight-digit form, so the half
  // transparent case above stops being drawn as an opaque one. Opaque stays six digits,
  // and a zero alpha is still the crossed-out square rather than `#00000000`.
  assert.equal(swatchFor('rgba(0, 0, 0, 0.5)', true), '#00000080')
  assert.equal(swatchFor('rgb(255 0 0 / 50%)', true), '#ff000080')
  assert.equal(swatchFor('rgb(124, 92, 255)', true), '#7c5cff')
  assert.equal(swatchFor('rgba(0, 0, 0, 0)', true), 'transparent')

  // Anything else is "leave it alone" — a wide-gamut color, an unresolved keyword, an
  // engine that answered with something unexpected. An alpha that did not parse is in
  // that set too, not an opaque color.
  assert.equal(swatchFor('color(display-p3 1 0 0)'), null)
  assert.equal(swatchFor('currentcolor'), null)
  assert.equal(swatchFor(''), null)
  assert.equal(swatchFor('rgb(0 0 0 / garbage)'), null)
})

// The events readout. Not `JSON.stringify`: half of these carry an element, and it comes
// out of the frame, so it is not this realm's `Element` either.
test('an event detail reads as one line, whatever is in it', () => {
  assert.equal(describeDetail({ checked: true }), '{ checked: true }')
  assert.equal(describeDetail({ label: 'New' }), '{ label: "New" }')
  // A node from another realm, recognised by having a `localName` rather than by `instanceof`.
  assert.equal(describeDetail({ panel: { localName: 'demo-badge' }, open: false }),
    '{ panel: <demo-badge>, open: false }')
  assert.equal(describeDetail({ tabs: [1, 2, 3] }), '{ tabs: [3] }')
  // An event with nothing on it says nothing, rather than `{}` or `undefined`.
  assert.equal(describeDetail(undefined), '')
  assert.equal(describeDetail({}), '')

  // A payload is whatever the sample felt like passing, and one line stays one line: a
  // paragraph is cut, a function is a glyph, anything nested is a placeholder.
  assert.equal(describeDetail({ text: 'x'.repeat(200) }), `{ text: "${'x'.repeat(40)}… }`)
  assert.equal(describeDetail({ done: () => {} }), '{ done: ƒ }')
  assert.equal(describeDetail({ config: { deep: { deeper: true } } }), '{ config: {…} }')
  // Not an object at all — a `CustomEvent` whose detail is one value.
  assert.equal(describeDetail(42), '42')
  assert.equal(describeDetail(false), 'false')

  // The same line in pieces, which is what the readout paints. Punctuation carries no
  // class: it is a text node between spans, not a token.
  assert.deepEqual(detailTokens({ index: 2 }).filter((token) => token.cls),
    [{ text: 'index', cls: 'hljs-attr' }, { text: '2', cls: 'hljs-number' }])
  assert.deepEqual(detailTokens({ panel: { localName: 'demo-badge' } }).filter((token) => token.cls),
    [{ text: 'panel', cls: 'hljs-attr' }, { text: '<demo-badge>', cls: 'hljs-tag' }])
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

// Hiding the element focus is in drops focus on the body, and the next Tab starts again
// from the top of the page — with the whole document between a screen reader and the
// widget it was just in. A click or an arrow key has already moved focus to the tab by
// the time the pane is swapped; this is the path that has not, a script or an author's
// markup writing `tab` while the reader is inside the editor.
test('switching tab takes focus out of the pane being hidden', () => {
  const element = mountWithOptions('manifest="m.json"')
  const [codeTab, optionsTab] = element.querySelectorAll('[role="tab"]')
  const doc = element.ownerDocument
  const editor = element.querySelector('code')

  editor.focus()
  assert.equal(doc.activeElement, editor, 'jsdom would not focus the editor: the test proves nothing')

  element.setAttribute('tab', 'options')
  assert.equal(doc.activeElement, optionsTab, 'focus was left in the hidden code pane')

  // Same in the other direction, from a control inside the panel.
  const knob = element.querySelector('.code-preview-options [tabindex], .code-preview-options')
  knob.focus()
  element.setAttribute('tab', 'code')
  assert.equal(doc.activeElement, codeTab, 'focus was left in the hidden options panel')

  // And nothing is stolen when focus was never in there — the frame's own load calls this
  // too, and a reader reading the page is not to be yanked into a tab strip.
  editor.focus()
  element.setAttribute('tab', 'code')
  assert.equal(doc.activeElement, editor)
})

// The pane nobody is looking at is hidden `until-found`, not plainly: the sample is the
// main thing a reader ctrl-Fs for on a docs page, and a tab strip that put it out of reach
// of the browser's own search would be a step back from the plain block this replaces.
test('a hidden pane is still searchable, and finding it switches tab', () => {
  const element = mountWithOptions('manifest="m.json" tab="options" no-edit')
  const block = element.querySelector('pre')
  assert.equal(block.getAttribute('hidden'), 'until-found')

  block.dispatchEvent(new element.ownerDocument.defaultView.Event('beforematch', { bubbles: true }))
  assert.equal(element.getAttribute('tab'), 'code', 'find-in-page revealed a pane the strip still called hidden')
  assert.equal(block.hasAttribute('hidden'), false)
})

// Every other APG list in this ecosystem wraps, and a modifier held down means the key was
// meant for the browser rather than for the strip.
test('the arrows wrap and leave modified keys alone', () => {
  const element = mountWithOptions()
  const window = element.ownerDocument.defaultView
  const tabs = [...element.querySelectorAll('[role="tab"]')]
  const press = (key, init = {}) => {
    tabs.find((tab) => tab.getAttribute('aria-selected') === 'true').focus()
    element.querySelector('[role="tablist"]')
      .dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  }

  // Left from the first tab is the last one, not a dead end.
  press('ArrowLeft')
  assert.equal(element.getAttribute('tab'), 'options')
  press('ArrowRight')
  assert.equal(element.getAttribute('tab'), 'code')
  press('End')
  assert.equal(element.getAttribute('tab'), 'options')
  press('Home')
  assert.equal(element.getAttribute('tab'), 'code')

  // Shift+Arrow is a selection gesture, and Ctrl/Cmd+Arrow the browser's own.
  press('ArrowRight', { shiftKey: true })
  assert.equal(element.getAttribute('tab'), 'code')
  press('ArrowRight', { metaKey: true })
  assert.equal(element.getAttribute('tab'), 'code')
})

// A docs page may already link to the block by id, and taking the anchor away to write a
// generated one breaks a link that used to work.
test('a code block that already has an id keeps it', () => {
  const element = mount('manifest="m.json" no-edit', '<pre id="usage"><code class="language-html">&lt;b&gt;hi&lt;/b&gt;</code></pre>', {
    script: `${bundled}\n${options}`,
    setup: (window) => { window.fetch = () => new Promise(() => {}) }
  })
  const block = element.querySelector('pre')
  assert.equal(block.id, 'usage')
  assert.equal(element.querySelectorAll('[role="tab"]')[0].getAttribute('aria-controls'), 'usage')
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
        { name: 'tone', type: { text: "'quiet' | 'loud'" }, default: 'quiet' },
        { name: 'uppercase', type: { text: 'boolean' } }
      ],
      cssProperties: [
        { name: '--demo-badge-bg', syntax: '<color>', default: 'currentcolor' },
        { name: '--demo-badge-radius', syntax: '<length>', default: '6px' },
        { name: '--demo-badge-weight', syntax: 'normal | 600', default: '600' }
      ],
      events: [
        { name: 'demo-badge-click', type: { text: 'CustomEvent' }, description: 'Clicked.' }
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
  const groups = [...element.querySelectorAll('.code-preview-group')]
  assert.deepEqual(groups.map((one) => one.querySelector('summary').textContent),
    ['Attributes', 'Custom properties', 'Events'])
  // Collapsible, and open on arrival — a panel nobody touches reads as it always did.
  assert.deepEqual(groups.map((one) => one.open), [true, true, true])

  const knobs = [...element.querySelectorAll('.code-preview-knob')]
  assert.deepEqual(knobs.map((knob) => knob.querySelector('.code-preview-knob-name').textContent),
    ['label', 'tone', 'uppercase', '--demo-badge-bg', '--demo-badge-radius', '--demo-badge-weight'])

  // Each control is what the manifest's own type says it should be.
  assert.equal(knobs[0].querySelector('input').type, 'text')
  assert.deepEqual([...knobs[1].querySelectorAll('option')].map((o) => o.value), ['', 'quiet', 'loud'])
  assert.equal(knobs[2].querySelector('input').type, 'checkbox')
  // A color is a text field plus a swatch, never a native color input on its own.
  assert.equal(knobs[3].querySelector('.code-preview-color > input').type, 'text')
  assert.equal(knobs[3].querySelector('.code-preview-swatch').type, 'color')
  assert.deepEqual([...knobs[5].querySelectorAll('option')].map((o) => o.value), ['', 'normal', '600'])

  // The manifest's default is a placeholder and not a value: an empty control means
  // "whatever the element does on its own", which is also what emptying it writes. An
  // attribute select says its default on the empty option, as a custom property's does.
  assert.equal(knobs[1].querySelector('option').textContent, 'default (quiet)')
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
  const [color, radius] = [...element.querySelectorAll('.code-preview-knob')].slice(3)
    .map((knob) => knob.querySelector('input, select'))

  // Untouched: no rule at all, and nothing rendered to copy.
  assert.equal(rule.hasAttribute('hidden'), true)
  // Not a `pre`, or a copy-button script wraps it and hangs a button over the panel.
  assert.notEqual(rule.tagName, 'PRE')

  color.value = '#7c5cff'
  color.dispatchEvent(new element.ownerDocument.defaultView.Event('input'))
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

// The third group, and the only read-only one: what the sample fires, listed whether or
// not it ever has. The listeners go on the frame's *document* in the capture phase, which
// is what hears an event that does not bubble — most of them, dispatched on the element.
test('an event fired inside the frame is counted, whichever tab is open', async() => {
  const element = await mountFilled('manifest="m.json" no-edit')
  const window = element.ownerDocument.defaultView
  const frame = element.querySelector('iframe')
  const count = element.querySelector('.code-preview-event-count')
  const detail = element.querySelector('.code-preview-event-detail')

  assert.equal(element.querySelector('.code-preview-event .code-preview-knob-name').textContent, 'demo-badge-click')
  assert.equal(count.textContent, '—', 'an event that has not fired has to say so')

  // jsdom never renders a srcdoc, so the load is dispatched by hand. Everything downstream
  // of it is real, including which document the listeners end up on.
  frame.dispatchEvent(new window.Event('load'))
  const doc = frame.contentDocument
  const inner = frame.contentWindow
  const badge = doc.createElement('demo-badge')
  doc.body.appendChild(badge)

  // Not bubbling, deliberately: capture is what makes the document hear it anyway.
  badge.dispatchEvent(new inner.CustomEvent('demo-badge-click', { detail: { label: 'New' } }))
  assert.equal(count.textContent, '1×')
  assert.equal(detail.textContent, '{ label: "New" }')
  badge.dispatchEvent(new inner.CustomEvent('demo-badge-click', { detail: { label: 'New' } }))
  assert.equal(count.textContent, '2×')

  // And the code tab was the one open the whole time: an event fired while the reader is
  // looking at the sample still has to be counted, so the listeners cannot wait for the
  // panel to be looked at.
  assert.notEqual(element.getAttribute('tab'), 'options')

  // And the name goes over the preview, which is where the reader is looking when they
  // click the thing that fired it. One box however many events arrive.
  const toast = element.querySelectorAll('.code-preview-toast')
  assert.equal(toast.length, 1)
  assert.equal(toast[0].textContent, 'demo-badge-click')
  assert.equal(toast[0].parentElement.className, 'code-preview-viewport', 'the toast belongs over the sample, not over the toolbar')

  // The detail is spans, not one string: `label` is a key and `"New"` is a string, and a
  // page with a syntax theme colors both by the names hljs would have given them.
  assert.deepEqual([...detail.querySelectorAll('span')].map((span) => [span.className, span.textContent]),
    [['hljs-attr', 'label'], ['hljs-string', '"New"']])
})

// A sample that fires on every pointermove would otherwise flash a name over itself
// forever. The readout is the record and stays either way.
test('no-toast leaves the counting alone and the preview clear', async() => {
  const element = await mountFilled('manifest="m.json" no-edit no-toast')
  const frame = element.querySelector('iframe')
  const window = element.ownerDocument.defaultView

  frame.dispatchEvent(new window.Event('load'))
  const doc = frame.contentDocument
  const badge = doc.createElement('demo-badge')
  doc.body.appendChild(badge)
  badge.dispatchEvent(new frame.contentWindow.CustomEvent('demo-badge-click'))

  assert.equal(element.querySelector('.code-preview-toast'), null)
  assert.equal(element.querySelector('.code-preview-event-count').textContent, '1×')
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
