// The default build: the element and CodeJar, and no highlighter of its own — a docs
// site that already loads highlight.js should not ship a second copy of it. ~11KB
// against the ~53KB of code-preview-hljs.ts, which is the same element with hljs
// bundled in for a page that has none. The element itself is in element.ts.
//
// The global is read per call rather than once here, so the order of the two script
// tags does not matter and a page that loads hljs late still gets colour. A page with
// no runtime hljs at all — fences highlighted at build time, nothing shipped to the
// browser — is the case this build cannot fix: the preview and the editor work, the
// first paint keeps whatever colour the generator baked in, and typing stops
// recolouring. That page wants the hljs build.
import { CodePreview, define, hljsHighlighter } from './element'

export * from './element'

CodePreview.highlighter = (element, language) => {
  const hljs = (globalThis as any).hljs
  if (hljs) hljsHighlighter(hljs)(element, language)
}
define()
