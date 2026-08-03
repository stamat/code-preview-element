// The default build: the element and CodeJar, and no highlighter of its own — a docs
// site that already loads highlight.js should not ship a second copy of it. ~11KB
// against the ~53KB of code-preview-hljs.ts, which is the same element with hljs
// bundled in for a page that has none. The element itself is in element.ts.
//
// The global is read per call rather than once here, so the order of the two script
// tags does not matter and a page that loads hljs late still gets color. A page with
// no runtime hljs at all — fences highlighted at build time, nothing shipped to the
// browser — is the case this build cannot fix: the preview and the editor work, the
// first paint keeps whatever color the generator baked in, and typing stops
// recoloring. That page wants the hljs build.
import { CodePreview, define, hljsHighlighter } from './element'

export * from './element'

CodePreview.highlighter = (element, language) => {
  const hljs = (globalThis as any).hljs
  if (hljs) hljsHighlighter(hljs)(element, language)
}

// The one thing that cannot be read per call the way the highlighter is: a label is
// written once, when the block is built, and a block already in the markup is built the
// instant `define` runs on the line below. So the page states its language before the
// bundle's script tag, in a global, and this is the line that picks it up — the same
// route `hljs` takes in, for the same reason there is no other one available to a page
// with no build step.
CodePreview.strings = (globalThis as any).codePreviewStrings
define()
