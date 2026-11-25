# TECH_STACK.md — Technology stack

## 1. Frontend (implemented)

| Technology           | Version | Role                                              |
| -------------------- | ------- | ------------------------------------------------- |
| React                | 19.x    | Declarative UI and state management               |
| React DOM            | 19.x    | Browser rendering                                 |
| TypeScript           | 5.8+    | Static types, strict mode                         |
| Vite                 | 6.x     | Dev server and build                              |
| @vitejs/plugin-react | 4.x     | JSX transform and Fast Refresh                    |
| Vitest               | 5.x     | Automated domain and template tests               |
| Native SVG           | —       | 2D and isometric 3D charts, axes, regions, points |

### Why native SVG

- The 2D frontier is a polyline built from the non-dominated solutions computed by the domain: a few
  vertices are enough, with no sampling. The 3D frontier is an isometric projection with a
  minimum-spanning-tree skeleton, written by hand.
- No charting library dependency, so the bundle stays small and colors, labels, accessibility and
  coordinates are fully under control.
- Pointer coordinates are converted directly from the `viewBox`; in 3D the pointer is resolved on
  the middle-Z plane and page keys move the Z probe. Dragging orbits an orthographic camera whose
  basis vectors and auto-fit transform are recomputed from yaw/pitch.

### No external CSS stack

Hand-written CSS with variables in `:root`. No Tailwind, Bootstrap or UI framework.

## 2. Commands

```bash
cd frontend
npm install       # install dependencies
npm run dev       # http://localhost:5173
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run build     # tsc --noEmit && vite build → frontend/dist
npm run preview   # preview the production build
```

The build is completely static: `frontend/dist` can be served by any web server, including from a
subpath, because `vite.config.ts` sets `base: './'`. The entire UI is in English
(`<html lang="en">`). Chart data is edited in the `Chart data` panel and lives in `App` state.

`Save to browser` persists projects in `localStorage` (key
`pareto-frontier-generator.projects.v1`, at most 12 projects). `Export JSON` and `Import JSON`
exchange portable files. Saved and imported JSON is validated by `normalizeProject` before it
reaches the UI. No network requests are made.

## 3. Bundle structure

- `index.html` → `#root`, metadata, inline SVG favicon
- `src/main.tsx` → `createRoot`, `StrictMode`, `styles.css` import
- `src/App.tsx` → views, unsaved-work guard, saved-project sync across tabs
- `src/components/HomeView.tsx` → creation, templates and saved projects
- `src/components/Wizard.tsx` → three-step guided creation
- `src/components/Workspace.tsx` → chart, details, layers, import/export and save feedback
- `src/components/ParetoChart.tsx` → 2D SVG chart and renderer selection
- `src/components/ParetoChart3D.tsx` → isometric 3D chart, pointer and keyboard probing
- `src/components/ChartConfigPanel.tsx`, `src/components/FormFields.tsx` → axis and point editors
- `src/components/SiteHeader.tsx` → shared header
- `src/domain/pareto.ts` → directions, dominance, frontier, classification, validation, normalization
- `src/domain/pareto.test.ts` → automated tests for the domain
- `src/domain/templates.ts` → six example datasets: four 2D and two 3D, including LLM cost vs. accuracy
- `src/storage.ts` → versioned local persistence and JSON import/export
- `src/id.ts` → id generation
- `src/theme.ts` → shared palette

## 4. Backend (reserved)

`backend/` is empty. Future plans, to be confirmed when it is implemented:

- Node.js runtime with TypeScript, an Express server or a minimal equivalent;
- a `store` layer for persistence, with a SQLite database for the prototype;
- REST endpoints to read/write objective configurations and saved points;
- environment variables kept separate from `frontend/`;
- the dominance algorithm will remain defined in a shared module, or deliberately duplicated with
  the reason documented.

None of these choices is active today: the frontend makes no network calls.

## 5. Automated checks and CI

`.github/workflows/ci.yml` installs dependencies from `package-lock.json` and runs tests, typecheck
and build on pushes and pull requests. There is no deployment step.

## 6. Environment requirements

- Node.js 20+ (developed and verified with Node 22).
- npm 9+.
- A modern browser with support for SVG, `aspect-ratio` and CSS custom properties.
