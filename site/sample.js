// Loaded inside a preview frame, not by the example page — the stand-in for a library's
// own bundle, and here for one reason: the options panel's Events group needs something
// that fires.
//
// Deliberately not a custom element. `demo-badge` is still nothing but a styled unknown
// tag (see sample.css), which is what keeps the rest of the demo honest — this is a
// delegated listener over the document, five lines, and the badge does not know it exists.
//
// The event does not bubble, which is the case worth demonstrating: the panel listens on
// the frame's document in the capture phase, so it hears one either way.
document.addEventListener('click', (event) => {
  const badge = event.target.closest?.('demo-badge')
  if (!badge) return
  badge.dispatchEvent(new CustomEvent('demo-badge-click', {
    detail: { label: badge.getAttribute('label'), badge }
  }))
})
