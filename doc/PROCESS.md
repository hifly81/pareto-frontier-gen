# PROCESS.md — Working process

## 1. Change cycle

1. **Understand** — read `SPEC.md` and `AGENTS.md`; check whether the change touches the math,
   interaction, style or documentation.
2. **Design** — for behavior changes, update `SPEC.md` first.
3. **Implement** — change the smallest possible number of files, following `CODE_STANDARDS.md`.
4. **Verify** — run `npm test`, `npm run typecheck` and `npm run build` inside `frontend/`.
5. **Document** — update the affected files in `doc/` and, if startup changed, the README.

## 2. Separation of responsibilities

| Type of change                     | Files to touch                                              |
| ---------------------------------- | ----------------------------------------------------------- |
| Formula, direction or classification | `frontend/src/domain/pareto.ts` + `doc/SPEC.md`           |
| Validation or normalization        | `frontend/src/domain/pareto.ts` + tests + `doc/SPEC.md`     |
| Example datasets                   | `frontend/src/domain/templates.ts` + `doc/SPEC.md`          |
| SVG drawing or interaction         | `frontend/src/components/ParetoChart.tsx`, `ParetoChart3D.tsx` |
| Home, wizard, workspace, texts     | `frontend/src/components/HomeView.tsx`, `Wizard.tsx`, `Workspace.tsx` |
| Axis and point editors             | `frontend/src/components/ChartConfigPanel.tsx`, `FormFields.tsx` |
| Colors, spacing, responsive design | `frontend/src/styles.css` + `doc/BRAND.md`                  |
| Shared palette                     | `frontend/src/theme.ts` + `doc/BRAND.md`                    |
| JSON files and unsaved-work guard  | `frontend/src/projectFile.ts`, `frontend/src/App.tsx`       |
| Dependencies or build              | `package.json`, `vite.config.ts`, `doc/TECH_STACK.md`       |
| Server-side code                   | `backend/` (not present yet)                                |

## 3. Checks before delivery

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

Manual checks in the browser:

- the home page offers both creation modes and all six templates;
- the LLM template shows cost `↓` and accuracy `↑`, with the region labels and target annotations
  on the correct side of the frontier;
- both 3D templates open the rotatable 3D chart with three labeled axes and a connected frontier
  skeleton, Z can be probed with `Page Up` / `Page Down`, and dragging changes the camera angle;
- switching between 2 and 3 objectives in `Chart data` preserves coordinates and redraws the chart;
- changing an axis direction recomputes the frontier and point statuses immediately;
- the wizard completes in three steps with one candidate and opens the computed chart;
- SVG and PNG export download the current chart without external assets; PNG is 1360 × 1320;
- JSON export/import round-trips a project;
- a malformed or oversized JSON file is rejected with a readable message;
- editing a coordinate updates statuses, annotations and the frontier immediately;
- hover, click, layer toggles, keyboard probing, 3D rotation and `Reset view` work;
- returning home with unsaved edits asks for confirmation.

## 4. Versioning

- Every significant change is its own commit with an English imperative message:
  `Add direction-aware chart regions`, `Fix frontier tolerance`, `Update brand palette`.
- Do not commit `node_modules/`, `frontend/dist/` or `.local` files.
- No mandatory branches or tags: the project is a single prototype.

## 5. Adding code in `backend/`

The folder is reserved for a store, database and possible APIs. When it is populated:

1. create a `backend/README.md` with installation, startup and environment variables;
2. expose point data through an API only if the frontend stops being static;
3. update `SPEC.md` and `TECH_STACK.md`;
4. keep `frontend/src/domain/pareto.ts` as the single source of the dominance algorithm, including
   on the server side (minimal duplication, with the reason documented).

## 6. Automation

CI runs tests, typecheck and build on every push and pull request. There is no automatic
deployment, mandatory branch policy or telemetry collection. If these requirements appear, they
must be formalized here before being implemented.
