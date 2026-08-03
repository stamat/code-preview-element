// Loaded inside a preview frame, not by the example page — the stand-in for the inline
// `<script>` a Serbian docs site would put above its own bundle tag, and it is here to
// demonstrate the one rule that matters: this has to run before the element registers.
//
// It is listed first in that frame's `js`, and every url there is deferred — deferred
// scripts run in document order, so first in the list is first to run and the bundle
// behind it finds this already on the window.
//
// Partial on purpose, and the omissions are the point. `console`, `scriptError` and
// `rendered` are not here, so the strip under the inner block is still named "Console" —
// what you leave out keeps its English default rather than going blank.
window.codePreviewStrings = {
  edit: 'Izmeni',
  run: 'Pokreni',
  hintClosed: 'Pritisni Enter za izmenu',
  hintOpen: 'Pritisni Esc za izlaz',
  tablist: 'Primer',
  actions: 'Radnje nad primerom',
  fit: 'Prilagodi',
  widths: 'Širina prikaza',
  // The placeholder moves: English says "html sample" and this says "primer koda: html".
  // A string built by gluing a value onto the end could only ever have said the first.
  sample: 'primer koda: {language}'
}
