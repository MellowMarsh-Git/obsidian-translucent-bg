# Translucent BG — Documentation

## Settings

| Setting | Description |
|---|---|
| **Background material** | Mica, Acrylic, Tabbed, or None |
| **Let the theme handle background opacity** | Uses `--translucent-light/dark-opacity` from your theme instead of the opacity sliders |
| **Light / Dark mode background opacity** | Opacity for each mode, 0–1 *(plugin-managed only)* |
| **Let the theme handle background tint** | Uses `--background-secondary` as the tint color instead of the color pickers |
| **Light / Dark mode tint color** | Tint color for each mode *(plugin-managed only)* |
| **Reset to defaults** | Restore all settings to factory defaults |

Each toggle hides its child controls when enabled. The two toggles are fully independent.

---

## Tinting modes

Both modes produce the same visual result — the difference is who controls it.

### Plugin-managed (default)

You pick a hex color and opacity for light and dark mode separately. The tint stays consistent regardless of which theme is active.

**Best for:** users who want a fixed look, or who prefer manual sliders and color pickers.

### Theme-managed

The two toggles are independent, so you can mix and match:

- **Tint toggle on** — tint color is sourced from your theme's `--background-secondary`
- **Opacity toggle on** — opacity is read from `--translucent-light-opacity` / `--translucent-dark-opacity` on `:root`
- **Both on** — additionally sets `--workspace-background-translucent` using the same expression Obsidian themes use natively, so the workspace shell layer is also tinted correctly

**Best for:** users and theme authors who want the translucency to adapt automatically when switching themes.

---

## How it works

The plugin calls `BrowserWindow.setBackgroundMaterial(material)` via Electron to apply the chosen material, adds `is-translucent` to `<body>`, and injects a full-screen `<div id="translucent-bg-overlay">` at `z-index: -1` that carries the tint.

The overlay reads two custom properties written to `<body>` at runtime:

- `--tbg-tint-base` — the tint color (hex or `var()`)
- `--tbg-tint-opacity` — the alpha channel (0–1 or `var()`)

Applied in CSS using `background-color` and `opacity` on the overlay element (which has no children, so element opacity is safe):

```css
background-color: var(--tbg-tint-base);
opacity: var(--tbg-tint-opacity);
```

Each toggle controls exactly one variable:

| Toggle | Variable controlled |
|---|---|
| Tint toggle on | `--tbg-tint-base` → `var(--background-secondary)` |
| Opacity toggle on | `--tbg-tint-opacity` → `var(--translucent-light/dark-opacity)` |
| Both on | also sets `--workspace-background-translucent` for the workspace shell |

A `MutationObserver` watches `<body>` class changes and updates both variables instantly when you switch between light and dark mode.

---

## For theme authors

To control opacity in theme-managed mode, define these on `:root` in your theme:

```css
:root {
  --translucent-light-opacity: 50%;
  --translucent-dark-opacity:  50%;
}
```

The tint color is automatically derived from `--background-secondary`, so it always matches your palette with no extra work. If you want to override the color as well, set `--tbg-tint-base` on `:root` (only takes effect when the tint toggle is off, since the toggle's inline style takes priority).
