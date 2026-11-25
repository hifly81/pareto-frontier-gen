# AGENTS.md

Instructions for AI agents and collaborators working in this repository.

## Project purpose

Interactively visualize the Pareto frontier for **two or three objectives** (`Objective 1` = X axis,
`Objective 2` = Y axis, optional `Objective 3` = Z axis), showing Pareto-optimal, dominated and
infeasible points. Each axis can be maximized or minimized. The 3D chart can be orbited by dragging
or with `Shift` + arrow keys.

## Repository structure

| Path        | Contents                                                              |
| ----------- | --------------------------------------------------------------------- |
| `frontend/` | React + TypeScript + Vite application. Charts are hand-written SVG.    |
| `backend/`  | **Reserved** for future server code (store, database, API).            |
| `doc/`      | Project documentation and screenshots (SPEC, BRAND, PROCESS, stacks).  |
| `README.md` | Overview, collapsed screenshots and quick start.                      |
| `LICENSE`   | GNU Affero General Public License v3 (`AGPL-3.0-only`) text.           |

## Important rules

1. **Do not write backend code inside `frontend/`.** The frontend is isolated: it reads data from
   the domain, saves projects in browser `localStorage` and supports JSON import/export. There are
   no network calls. `backend/` is intentionally empty and will be populated later.
2. **The math lives in `frontend/src/domain/pareto.ts`.** The module is pure (no React, DOM or chart
   library). It supports two or three objectives and every axis can be maximized or minimized:
   dominance uses `objectiveScore` across all active axes. Add the algorithm, the frontier (polyline
   in 2D, edge skeleton in 3D), classifications, validation and import normalization there, with
   automated tests in `pareto.test.ts` for edge cases: no solutions, one solution, duplicate
   coordinates, mixed directions and three-objective mode.
3. **Charts are hand-written SVG** (`ParetoChart.tsx` for 2D, `ParetoChart3D.tsx` for the rotatable
   3D view). Do not introduce a charting library without updating `doc/TECH_STACK.md` and
   `doc/SPEC.md`.
4. **Colors are defined in `frontend/src/theme.ts`** and mirrored in `frontend/src/styles.css` and
   `doc/BRAND.md`. If the palette changes, update all three places.
5. **Update the documentation** in `doc/` when behavior, stack or conventions change.
6. **Keep license references in sync.** The full text is in `LICENSE`, the SPDX identifier is in
   `frontend/package.json`, and both are described in `README.md` and `doc/CODE_STANDARDS.md`.

## Commands

```bash
cd frontend
npm install
npm run dev        # development server at http://localhost:5173
npm test           # automated tests (Vitest)
npm run typecheck  # TypeScript check
npm run build      # production build
```

Before delivering a change, `npm test`, `npm run typecheck` and `npm run build` must all pass.

## Code conventions

- Strict TypeScript; use `type` for unions and `interface` for data shapes.
- Functional React components exported by name in PascalCase; component files in PascalCase.
- No `any`, no unnecessary casts and no side effects in domain modules.
- The entire frontend UI is in English, including code comments and error messages. Documentation
  files in `doc/` are also in English, as is this file.
- Comment only where the logic is not immediate; code should be self-explanatory.
- Keep README screenshots inside collapsed `<details>` blocks so they are shown only on request.

## Do NOT

- Change sample point values without updating `doc/SPEC.md` and the README.
- Add "convenient" dependencies (lodash, chart libraries, CSS frameworks) without a real need.
- Move files into `backend/` before a dedicated server configuration exists.
- Commit `node_modules/` or `frontend/dist/`.
