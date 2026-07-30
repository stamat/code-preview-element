// The self-contained build: highlight.js travels inside the bundle, so a single
// <script> tag is the whole install and the page needs no highlighter of its own.
// ~53KB. The default build (code-preview.ts) is the same element without hljs in it,
// for the more common case of a docs site that already loads one.
import hljs from 'highlight.js/lib/core'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import { CodePreview, define, hljsHighlighter } from './element'

export * from './element'

// highlight.js's own alias names, and the same ones static site generators register
// when they highlight fences at build time. Re-highlighting has to agree with that
// build-time output or the block visibly reshuffles the first time it is focused,
// which is also why the dependency is pinned to hljs 11. css and javascript are here
// even for an html-only editor because xml sub-highlights `<style>` and `<script>`
// bodies — but only if it can find them.
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)

// Before `define`, not after: an element already in the markup upgrades the instant
// it is registered, and its first paint asks for this.
CodePreview.highlighter = hljsHighlighter(hljs)
define()
