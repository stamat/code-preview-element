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
// srcdoc). Those need a real browser — `npm run dev` and the example page.
//
// The source is TypeScript for the browser, so it goes through esbuild (a poops
// dependency). Twice: esm to import `buildSrcdoc` here, iife to run inside jsdom.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import path from 'node:path'

const entry = path.resolve(import.meta.dirname, '../src/code-preview.ts')

const bundle = async (format) => (await build({
  entryPoints: [entry],
  bundle: true,
  format,
  target: 'es2019',
  write: false,
  logLevel: 'silent'
})).outputFiles[0].text

let buildSrcdoc
let scaleToFit
let iife

before(async () => {
  // codejar reads `window` at module scope; the class declaration and its
  // registration need `HTMLElement` and `customElements`.
  globalThis.window = globalThis
  globalThis.HTMLElement = class {}
  globalThis.customElements = { get: () => undefined, define: () => {} }
  const esm = await bundle('esm')
  ;({ buildSrcdoc, scaleToFit } = await import(`data:text/javascript;base64,${Buffer.from(esm).toString('base64')}`))
  iife = await bundle('iife')
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

test('the element renders through srcdoc, not into about:blank', () => {
  const page = new JSDOM(`<!DOCTYPE html><html data-theme="dark"><body>
    <code-preview css="../../dist/lib.css" theme-attribute="data-color-scheme" no-edit>
      <pre><code class="hljs language-html">&lt;button class="btn"&gt;Hi&lt;/button&gt;</code></pre>
    </code-preview>
  </body></html>`, { runScripts: 'dangerously' })

  const script = page.window.document.createElement('script')
  script.textContent = iife
  page.window.document.head.appendChild(script)

  const element = page.window.document.querySelector('code-preview')
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
})
