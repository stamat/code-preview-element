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
  .toc-disclosure > summary {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    cursor: pointer;
    /* Sentence case at full strength, and under the body size. Three separate calls:
       uppercase strips the word shapes readers scan by and is slower to read, which is a
       cost worth paying for a sidebar's micro-label and not for a control; `--fg-muted`
       on a thing you click reads as disabled, and the caret inherits it; and 0.875rem
       keeps it below `h3`'s 1.2rem, so it never enters the article's heading scale. */
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--fg);
    list-style: none; /* drops the native marker everywhere... */
  }
  .toc-disclosure > summary::-webkit-details-marker {
    display: none; /* ...except Safari, which wants it said this way */
  }
  .toc-disclosure > summary:hover {
    background: color-mix(in srgb, currentcolor 5%, transparent);
  }
  /* The summary is only rounded where it is actually the box's edge: closed it is the
     whole box, open the list sits underneath and the bottom two corners square off. */
  .toc-disclosure[open] > summary {
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  /* A half turn rather than a quarter, so it reads the same either way round in RTL. */
  .toc-disclosure > summary::before {
    content: "";
    flex: none; /* the caret never squeezes */
    width: 1rem;
    height: 1rem;
    background: currentcolor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L8 8.94l3.72-3.72a.749.749 0 0 1 1.06 0Z'/%3E%3C/svg%3E") center / contain no-repeat;
    transition: rotate 250ms ease;
  }
  .toc-disclosure[open] > summary::before { rotate: 180deg; }
  @media (prefers-reduced-motion: reduce) {
    .toc-disclosure > summary::before { transition: none; }
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
  /* The filter emits this for H3s. None here yet — but without the rule the first one
     added would be indistinguishable from an H2. */
  .toc .toc-h3 a { padding-left: 1rem; }
</style>

<h1>&lt;code-preview&gt;</h1>
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

## A sample that runs its own script

Markup and css are inert, so they apply as you type. Js is not, and it is the one thing
this element will not do behind your back: running it reloads the document, dropping
everything live in the sample, and half-typed js in a same-origin frame hangs this page
along with the preview. An inline `<script>` is js wherever it was typed, so this sample
waits. Change something below and press **Run** at the end of the strip, or
<kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> without leaving the editor. Run means
run, every time — press it without editing anything and the counter starts over.

<code-preview reload style="--code-preview-height: 70px">

```html
<button id="go">Click me</button>
<p id="out"></p>
<script>
  let n = 0;
  go.onclick = () => (out.textContent = `clicked ${++n}`);
</script>
```

</code-preview>

## Several fences, several tabs

Markup, css and js written as the three fences they are become three tabs — the
language read off each fence, nothing to configure. The tabs sit above the code they
switch; Edit and Run sit in the block's bottom-left corner, opposite the theme's own copy
button, and Edit means whichever pane you are looking at. The js pane waits for
**Run** the same way an inline `<script>` does; the css pane never does, because an edit
there is a write into the frame's stylesheet. Click the button a few times, then restyle
it on the CSS tab and watch the count survive.

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
