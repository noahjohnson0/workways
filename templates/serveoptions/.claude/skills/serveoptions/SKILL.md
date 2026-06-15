---
name: serveoptions
description: >-
  Make a visual / UX decision by SEEING it, not arguing about it. Generate N
  meaningfully-distinct variations of a UI element, wire them to a ?option=N URL
  param with a dev-only selector pill, serve locally, and let the user pick the
  winner in the real running app. Use for subjective look-and-feel calls (font,
  color, spacing, layout density, a component's shape) where the right answer is
  "whichever looks best in context." NOT for correctness decisions (those have a
  test), and NOT for anything that should ship more than one variation.
---

# serveoptions

The trap with a visual decision is judging options anywhere except where they
will actually live: a swatch board, a Figma frame, an isolated `/preview` page
with gray boxes. Every one of those lies, because the real page has a real
palette, real copy, real neighbors, and a real responsive width that change how
a choice reads. serveoptions evaluates each option **in the real app** and
nowhere else.

## The method

1. **Generate N distinct variations.** Not five shades of the same idea, N
   genuinely different directions. Each variation is selectable by a single
   value (a CSS variable, a class, a prop).
2. **Wire them to `?option=N`.** A small client component reads the param,
   applies variation N to the real element, and renders a fixed dev-only pill
   that cycles options (and writes `?option=N` back into the URL so a specific
   pick is shareable). Default with no param shows the current/baseline.
3. **Gate it to development.** The selector returns nothing in a production
   build (`process.env.NODE_ENV === 'production'`), so it can never leak.
4. **Serve locally and let the user look.** They cycle the pill, judge each in
   place, and tell you the winning N.
5. **Strip everything but the winner.** Delete the selector, the losing
   variations, and the scaffolding. The whole thing is throwaway by design; the
   point was to look once, honestly, then stop guessing.

## Wiring pattern (framework-agnostic)

Apply the variation through ONE indirection the real element already reads, so
you touch the real element exactly once:

```tsx
// real element reads a variable:  style={{ fontFamily: 'var(--headline, <default>)' }}
// selector sets it per option:
const OPTIONS = [
  { label: 'Current',  value: 'var(--font-a)' },
  { label: 'Option 1', value: 'var(--font-b)' },
  // ...
];
function applyOption(n) {
  // set it where the source variables are in scope (often <body>, not <html>)
  document.body.style.setProperty('--headline', OPTIONS[n].value);
}
```

Read N from `?option=` on mount, expose prev/next buttons that update both the
applied value and the URL, and bail out entirely in production.

## Gotchas

- **CSS-variable scope.** If your option values reference other CSS variables
  (e.g. framework-injected font variables that live on `<body>`), set your
  override on the element where those names are in scope. Setting it on an
  ancestor that lacks them makes `var()` resolve to nothing and silently fall
  back to the default, so the picker "does nothing."
- **Keep the variations real.** If two options look identical in place, you
  didn't generate enough spread, widen the difference before asking anyone to
  choose.
- **Don't keep it.** A serveoptions selector left in the codebase is a smell. It
  is a decision tool, not a feature.

## Capturing the decision

To record a headless video of the options being cycled (for a PR, a writeup, or
proof the decision happened), see the `headless-webm` method in the
`pr-screenshots` cluster: one Playwright context with `recordVideo`, click the
pill on a timer, close the context to flush the file.
