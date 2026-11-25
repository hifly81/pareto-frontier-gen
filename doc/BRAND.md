# BRAND.md — Visual identity and tone

## 1. Personality

An analysis lab: sober, precise, editorial. The interface should feel like a well-laid-out
technical report, not a noisy dashboard. Clear hierarchy, generous spacing, colors used only
where they carry meaning.

## 2. Palette

| Role         | Color     | Hex       | Usage                                      |
| ------------ | --------- | --------- | ------------------------------------------ |
| Ink          | navy      | `#0f172a` | Main text, headings                        |
| Muted        | slate     | `#64748b` | Secondary text, ticks, notes               |
| Paper        | off-white | `#f5f7fb` | Page background                            |
| Card         | white     | `#ffffff` | Panel surfaces                             |
| Surface      | white     | `#ffffff` | SVG marker borders and annotation backing  |
| Line         | light     | `#e6e9f2` | Borders, grid                              |
| Indigo       | primary   | `#4f46e5` | Pareto frontier, brand, focus              |
| Teal         | success   | `#0d9488` | Pareto-optimal points, feasible region     |
| Amber        | warning   | `#f59e0b` | Dominated point, dominance arrow           |
| Rose         | danger    | `#e11d48` | Infeasible point, infeasible region        |

Usage rules:

- Indigo is the only "brand" color: headings, frontier, active states.
- Teal / amber / rose are **semantic**: never use them for decoration.
- Direction arrows (`↑` maximize, `↓` minimize) use the current label color, never a semantic hue.
- The feasible region uses a very faint teal gradient; the infeasible region a rose hatch at 45°.
  No solid fills: points must stay readable.

The palette is duplicated in `frontend/src/theme.ts`, `frontend/src/styles.css` and in this file:
every change must be synchronized across all three.

## 3. Typography

- **Family**: `Inter`, with fallbacks `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto`.
- **Numbers and coordinates**: monospace (`SFMono-Regular`, `Consolas`, `Liberation Mono`).
- **Main heading**: 36–58px, weight 700, letter-spacing `-0.045em`, line-height 1.05.
- **Card headings**: 14–15px, weight 700.
- **Body**: 12–16px, line-height 1.55–1.6.
- **Uppercase labels**: 10–11px, letter-spacing `0.12em–0.15em`.

No fonts loaded from a CDN: the system fallback is part of the design.

## 4. Shapes and surfaces

- Card radius: `18px`; sub-cards and badges: `10–12px`.
- Border: `1px solid var(--line)`.
- Shadow: `0 1px 2px rgba(15,23,42,.04), 0 12px 32px rgba(15,23,42,.05)`.
- Buttons: pill shape for filters, rounded rectangle for `Reset` and primary actions.
- Point markers: translucent halo plus a solid circle with a white border for candidate
  solutions; a diamond for reference points.

## 5. Tone of voice

- The entire UI is in English: clear and direct, professional but not academic.
- Key labels: `Computed frontier`, `Pareto-optimal solution`, `Dominated solution`,
  `Infeasible target`.
- Explain the **why**, not just the value: every point has a note describing the trade-off.
- Avoid unnecessary jargon; when a technical term appears, explain it in the same sentence.

## 6. Motion

Short transitions (150ms) on hover and button state changes. No continuous animation: the page
should be able to stay open without distracting the user.
