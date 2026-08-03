---
layout: poops-docs-theme/prose
description: Live, editable HTML samples in an isolated iframe — the element demonstrated by the element.
---

<link rel="stylesheet" href="code-preview.min.css">
{# The page is the docs theme's `prose` layout: topbar, one article, its own tokens and
   its own highlight.js colors. Which makes it the honest test — the element's stylesheet
   names its own --code-preview-* properties, and every one of them falls back to the
   generic --border, --bg, --fg, --fg-muted, --accent, --radius or --font-mono before
   its default. This page sets none of the prefixed ones, so the element takes the
   theme's tokens through that second level without being told. #}
{# The stylesheet link goes after css/prose.min.css, so the two rules they both write —
   the `pre` margin and the iframe's aspect-ratio — go to the element on equal
   specificity. The third one, the `.code-wrap` margin the theme's copy button needs, it
   cannot win on specificity — the theme yields that one itself, in `_prose.scss`. #}
{# The link also has to lead this run of html rather than follow the notes above it:
   markdown renders before the template engine, so a `{#` comment that opens a chunk is
   prose to marked and comes back wrapped in a `<p>` the engine then empties. Every
   template tag on this page therefore sits in html that began with a tag — here the
   link, below the intro and the toc's `<details>` — and none of them contains a blank
   line, which would end that html and put the rest of the tag back into a paragraph.
   The empty line below is the same rule read the other way: `<style>` has to be the tag
   that opens the next run rather than a line inside this one, because a style block is
   raw all the way to its closing tag — blank lines in the css and all — and a line in
   the middle of someone else's run is not. #}

<style>
  /* The theme's own copy of this rule ships after the version installed here, so the
     override stays until the dependency catches up. Harmless once it has — the same
     declaration, at the same specificity, later in the cascade. It is also the worked
     example: any other theme with a `.code-wrap` wrapper needs exactly this line. */
  .prose code-preview > :is(pre, .code-wrap) { margin: 0; }

  /* The `toc` filter's markup is styled by the theme's *docs* bundle, where this nav
     sits in the sidebar underneath the page's own nav link — that link is its title.
     This page links only the prose half and has no sidebar, so it needs a title of its
     own and a break from the intro, or it reads as a stray list of links. That title is
     the `<summary>` of the disclosure below — the filter already puts
     `aria-label="On this page"` on the nav, so this is the same label made visible and
     made a control, not a second one.

     Bordered and rounded, which is this theme's idiom — `pre`, admonitions and tables
     all carry the same hairline and `--radius`. What it deliberately has no fill:
     `--bg-alt` and `--bg-code` are the same color, so a filled box here is pixel-wise
     a code block, and this page is nothing but code blocks. An unfilled outline also
     stays clear of what Nielsen Norman warns about for main-body placement — a filled,
     decorated panel above the article is the shape of an ad, and readers skip it.

     The look is `<accordion-elemental>`'s, ported: the box itself unpadded so the inset
     sits on the summary and on the list, the hover fill and the caret mixed out of
     `currentcolor` so both follow the theme switch, and the caret drawn as a mask rather
     than a background image so it takes the summary's color instead of baking one in.
     One thing is deliberately not that element's: its caret is trailing, because its rows
     are full-width questions and the far edge is where a run of them lines up. This is one
     label with a list under it, and there is no run to line up with — so the caret sits
     where the native marker does, beside the word it opens. */
  .toc-disclosure {
    margin: 0 0 3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  /* Shared with the FAQ at the bottom of the page, which is the same disclosure worn as a
     run of rows: one flex line, the native marker dropped, a hover fill mixed out of
     `currentcolor` so it follows the theme switch. Only where the caret sits differs. */
  .toc-disclosure > summary,
  .faq > details > summary {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.75rem 1rem;
    cursor: pointer;
    font-weight: 600;
    /* `--fg-muted` on a thing you click reads as disabled, and the caret inherits it. */
    color: var(--fg);
    list-style: none; /* drops the native marker everywhere... */
  }
  .toc-disclosure > summary::-webkit-details-marker,
  .faq > details > summary::-webkit-details-marker {
    display: none; /* ...except Safari, which wants it said this way */
  }
  .toc-disclosure > summary:hover,
  .faq > details > summary:hover {
    background: color-mix(in srgb, currentcolor 5%, transparent);
  }
  .toc-disclosure > summary {
    border-radius: var(--radius);
    /* Sentence case at full strength, and under the body size. Two calls: uppercase strips
       the word shapes readers scan by and is slower to read, which is a cost worth paying
       for a sidebar's micro-label and not for a control; and 0.875rem keeps it below
       `h3`'s 1.2rem, so it never enters the article's heading scale. */
    font-size: 0.875rem;
  }
  /* The summary is only rounded where it is actually the box's edge: closed it is the
     whole box, open the list sits underneath and the bottom two corners square off. */
  .toc-disclosure[open] > summary {
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  /* A half turn rather than a quarter, so it reads the same either way round in RTL. */
  .toc-disclosure > summary::before,
  .faq > details > summary::after {
    content: "";
    flex: none; /* the caret never squeezes */
    width: 1rem;
    height: 1rem;
    background: currentcolor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L8 8.94l3.72-3.72a.749.749 0 0 1 1.06 0Z'/%3E%3C/svg%3E") center / contain no-repeat;
    transition: rotate 250ms ease;
  }
  /* The FAQ's is the trailing one, so it takes the leftover width rather than sitting
     against the question — a run of rows lines its carets up at the far edge. */
  .faq > details > summary::after { margin-inline-start: auto; }
  .toc-disclosure[open] > summary::before,
  .faq > details[open] > summary::after { rotate: 180deg; }
  @media (prefers-reduced-motion: reduce) {
    .toc-disclosure > summary::before,
    .faq > details > summary::after { transition: none; }
  }
  /* No left rule on the list: the container's border already fences it off, and two
     lines around six links is one too many. The indent is the caret's width plus its
     gap, so the links start where the title they belong to starts, not where its
     marker does. */
  .toc { padding: 0 1rem 1rem; }
  .toc ul { list-style: none; margin: 0 0 0 1.5rem; padding: 0; }
  /* No color and no `text-decoration` here on purpose: the theme's `.prose a` already
     underlines, and drops the underline on hover. A toc link that reads differently from
     every other link in the article is the thing both Nielsen Norman and Canada.ca warn
     about — these are links, so they look like the page's links. Only the box matters. */
  .toc a { display: block; padding: 0.2rem 0; }
  /* The filter emits this for H3s. None here yet — the FAQ's questions are H3s, but the
     filter keys on the heading's `id` and theirs is on the `<summary>` around it, so they
     stay out. Without the rule the first one that did land would be indistinguishable
     from an H2. */
  .toc .toc-h3 a { padding-left: 1rem; }

  /* `<accordion-elemental class="grouped caret">`, ported: rows sharing one border, one
     radius on the outer corners only, the caret trailing because a run of full-width
     questions lines up at the far edge. Plain `<details>` rather than the element — this
     page ships one script for the thing it documents and the browser already does the
     rest: expanded state announced, Enter and Space handled, find-in-page and a `#faq-…`
     link opening a closed one. What is lost by not loading it is the slide, which is
     the one part of an accordion nothing native does yet. */
  .faq {
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  /* `:not(:first-of-type)` rather than `details + details`: markdown decides what lands
     between two html runs, and adjacency is not worth betting a border on. */
  .faq > details:not(:first-of-type) { border-top: 1px solid var(--border); }
  /* The question is an H3 so a screen reader can skim the section by heading — the
     summary is what carries the weight and the size, and the heading inside it brings
     neither. */
  .faq > details > summary > h3 {
    margin: 0;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
  }
  /* The answer is markdown, so it arrives as the article's own paragraphs and lists —
     indented to the summary's text, and with the last child's bottom margin traded for
     padding so it cannot collapse out through the row's edge. */
  .faq > details > :not(summary) { padding-inline: 1rem; }
  .faq > details > summary + * { margin-block-start: 0.25rem; }
  .faq > details > :last-child {
    margin-block-end: 0;
    padding-block-end: 1rem;
  }

  /* The readme's shields, same three and in the same order. A flex row rather than
     inline images, so the gap is a declaration instead of the whitespace between the
     tags, and a wrapped second row keeps the gap too. `--radius` is 0.5rem and these
     badges are 20px tall — the theme's image radius would round their corners into
     the label text, so they keep the 3px shields.io draws them with. */
  .badges { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .badges img { border-radius: 3px; }
</style>

<h1>&lt;code-preview&gt;</h1>
<p class="badges">
  <a href="https://www.npmjs.com/package/code-preview-element"><img src="https://img.shields.io/npm/v/code-preview-element" alt="npm version"></a>
  <a href="https://github.com/stamat/code-preview-element/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/stamat/code-preview-element/ci.yml?branch=main&amp;label=ci" alt="ci"></a>
  <a href="https://github.com/stamat/code-preview-element/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license MIT"></a>
</p>
<p>A code block that renders itself: <code>&lt;code-preview&gt;</code> wraps a highlighted
  <code>&lt;pre&gt;&lt;code&gt;</code> in a live preview — an iframe above the code, the code editable on
  request, edits applied as you type. The sample is the only source of truth, so a documented
  example and what it actually does cannot drift apart.</p>
<p>Edit any sample below — the preview above it follows as you type. The theme switcher
  in the topbar drives this page and, wherever a sample passes
  <code>theme-attribute="data-theme"</code>, the frame with it.</p>
{# The title and the intro are the one piece of prose left as html, because the capture
   below has to open inside a run of html and this is what it opens against. Everything
   from here to `{% endset %}` is markdown. #}
{# Captured, then rendered twice — once through `toc` for the headings, once as itself.
   The docs layout does this at the layout level, around its `{% block content %}`; this
   page *is* that block, so it does it here. The filter reads the ids off the rendered
   html, which the markdown heading renderer emits — one reason this page is markdown at
   all, since as html the H2s had to carry them by hand. #}
{% set body %}

## Features

Live-code components are not a new idea. What is specific here:

- **It wraps the code block you already have.** Every other tool in this space asks you to
  author demos in its own format — a js function, a multi-file manifest, a custom fence.
  This takes the `<pre><code>` your site generator already emitted, hljs classes and all,
  and upgrades it in place. Nothing to port.
- **Emulated viewport widths.** `viewport-width` gives the frame a genuine css width and
  scales the result down to fit, so a sample's desktop media queries actually apply inside
  a 700px docs column. `viewport-widths` turns that into a row of buttons.
- **It lives in the light DOM.** The code block keeps this page's syntax theme and prose
  styles instead of being sealed off from them by a shadow root, and the page's
  `[data-theme]` is mirrored into the frame — so a demo goes dark with the docs around it.
  A tool that sandboxes its preview onto a separate origin structurally cannot do that.
- **Scenery behind the sample.** `backdrop` lays a `<template>` from your page under every
  preview that names it — column guides, a baseline ruler, a device bezel. Written once in
  the layout, and never a tab, never highlighted, never editable: the code block still
  shows only the sample.
- **Several fences, several tabs.** Markup, css and js written as the three blocks they
  are become three panes, the language read off each fence. Nothing to configure.
- **An options panel from a manifest you already ship.** The controls are generated from
  `custom-elements.json` — the format the ecosystem has, not one invented here.
- **A console strip under the block.** What the sample logs, and an uncaught throw,
  land against the code that caused them rather than in a devtools panel.
- **Editing is asked for, not assumed.** A block is a code block until you press Edit;
  a page full of quietly editable blocks is a keyboard trap in the middle of the prose.
- **Two script tags and no build step.** 7.5KB gzipped on a docs site that already ships
  highlight.js — [CodeJar](https://github.com/antonmedv/codejar) for the editor is 2KB of
  that — 23KB standalone, with highlight.js carried along. No service worker, no bundler
  config, no origin to serve demo files from.

## Intended use

Documentation for something you can demonstrate in markup — a css library, a custom
element, anything whose api is an attribute and a class name. The sample is the
`<pre><code>` your site generator already emitted, and the preview above it is that exact
text rendered, so the example on the page and the thing it documents cannot drift apart.
Everything below this section is that arrangement, on the page it documents.

It assumes the code is yours. The frame is a `srcdoc` document with no `sandbox`, which is
what buys the height measurement and the theme write — it is also same-origin, so a sample
can reach the page around it. That is the right trade for prose you wrote plus edits a
reader types into their own browser: the worst case is a reader XSSing themselves, and
nothing is stored or shared. It is the wrong one for a playground whose samples arrive in
a url, which is somebody else's script running on your origin.

And demo code is never built — it goes into the frame verbatim. No TypeScript, no JSX, no
bare `import`s resolved from npm, no fork-and-keep. When the sample needs any of those,
the tool for it is [playground-elements](https://github.com/google/playground-elements),
[Sandpack](https://sandpack.codesandbox.io/) or a StackBlitz embed; the
[readme](https://github.com/stamat/code-preview-element#intended-use) has the whole table
of when to reach for which.

## A sample with no assets

Renders in a bare document, so it shows the browser's own defaults. Every sample on
this page also carries its own `--code-preview-height`, measured once — the stylesheet's
8rem default is a guess, and six previews all settling away from it after load is a page
that moves under an anchor link.

<code-preview style="--code-preview-height: 117px">

```html
<p>Hello from inside the frame.</p>
<p><small>Try editing this.</small></p>
```

</code-preview>

## A sample with a stylesheet

`css` takes whitespace-separated urls, resolved against this page.

<code-preview css="sample.css" theme-attribute="data-theme" style="--code-preview-height: 128px">

```html
<div class="card">
  <h3>Card</h3>
  <p>Styled by sample.css, which follows the page's theme.</p>
</div>
```

</code-preview>

## A wide viewport, scaled down

A frame in a text column is a ~700px viewport, and the media queries inside read that
honestly — so a responsive sample only ever shows its narrow layout.
`viewport-width="1024"` renders at a real 1024px and scales the result to fit, so the
wider breakpoints apply. `viewport-widths` adds the buttons — or narrow your window and
watch it fall back on its own.

<code-preview css="sample.css" theme-attribute="data-theme" viewport-width="1024" viewport-widths="375 768 1024" style="--code-preview-height: 92px">
{# The one height here that is only right at one column width: this preview is scaled by
   column/1024, so it settles shorter in a narrower window. Reserved at what a full-width
   column gives it, which is the common case and errs tall rather than short. #}

```html
<div class="cols">
  <div class="card">
    <h3>One</h3>
    <p>Three across above 900px.</p>
  </div>
  <div class="card">
    <h3>Two</h3>
    <p>Two across above 600px.</p>
  </div>
  <div class="card">
    <h3>Three</h3>
    <p>Stacked below that.</p>
  </div>
</div>
```

</code-preview>

## Scenery behind the sample

Some samples need a set, not just a stage. `backdrop` names a `<template>` on this page by
id, and its markup goes into the frame underneath the sample — column guides here, a
baseline ruler or a device bezel elsewhere. It is scenery and not sample: it is not a
fence, so it is not a tab, is not highlighted and cannot be typed into, and the code block
below still shows only the three cards. Write the template once in your layout and every
preview on the page opts in with one attribute.

The guides are built from the same breakpoints `.cols` uses, inside the same frame, so
they answer the same width — press the buttons and watch the columns land on them.

<div><template id="grid-guides"><div class="guides" aria-hidden="true"><i></i><i></i><i></i></div></template></div>
{# The wrapping div is markdown's, not the element's: `template` is not on marked's list of
   block tags, so the line on its own comes back inside a `<p>`. A div is on the list. In a
   real site this lives in the layout, where there is no markdown to negotiate with.
   `aria-hidden` because three empty boxes are decoration, and a screen reader reading the
   set before every sample is worse than no set at all. #}

<code-preview css="sample.css" theme-attribute="data-theme" backdrop="grid-guides" viewport-width="1024" viewport-widths="375 768 1024" style="--code-preview-height: 92px">
{# Same reservation as the scaled preview above, and for the same reason: this one is
   scaled by column/1024 too, and the backdrop is `position: fixed`, so it adds nothing to
   what is measured. #}

```html
<div class="cols">
  <div class="card">
    <h3>One</h3>
    <p>Three across above 900px.</p>
  </div>
  <div class="card">
    <h3>Two</h3>
    <p>Two across above 600px.</p>
  </div>
  <div class="card">
    <h3>Three</h3>
    <p>The guides move with them.</p>
  </div>
</div>
```

</code-preview>

## A sample that runs its own script

Markup and css are inert, so they apply as you type. Js is not, and it is the one thing
this element will not do behind your back: half-typed js in a same-origin frame hangs
this page along with the preview. An inline `<script>` is js wherever it was typed, so
this sample waits. Change something below and press **Run** in the block's bottom-left
corner, or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> without leaving the editor.
Run means run, every time — press it without editing anything and the counter starts
over. And what the sample logs lands in a console strip under the block it is logged from,
which starts over with it — an uncaught throw included, tinted and announced.

<code-preview style="--code-preview-height: 70px">

```html
<button id="go">Click me</button>
<p id="out"></p>
<script>
  let n = 0;
  go.onclick = () => {
    out.textContent = `clicked ${++n}`;
    console.log("clicked", n);
  };
</script>
```

</code-preview>

## Several fences, several tabs

Markup, css and js written as the three fences they are become three tabs — the
language read off each fence, nothing to configure. The tabs sit above the code they
switch; Edit and Run sit in the block's bottom-left corner, opposite the theme's own copy
button, and Edit means whichever pane you are looking at — an open editor follows you
across the tabs. Only the js pane waits for **Run**, the way an inline `<script>` does:
a css edit is a write into the frame's stylesheet, and a markup edit re-runs the js
pane's own complete text, never the half-typed line under your cursor. Click the button
a few times, then restyle it on the CSS tab and watch the count survive.

<code-preview style="--code-preview-height: 70px">

```html
<button id="go">Click me</button>
<p id="out"></p>
```

```css
button {
  padding: 0.4rem 1rem;
}
```

```js
let n = 0;
go.onclick = () => (out.textContent = `clicked ${++n}`);
```

</code-preview>

## Read-only

`no-edit` renders the preview and leaves the code alone.

<code-preview no-edit style="--code-preview-height: 83px">

```html
<p>You cannot type in this one.</p>
```

</code-preview>

Give it panes to name and it locks only those: `no-edit="css js"` keeps the markup
editable and turns its stylesheet and script into what they are here — context to read,
not knobs to turn. Name a pane by what its tab says (`html`, `css`, `js`) or by the tab's
own name (`code` for the markup one); the tabs you leave out stay editable.

A fence can also say it itself, which is usually the shorter thing to write, and it does
not need a new markdown vocabulary — a bare word after the language is already a class on
the block, and `no-edit` is the class this reads:

````md
```css no-edit
.pill {
  border-radius: 999px;
}
```
````

In hand-written markup it is an attribute instead, on the block or on the `<pre>` around
it: `<pre no-edit><code class="language-css">…</code></pre>`.

Both at once, below: the css pane locks itself from its fence, the js pane is locked by
name on the element.

<code-preview no-edit="js" style="--code-preview-height: 70px">

```html
<button class="pill">Type in me</button>
```

```css no-edit
.pill {
  border: 0;
  border-radius: 999px;
  padding: 0.4rem 1rem;
}
```

```js
document.querySelector(".pill").onclick = (event) =>
  (event.target.textContent = "Read-only css");
```

</code-preview>

## An options panel

`manifest` points at a
[custom-elements.json](https://github.com/webcomponents/custom-elements-manifest), and
its presence is what turns the second tab on. The controls are generated from it: the
attributes come from `attributes[]`, the custom properties from `cssProperties[]`, and
each one's control from the type or syntax the manifest already declares. No manifest,
no tabs — every page above renders exactly as it did.

The two halves write to two different places, and both are honest. An **attribute**
belongs to an element in the sample, so its knob rewrites the code above and the code tab
keeps telling the truth — edit it back by hand and the panel re-reads it. A **custom
property** is not part of the sample at all: it goes into a stylesheet inside the frame,
exactly where you would put it, and the rule is printed at the bottom of the panel for
you to copy. Turn nothing, and nothing is written.

**Events** are the third group, and the only read-only one: everything in `events[]` is
listed whether or not it has fired, and counted as it does. Click the badge in the
preview. The color swatch beside `--demo-badge-outline` is the other thing worth looking
at — its default is `transparent`, which no color picker can hold, so it is drawn crossed
out rather than shown as black.

<code-preview css="sample.css" js="sample.js" theme-attribute="data-theme" manifest="sample-manifest.json" tab="options" style="--code-preview-height: 90px; --code-preview-options-height: 192px">
{# `tab="options"` reserves the panel as well as the preview, so this one states both.
   The panel's 192px is what the 12rem default already comes to — measured, not inherited,
   so a manifest gaining a control shows up here as a number to change. #}

```html
<p>Shipping status: <demo-badge label="New" count="3"></demo-badge></p>
```

</code-preview>

### Pointed at itself

The manifest above is hand-written, because the element it documents is: `demo-badge` is
a tag with no JavaScript behind it, so there is no JSDoc for a generator to read. This
package's own manifest is not hand-written. `dist/custom-elements.json` is produced in the
build by
[`@custom-elements-manifest/analyzer`](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/)
from the JSDoc block on the element class, and shipped under the package's
`customElements` key — the same route this page asks of everyone else. Which means the
element can be handed itself and has to cope.

The sample below is a `<code-preview>`, and a real one: the frame loads the same bundles
and the same stylesheet this page does, so what is in there is the element rather than a
picture of one. It links `code-preview-hljs.min.css` too, which this page does not — the
frame is exactly the case that optional stylesheet exists for, a page with no syntax theme
of its own. [`self.css`](self.css) is the other half of the same point: it names `--bg`,
`--fg`, `--border` and the rest of this theme's tokens, at this theme's own values, copied
out of its stylesheet — and the element inside picks every one it reads up without being told, because
that is what its custom properties fall back to. Which is why the block in there looks like
the block around it. The last few lines of that file are the part the tokens cannot do: the
element leaves the `<pre>` to its host, so the frame also needs the theme's code-block rule,
or a themed preview would sit above an unstyled slab of text.

Open the **Options** tab and every knob is this element's own documented surface, the two
halves behaving as they did above and for the same reasons. `--code-preview-accent` and
`--code-preview-radius` restyle the element in the frame and leave the one you are reading
alone: a custom property is written into a stylesheet inside the frame, and the frame is
where it stops. `no-console` is an attribute, so it is written into the code instead, onto
the `<code-preview>` in the sample — tick it and the strip under the inner block stops
taking the button's `console.log`; untick it and the next click is heard again. `manifest`
is the one to try last. Point it at `custom-elements.json` and the element in the frame
grows an Options tab of its own, because the options bundle is loaded in there as well.

The button is three documents down: this page, the frame it built, and the frame the
element in _that_ built.

<code-preview css="code-preview.min.css code-preview-hljs.min.css self.css" js="code-preview-hljs.min.js code-preview-options.min.js" theme-attribute="data-theme" manifest="custom-elements.json" style="--code-preview-height: 260px">
{# No `tab="options"` on this one, unlike its neighbour: the panel is 27 controls tall, and
   reserving that much would open the section with a blank box the height of a screen and
   hide the nesting, which is the thing to look at first. The code tab costs one click to
   leave and the reservation stays a number worth measuring. #}

```html
<code-preview style="--code-preview-height: 56px">
  <pre><code class="language-html">&lt;button onclick="console.log('Three documents down.')"&gt;
  Log something
&lt;/button&gt;</code></pre>
</code-preview>
```

</code-preview>

## In another language

Twelve strings go in front of a reader — the two buttons, the keyboard hint in both of its
states, and the accessible names on the tabs, the width switcher, the console and the block
itself. `window.codePreviewStrings` replaces the ones a page cares about.

The rule is that it has to be set **before** the element registers, and it is the one place
this differs from the highlighter hook next door. A highlighter can be read per call because
recoloring happens again on every keystroke; a label is written once, when the block is
built, and a block already in the markup is built the instant the bundle calls `define`.
There is no moment after that script tag left to say what language the page is in.

So the demo is nested, the way the self-preview above is: the frame below loads
[`strings-sr.js`](strings-sr.js) **first** in its `js` list and the element bundle behind it.
Every url there is deferred and deferred scripts run in document order, which is what makes
"first in the list" mean "before `define`" — the same guarantee an ordinary page gets from
writing one `<script>` tag above another.

Open the inner block and the hint, the buttons and the tab all speak Serbian. The console
strip does not: `strings-sr.js` leaves `console` out, and what you leave out keeps its
English default rather than going blank. Click the button to see it.

<code-preview css="code-preview.min.css code-preview-hljs.min.css self.css" js="strings-sr.js code-preview-hljs.min.js" theme-attribute="data-theme" style="--code-preview-height: 300px">
{# `strings-sr.js` first and the bundle second, which is the whole demonstration — swap the
   two and the inner element registers before the strings exist, so the labels below come
   out in English and nothing else changes. Worth trying by hand in the editor. #}

```html
<code-preview viewport-widths="320" style="--code-preview-height: 56px">
  <pre><code class="language-html">&lt;button onclick="console.log('Pozdrav!')"&gt;
  Pozdravi
&lt;/button&gt;</code></pre>
</code-preview>
```

</code-preview>

Markup still outranks all of it. A `<pre>` or `<code>` carrying its own `aria-label` keeps
it — a docs page that has already named a sample knows more about it than either default.

## Questions

<div class="faq">
<details>
<summary id="faq-build-step"><h3>Is there a build step?</h3></summary>

No. A stylesheet and a script, and any `<pre><code>` you wrap is live — this page is two
`<script>` tags and a `<link>`. A block your generator already highlighted is left exactly
as it is, so nothing reshuffles on load.

</details>
<details>
<summary id="faq-iframe"><h3>Why an iframe, and not the markup inlined into the page?</h3></summary>

Because a docs page cannot host a sample of a css library safely: tag-level rules for
`html`, `body` or `*` restyle the docs around it, `@layer base` rules lose to the theme,
and scoping the stylesheet under a wrapper selector takes `:root` with it and kills the
custom properties. The frame is the isolation — and for a css library it is also the
honest demo, a real page loading the real stylesheet.

</details>
<details>
<summary id="faq-js-waits"><h3>Why does a js edit wait for Run when css applies as I type?</h3></summary>

Because no delay makes running half-typed code safe. The frame is same-origin, so it
shares this page's event loop: `while (true` with the closing paren still to come hangs
the whole tab, not just the preview. A longer debounce would not prevent that, it would
only decide how long you get first. Markup and css are inert, so they have no such line to
cross. <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> and closing the editor are the
other two ways to apply a js edit.

</details>
<details>
<summary id="faq-highlighter"><h3>Can I use Prism, Shiki or my own highlighter?</h3></summary>

Yes. The default build asks the page's `window.hljs` for one method, so anything of that
shape stands in, as long as it is in place before the element registers:

```js
window.hljs = {
  highlightElement(element) {
    /* recolor it, leave textContent alone */
  },
};
```

The block arrives carrying `class="hljs language-<lang>"` and the sample is its
`textContent` — a highlighter that rewrites that text breaks the preview it feeds.

</details>
<details>
<summary id="faq-no-js"><h3>What does a reader with no JavaScript see?</h3></summary>

The code block, highlighted, exactly as the page shipped it. The preview is an
enhancement over markup that stands on its own, which is the other half of why the sample
is a `<pre><code>` rather than a string in a config file.

</details>
<details>
<summary id="faq-height"><h3>Why does every sample here carry its own <code>--code-preview-height</code>?</h3></summary>

A preview's real height is its sample's, and nothing knows that until the frame has
rendered — so space is reserved before either happens, and the stylesheet's `8rem` default
is a guess. Measured once per sample, it is not a guess: on this page that is the
difference between a CLS of `0.0285` and `0.0022`. `no-shrink` covers the other direction,
a late re-measure that comes back shorter.

</details>
<details>
<summary id="faq-frameworks"><h3>Can it preview a React or TypeScript component?</h3></summary>

No — demo code goes into the frame verbatim, so there is no compile step to turn JSX or
types into something a browser runs, and no resolver for a bare `import`. A component
already built to a bundle you can point `js` at is a different question, and that one
works: it is markup and a script, which is all this element ever handles. See
[Intended use](#intended-use).

</details>
</div>
{% endset %}
{# The filter emits a bare `<nav><ul>`, so the disclosure is wrapped around it here
   rather than asked of it. `open`, because on a page this short the list is the point —
   collapsing it is the affordance, not the starting state. #}
<details class="toc-disclosure" open>
  <summary>On this page</summary>
  {{ body | toc }}
</details>
{{ body }}

<script src="code-preview-hljs.min.js"></script>
<script src="code-preview-options.min.js"></script>
