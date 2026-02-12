# Design System

ClaudeHydra uses a dual-theme design system: **Matrix Green** (dark) and **White Wolf** (light). The visual identity draws from CRT monitor aesthetics, glass-morphism panels, and The Witcher universe.

## Color Palette

### Dark Theme -- Matrix Green

| Token                  | Value                      | Usage                         |
|------------------------|----------------------------|-------------------------------|
| `--matrix-bg-primary`  | `#0a1f0a`                  | Main background               |
| `--matrix-bg-secondary`| `#001a00`                  | Sidebar, secondary panels     |
| `--matrix-bg-tertiary` | `#0d2a0d`                  | Elevated surfaces             |
| `--matrix-accent`      | `#00ff41`                  | Primary accent, active states |
| `--matrix-accent-hover`| `#33ff66`                  | Hover states                  |
| `--matrix-accent-dim`  | `#00cc33`                  | Subdued accent                |
| `--matrix-accent-glow` | `#33ff66`                  | Glow effects                  |
| `--matrix-text-primary`| `#c0ffc0`                  | Body text                     |
| `--matrix-text-secondary`| `#80c080`                | Muted text, labels            |
| `--matrix-border`      | `#1a3a1a`                  | Panel borders                 |
| `--matrix-error`       | `#ff4444`                  | Error states                  |
| `--matrix-warning`     | `#ffaa00`                  | Warning states                |
| `--matrix-success`     | `#00ff41`                  | Success states (= accent)     |

### Light Theme -- White Wolf

| Token                  | Value                      | Usage                         |
|------------------------|----------------------------|-------------------------------|
| `--matrix-bg-primary`  | `#f5f8f5`                  | Main background               |
| `--matrix-bg-secondary`| `#e8ede8`                  | Sidebar, secondary panels     |
| `--matrix-bg-tertiary` | `#dce3dc`                  | Elevated surfaces             |
| `--matrix-accent`      | `#2d6a4f`                  | Primary accent (forest green) |
| `--matrix-accent-hover`| `#1b4332`                  | Hover states                  |
| `--matrix-accent-dim`  | `#40916c`                  | Subdued accent                |
| `--matrix-accent-glow` | `#52b788`                  | Glow effects (muted)          |
| `--matrix-text-primary`| `#1a2a1a`                  | Body text                     |
| `--matrix-text-secondary`| `#4a5a4a`                | Muted text, labels            |
| `--matrix-border`      | `#c8d8c8`                  | Panel borders                 |
| `--matrix-error`       | `#d32f2f`                  | Error states                  |
| `--matrix-warning`     | `#ed6c02`                  | Warning states                |
| `--matrix-success`     | `#2e7d32`                  | Success states                |

## Theme Switching

Themes are controlled by the `data-theme` attribute on the root `<html>` element:

```html
<html data-theme="dark">  <!-- Matrix Green -->
<html data-theme="light"> <!-- White Wolf -->
```

All CSS variables are scoped under `:root, [data-theme='dark']` and `[data-theme='light']`. Switching themes is instant -- no page reload required.

## CSS Variables Reference

### Glass Effect Variables

```css
/* Dark theme */
--glass-bg: rgba(0, 0, 0, 0.4);
--glass-border: rgba(255, 255, 255, 0.1);
--glass-blur-val: 16px;
--glass-blur: blur(16px) saturate(180%);
--glass-radius: 12px;

/* Light theme */
--glass-bg: rgba(255, 255, 255, 0.6);
--glass-border: rgba(0, 0, 0, 0.1);
--glass-blur: blur(16px) saturate(150%);
```

### Shadow Variables

```css
--shadow-matrix-glow: 0 0 20px rgba(0, 255, 65, 0.15);
--shadow-matrix-glow-sm: 0 0 10px rgba(0, 255, 65, 0.1);
--shadow-glass: 0 8px 32px rgba(0, 0, 0, 0.3);
```

## Glass Panels

Glass-morphism is the primary surface treatment. Five variants are available:

### `.glass-panel` (default)

Standard glass surface with backdrop blur.

```css
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur-val)) saturate(180%);
  border-radius: 12px;
  border: 1px solid var(--glass-border);
}
```

### `.glass-panel-dark`

Forced dark glass (regardless of theme).

### `.glass-panel-light`

Forced light glass (regardless of theme).

### `.glass-panel-solid`

Solid background without blur. Used for the sidebar.

```css
.glass-panel-solid {
  background: var(--matrix-bg-secondary);
  border: 1px solid var(--matrix-border);
  border-radius: 12px;
}
```

### `.glass-card`

Elevated card with stronger blur and shadow.

```css
.glass-card {
  background: rgba(15, 25, 40, 0.65);
  backdrop-filter: blur(20px);
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
```

## Typography

### Font Families

```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

- **Inter** -- UI text, labels, navigation
- **JetBrains Mono** -- code blocks, terminal output, status values

### Base Font Size

```css
html { font-size: 87.5%; }  /* 14px base */
```

## CRT Effects

### Scan Line

A horizontal glowing line sweeps vertically across the viewport, simulating a CRT monitor.

```css
.scan-line {
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--matrix-accent) 20%,
    var(--matrix-accent-glow) 50%,
    var(--matrix-accent) 80%,
    transparent 100%
  );
  opacity: 0.4;
  animation: scan-line-vertical 4s linear infinite;
}
```

### Text Glow

Matrix-style text glow for headings and accent text.

```css
.text-glow {
  text-shadow: 0 0 10px var(--matrix-accent), 0 0 20px var(--matrix-accent);
}

.text-glow-subtle {
  text-shadow: 0 0 5px var(--matrix-accent);
}
```

Both are disabled in light theme (replaced with `text-shadow: none`).

### Grid Background

Subtle grid overlay pattern:

```css
.bg-grid-pattern {
  background-image:
    linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px);
  background-size: 20px 20px;
}
```

## Animations

| Class                  | Effect                           | Duration |
|------------------------|----------------------------------|----------|
| `.animate-pulse-slow`  | Opacity pulse (0.4 to 0.8)      | 3s       |
| `.animate-pulse-glow`  | Box-shadow glow pulse            | 2s       |
| `.animate-shimmer`     | Loading shimmer gradient         | 1.5s     |
| `.animate-fade-in`     | Opacity 0 to 1                   | 0.3s     |
| `.animate-slide-up`    | Slide from 20px below + fade in  | 0.3s     |

All animations respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Scrollbars

Custom-styled scrollbars with green gradient:

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--matrix-accent), var(--matrix-accent-dim));
  border-radius: 3px;
}
```

Light theme uses forest green with reduced opacity.

Utility classes:
- `.scrollbar-hide` -- completely hidden scrollbar
- `.scrollbar-thin` -- 4px narrow scrollbar

## Button Variants

| Class           | Background          | Text Color           | Border             |
|-----------------|---------------------|----------------------|--------------------|
| `.btn-primary`  | `--matrix-accent`   | `--matrix-bg-primary`| `--matrix-accent`  |
| `.btn-secondary`| `--glass-bg`        | `--matrix-text-primary`| `--matrix-border`|
| `.btn-ghost`    | transparent         | `--matrix-text-secondary`| transparent     |
| `.btn-danger`   | `--matrix-error`    | white                | `--matrix-error`   |

Primary buttons glow on hover:

```css
.btn-primary:hover {
  background: var(--matrix-accent-glow);
  box-shadow: 0 0 15px var(--matrix-accent);
}
```

## Status Indicators

Pulsing dots with colored glow:

```css
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot-online  { background: var(--matrix-success); box-shadow: 0 0 10px var(--matrix-success); }
.status-dot-offline { background: var(--matrix-error);   box-shadow: 0 0 10px var(--matrix-error); }
.status-dot-pending { background: var(--matrix-warning); box-shadow: 0 0 10px var(--matrix-warning); }
```

## Tailwind v4 Theme Tokens

The Tailwind `@theme` block in `globals.css` exposes all design tokens as Tailwind utilities:

```css
@theme {
  --color-matrix-accent: #00ff41;
  --color-matrix-bg-primary: #0a1f0a;
  /* ... */
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --shadow-matrix-glow: 0 0 20px rgba(0, 255, 65, 0.15);
}
```

This enables usage like `text-matrix-accent`, `bg-matrix-bg-primary`, `font-mono`, and `shadow-matrix-glow` directly in JSX.

## Design Rules

1. **Never use raw color values in components** -- always reference CSS variables or Tailwind tokens
2. **Glass panels are the primary surface** -- avoid opaque backgrounds except for the sidebar (`.glass-panel-solid`)
3. **Text glow is for dark theme only** -- light theme removes all text shadows
4. **Accent color is the only bright color** -- everything else is subdued green-tinted neutrals
5. **Monospace font for data** -- use JetBrains Mono for any numeric values, code, or status text
6. **Respect reduced motion** -- all animations must be wrapped in the media query
