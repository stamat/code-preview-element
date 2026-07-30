# Contributing

Issues and pull requests are welcome. Nothing here is ceremony for its own sake — it is the
short list of things that are hard to notice are missing once a change is already written.

## Getting set up

```
npm install
npm run dev        # site/ on :4040, live reload
npm run build      # dist/ + _site/
npm test           # typecheck + node --test
```

`npm test` is what CI runs, and it is `tsc --noEmit` followed by `node --test`. There is no test
framework and no test config — the runner is Node's own, the suite is one file in
[`test/`](test/), and it bundles `src/` through esbuild (a `poops` dependency) to get at the
browser code. Please keep it that way; a framework here would be more configuration than test.

## What to test, and what not to

The suite covers the two halves that fail silently rather than loudly: `buildSrcdoc`'s output
(a missing doctype puts the frame in quirks mode, a sample parsed into `head` renders as
nothing) and the element inside a jsdom document (writing the sample into the frame's
`about:blank` instead of through `srcdoc` loads no stylesheet and fires no load event — that one
shipped once).

Two things are deliberately **not** tested, because jsdom would assert fiction:

- **Sizing.** jsdom has no layout engine, so any height it reports is invented.
- **The patch-on-edit path.** jsdom fires an iframe's `load` without ever rendering the
  `srcdoc`.

Both need a real browser: `npm run dev` and the site are the check. If your change touches
either, say in the PR what you clicked through.

## Changes that need calling out

This is a custom element, so the public surface is wider than the exported functions. A change
to any of these belongs in `CHANGELOG.md` under `[Unreleased]`, described for the person
upgrading:

- **The DOM the element produces** — nodes inserted, attributes reflected, events fired.
- **CSS an author may already be targeting** — selectors in `code-preview.css`, class names.
- **The contents of the preview iframe** — the default head, how `css`/`js`/`head` are applied,
  what counts as a sample that owns its own document.

## Style

Match what is already in the file you are editing. Two things are load-bearing rather than
taste:

- **Comments explain why, not what.** The existing `//` blocks in `src/` and `poops.json` record
  the reason a thing is the way it is — a browser bug, a spec corner, a rejected alternative.
  That is the kind worth adding.
- **No new runtime dependencies** without a reason in the PR. The package ships two builds whose
  sizes are quoted in the README; anything added lands in one of them.

## Pull requests

Small and focused beats large and complete. Branch off `main`, make sure `npm test` and
`npm run build` both pass, and describe what changed and why — the why is the part review
cannot reconstruct.
