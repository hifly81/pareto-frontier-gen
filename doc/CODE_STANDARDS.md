# CODE_STANDARDS.md — Code standards

## 1. General principles

- Clarity before abstraction: a small, readable function is better than a generic helper.
- The domain is pure and framework-independent.
- No unnecessary dependencies, no `any`, no casts that hide a type error.
- Untrusted input (imported JSON) is never trusted by shape alone: normalize it at the
  boundary with `normalizeProject`.
- One file does one thing; if it exceeds ~400 lines, consider splitting it.

## 2. TypeScript

- `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules` always enabled.
- Use `interface` for data shapes (`Solution`, `ParetoProject`, `Layers`, `Probe`) and `type` for
  unions (`PointKind`, `ObjectiveDirection`, `Feasibility`).
- `readonly` on exported constant arrays (`TEMPLATES`).
- Avoid enums: literal unions are sufficient and easier to serialize.
- Exported functions have descriptive English names (`evaluateProject`, `ceilingAt`, `classify`,
  `dominates`, `normalizeProject`).
- Comments in English, only to explain the *why*, not the *what*.

## 3. React

- Functional components exported by name (`export function ParetoChart`), never as default for
  reusable components. `App` is the only default export.
- Props explicitly typed with an `interface` next to the component.
- Local state with `useState`; derived values computed during render, or with `useMemo` only when
  the calculation is expensive (for example SVG paths).
- No side effects in `render`; event handlers are named `handleXxx`.
- Keyboard events equivalent to mouse events for interactive elements.
- `aria-label` / `aria-pressed` / `aria-live` where needed; `aria-hidden` on purely graphical
  elements.

## 4. SVG and chart

- The viewBox coordinates are constants declared at the top of the component (`VIEW`, `px`, `py`).
- Formulas stay in the domain: the component receives computed values or calls the domain helpers,
  it never rewrites the math.
- SVG colors come from `src/theme.ts` as explicit values, not from CSS variables.
- Paths and areas are built from the non-dominated solutions returned by the domain, not drawn by
  hand.
- Region fills and annotations must follow the configured Y direction.
- The CSS `aspect-ratio` must match the `viewBox`, otherwise the probing of pointer coordinates
  will be wrong.

## 5. CSS

- Global variables in `:root`; no repeated hard-coded color values in components.
- kebab-case class names, preferably with a context prefix (`chart-`, `detail-`, `layer-`).
- No selector deeper than two levels; no `!important`.
- Responsive breakpoints at 1000px and 640px, as specified.
- Transitions limited to `background`, `border-color` and `color`, 150ms.

## 6. Files and folders

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    ├── theme.ts
    ├── id.ts
    ├── projectFile.ts
    ├── domain/
    │   ├── pareto.ts
    │   ├── pareto.test.ts
    │   └── templates.ts
    └── components/
        ├── HomeView.tsx
        ├── Wizard.tsx
        ├── Workspace.tsx
        ├── ParetoChart.tsx
        ├── ParetoChart3D.tsx
        ├── ChartConfigPanel.tsx
        ├── FormFields.tsx
        └── SiteHeader.tsx
```

New components go in `src/components/`, new domain rules and their tests in `src/domain/`.

## 7. Formatting

- 2 spaces for indentation, semicolons, single quotes in TypeScript, double quotes in JSX.
- One empty line between logical blocks; long lines broken in a readable way (~100 characters).
- Import order: external libraries, types, local modules, local types.

## 8. Verification

Before every delivery:

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

If a check fails, fix the code: do not disable TypeScript rules or skip tests.

## 9. License

The project is licensed under `AGPL-3.0-only`. The full text lives in the root `LICENSE` file;
`frontend/package.json` carries the SPDX identifier. Keep both references in sync.
