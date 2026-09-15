# FloVo UI foundation

This file records the reusable visual structure established by the completed Home screen.

## Screen skeleton

Every screen should reuse this hierarchy:

```html
<div class="shell">
  <header class="topbar">...</header>
  <main class="scroll">
    <div class="stack">
      <section class="card">...</section>
    </div>
  </main>
  <nav class="nav">...</nav>
</div>
```

## Shared design tokens

The canonical values are defined in `styles.css` under `:root`.

- `--blue`: brand/action color
- `--ink`: primary text
- `--muted`: secondary text
- `--soft`: neutral control surface
- `--card`: card surface
- `--radius-pill`: common capsule shape
- `--action-border-width` and `--action-border-color`: active action outline
- `--action-top`, `--action-mid`, `--action-bottom`: primary action fill

## Reusable components

- `.card`: primary content surface
- `.practice`: large primary action
- `.bulk-filter-button`: page/section bulk action
- `.section-filter-button`: section action
- `.choice`: selectable option
- `.all`: subgroup bulk action
- `.segmented`, `.segment`: two-way choice
- `.nav`, `.tab`: persistent bottom navigation
- `.help-overlay`, `.help-sheet`: bottom-sheet dialog

## Rules for future screens

1. Reuse the shell, header, cards, controls, and bottom navigation before adding new styles.
2. Use the shared tokens instead of copying literal colors, borders, or pill radii.
3. Keep active controls visually consistent with the Home screen.
4. New screen-specific CSS should be scoped with `data-page`.
5. The Home v1.0 rollback baseline remains commit `d2c6b09786fb6d145ecf2adc239123f5ca0d6893`.
