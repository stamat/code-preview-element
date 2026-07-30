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

const bundle = async (entry, format) => (await build({
  entryPoints: [entry],
  bundle: true,
  format,
  target: 'es2019',
  write: false,
  logLevel: 'silent'
})).outputFiles[0].text

let buildSrcdoc
let scaleToFit
// The two bundles: the default, which expects the page to have brought a highlighter,
// and the one with highlight.js inside it. Most of what follows is about the element
// rather than either build, and runs against `bundled` because it can assert colour.
let plain
let bundled

before(async () => {
  // codejar reads `window` at module scope; the class declaration and its
  // registration need `HTMLElement` and `customElements`.
  globalThis.window = globalThis
  globalThis.HTMLElement = class {}
  globalThis.customElements = { get: () => undefined, define: () => {} }
  const esm = await bundle(src('code-preview'), 'esm')
  ;({ buildSrcdoc, scaleToFit } = await import(`data:text/javascript;base64,${Buffer.from(esm).toString('base64')}`))
  plain = await bundle(src('code-preview'), 'iife')
  bundled = await bundle(src('code-preview-hljs'), 'iife')
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
function mount (
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
  assert.equal(bar.getAttribute('role'), 'group')
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
