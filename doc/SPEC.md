# SPEC.md — Functional and domain specification

## 1. Context

The application is a **generic Pareto frontier generator for two or three objectives**:

- **Objective 1** (X axis), with a configurable name, range, ticks, description and direction;
- **Objective 2** (Y axis), with the same configuration;
- **Objective 3** (Z axis, optional), with the same configuration.

Each direction is independently `maximize` (higher is better) or `minimize` (lower is better).
The user provides a set of **candidate solutions** (tuples of two or three values). The application
determines which solutions are efficient and draws a frontier derived from the data, not from a
fixed formula. There is no predefined curve. Two-objective projects are drawn as a flat chart;
three-objective projects are drawn as an isometric 3D chart.

## 2. Mathematical model

Every axis value is mapped to a score where higher is always better:

```
score(value, maximize) =  value
score(value, minimize) = -value
```

Given a finite set of candidate solutions `S` with coordinates `(x, y)` or `(x, y, z)` and
directions `d`:

```
dominates(a, b) ⟺ ∀i ∈ activeObjectives: score(aᵢ, dᵢ) ≥ score(bᵢ, dᵢ)
                  ∧ ∃i ∈ activeObjectives: score(aᵢ, dᵢ) > score(bᵢ, dᵢ)
P = { s ∈ S | there is no t ∈ S such that dominates(t, s) }
```

`P` is the Pareto set (the non-dominated solutions). For two objectives it is sorted by increasing
`x`; for equal `x`, the solution preferred on Y for the configured direction is kept for the drawn
frontier. Other tied candidates remain in `P` and are reported as optimal, but they do not create
duplicate path vertices.

The drawn frontier is the polyline joining the points of `P`, extended to the limits of the X axis:

```
path = [(xMin, y(P₁)), P₁, P₂, …, Pₙ, (xMax, y(Pₙ))]
```

The achievable **frontier value** `frontier(x)` is the linear interpolation of `path`; it is
constant at both ends. It represents the best value of Objective 2 attainable without losing
Objective 1, assuming continuous trade-offs between adjacent solutions.

Tolerance is `max(0.01, Δy · 0.01)`, where `Δy = yMax − yMin`. The advantage of a point over the
frontier is the difference between their scores on the Y axis, so it is positive when the point is
better for the configured Y direction:

```
advantage = score(y, d.y) − score(frontier(x), d.y)
```

| Status        | Condition                       |
| ------------- | ------------------------------- |
| `optimal`     | `\|advantage\| ≤ tolerance`     |
| `infeasible`  | `advantage > tolerance`         |
| `dominated`   | `advantage < −tolerance`        |

**Candidate solutions** are classified directly with the dominance test: non-dominated →
`optimal`, otherwise `dominated`, together with the id of a solution that dominates them. They
cannot be `infeasible` because they belong to the feasible set.

**Reference points** (targets) are not part of `S`: they are classified against `frontier(x)`. A
target better than the frontier is `infeasible`, one worse is `dominated`, and one on the curve is
`optimal`.

### Three-objective mode

With three objectives a single-valued `frontier(x)` does not exist. The `z` axis is added to the
project, every candidate and target stores a `z` value, and the analysis stores all three
directions. The chart projects the objective box isometrically: X runs right, Y runs up and Z runs
back-left.

- Non-dominated candidates are the 3D frontier points; dominated candidates keep the id of a
  candidate that dominates them.
- The frontier skeleton is a minimum spanning tree over `P` in normalized objective space, stored
  as `FrontierAnalysis.edges`; the flat `path` is empty.
- Targets and probes are classified with `classifyPoint`: `dominated` when a candidate dominates
  the point, `infeasible` when the point dominates a non-dominated candidate, otherwise `optimal`.
- Tolerance is `max(0.01, min(Δx, Δy, Δz) · 0.01)`.
- Mouse probing resolves X/Y on the fixed middle-Z plane (or X/Z on the middle-X plane when Z faces
  the viewer); keyboard probing changes Z with `Page Up` / `Page Down`.
- The camera can be orbited by dragging the chart, or with `Shift` + arrow keys when it is focused.
  Yaw is unrestricted; pitch is clamped to ±70° to keep the box readable. The projection is
  auto-fitted to the viewBox at every angle. `Reset view` restores the default angles.

Switching between two and three objectives preserves existing coordinates. Missing `z` values get
the middle of the Z range; removing the third objective drops `z` from every point.

Edge cases and robustness:

- no candidates: no frontier, targets remain unclassified and the chart invites the user to add solutions;
- one candidate: a constant frontier at its `y` value;
- two or more candidates with the same `x` or `y`: only the best one enters the drawn path;
  identical solutions are all non-dominated but produce a single path vertex per X value;
- non-finite or out-of-range coordinates are ignored by the analysis so the path cannot fold back
  outside the plot; validation warns the user in the data editor;
- titles, labels and directions are validated; saved/imported JSON is normalized before use:
  invalid axes are rejected, invalid ticks are dropped, coordinates are clamped and duplicate ids
  receive unique suffixes.

All formulas, validation and normalization live in `frontend/src/domain/pareto.ts` (a pure module).

## 3. Home page

On startup the home page shows **two main options**:

1. **Create from scratch** — two modes:
   - **Guided wizard**: three steps (axes and metadata → candidate solutions → review).
   - **Free editor**: opens the workspace immediately with an empty project to fill in via the
     `Chart data` panel.
2. **Load a template** — six ready-made examples, editable like a project created from scratch:
   - *LLM model selection* — cost per million tokens (minimize) vs. benchmark accuracy (maximize);
   - *Product launch plan* — perceived budget efficiency vs. user satisfaction;
   - *Portfolio allocation* — expected return vs. capital safety;
   - *Manufacturing settings* — throughput vs. quality;
   - *Cloud instance selection* (3D) — cost ↓, latency ↓, throughput ↑;
   - *Sustainable product design* (3D) — unit cost ↓, carbon footprint ↓, durability ↑.

The home page also lists projects saved in the browser, which can be reopened or deleted.

## 4. Features

### 4.1 Guided generation

- Step 1: number of objectives (2 or 3), title, description and name/direction/minimum/maximum/
  ticks/description for every axis.
- Step 2: add, edit and remove candidate solutions; at least one solution is required. New points
  are suggested along a trade-off consistent with the configured directions.
- Step 3: summary of the calculation (number of candidates, non-dominated and dominated
  solutions, and targets beyond the frontier) and opening of the chart.
- Back/forward navigation with validation; `Cancel` returns to the home page.

### 4.2 Workspace

- SVG chart with a grid, feasible/infeasible regions, computed frontier, points and annotations.
  Region fills and target annotations follow the Y direction. In 3D the regions become the floor
  and ceiling faces of the objective box.
- Two objectives use a flat chart with a frontier polyline; three objectives use an isometric chart
  with the frontier skeleton inside the objective box.
- Candidate solutions appear as circles; reference points appear as diamonds.
- Hover/click on points for details; hover/click in the plot area to probe any combination.
  The focused chart can also be probed with the arrow keys; in 3D, `Page Up` / `Page Down` change Z.
  A visible guide under 3D charts spells out the controls for each axis: drag to rotate, left/right
  for X, up/down for Y, `Page Up` / `Page Down` for Z, plus the mouse behavior on the middle-Z plane.
- Buttons to show/hide layers (grid, regions, frontier, points, annotations).
- `Chart data` panel to switch between 2 and 3 objectives and to edit axes, candidate solutions and
  reference points (including Z): the frontier and all classifications are recalculated on every
  change. Invalid axis ranges replace the chart with an explicit error state instead of a broken
  drawing.
- `Save to browser` stores the project in `localStorage` (at most 12 entries) and reports the
  outcome. An unsaved-work guard warns before leaving the page or returning home.
- `Export JSON` and `Import JSON` provide portable, validated project files.
- `Home` button returns to the start screen after confirming when edits are unsaved.

### 4.3 Accessibility

- Every point is reachable with the keyboard (`Tab`) and activatable with `Enter` or `Space`.
- The chart is a focusable `group` with a descriptive label; arrow keys probe the plot and, in 3D,
  page keys probe the Z axis.
- Point status changes are announced in a polite live region; save/import/export results use a
  status region.
- Layer buttons use `aria-pressed`; decorative SVG content is `aria-hidden`.

## 5. Non-functional requirements

- No charting library: native SVG only.
- Dependencies are limited to React, React DOM, TypeScript, Vite, Vitest (tests) and their
  toolchain packages.
- Responsive layout: the chart and panels stack below 1000px and use a single column below 640px.
- Untrusted saved/imported data is sanitized before rendering; no network requests are made.
- Automated tests, typecheck and build must pass without errors.
- The entire frontend UI and all documentation are in English.

## 6. Out of scope

- More than three objectives, continuous optimization, server persistence, authentication.
- Server code: `backend/` is reserved for future development (store, DB, API).

## 7. Acceptance criteria

1. The home page shows the two options and six loadable templates, including the LLM cost/accuracy
   example with X minimized and Y maximized and two 3D examples.
2. The wizard completes its three-step flow in both 2D and 3D and produces a computed chart.
3. The frontier passes exactly through the non-dominated solutions found by the dominance test,
   for all four 2D direction combinations and for mixed 3D directions.
4. Editing a coordinate, direction or range immediately updates point statuses and the frontier.
5. A target better than the frontier is `infeasible`; one worse is `dominated`; Y-minimized axes
   invert the visual direction of regions and annotations. In 3D, `classifyPoint` produces the same
   three statuses from full-point dominance.
6. Switching from 2 to 3 objectives keeps all coordinates, adds a usable Z axis and replaces the
   flat chart with the 3D chart; switching back removes Z and restores the polyline.
7. Templates are editable; local saving makes them reopenable from the home page; JSON
   export/import round-trips a valid project and rejects malformed files.
8. Invalid saved/imported data is normalized or rejected without crashing the app.
9. The entire frontend UI is in English.
10. `npm test`, `npm run typecheck` and `npm run build` complete successfully.
