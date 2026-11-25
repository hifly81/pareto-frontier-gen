/**
 * Pure Pareto analysis for two or three objectives with independently configurable directions.
 * No React, no DOM, no charting libraries and no side effects.
 */

export const FRONTIER_RELATIVE_TOLERANCE = 0.01;
const MIN_SPAN = 1e-9;

export type PointKind = 'optimal' | 'dominated' | 'infeasible';
export type Feasibility = PointKind | null;
export type ObjectiveDirection = 'maximize' | 'minimize';
export type ObjectiveKey = 'x' | 'y' | 'z';
export type ObjectiveCount = 2 | 3;

export interface AxisDirections {
  x: ObjectiveDirection;
  y: ObjectiveDirection;
  z?: ObjectiveDirection;
}

export interface AxisConfig {
  label: string;
  direction: ObjectiveDirection;
  min: number;
  max: number;
  ticks: number[];
  description: string;
}

/** A feasible alternative evaluated against the other candidates. */
export interface Solution {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Present only for three-objective projects. */
  z?: number;
}

/** A point the user wants to check, not part of the feasible candidate set. */
export type ReferencePoint = Solution;

export interface ParetoProject {
  title: string;
  summary: string;
  x: AxisConfig;
  y: AxisConfig;
  /** Null for two-objective projects. */
  z?: AxisConfig | null;
  candidates: Solution[];
  targets: ReferencePoint[];
}

export interface EvaluatedSolution extends Solution {
  kind: 'optimal' | 'dominated';
  /** Id of a candidate that is better on every objective, when one exists. */
  dominatedBy?: string;
  note: string;
}

export interface EvaluatedTarget extends ReferencePoint {
  kind: Feasibility;
  /** Best Y at this X, in the original units. Only used for two-objective projects. */
  ceiling: number | null;
  /** Frontier point involved in a three-objective comparison. */
  comparedTo?: string;
  note: string;
}

export interface FrontierPoint {
  x: number;
  y: number;
}

/** Skeleton edge of a three-objective frontier, stored as candidate ids. */
export interface FrontierEdge {
  from: string;
  to: string;
}

export interface FrontierAnalysis {
  /** Piecewise-linear frontier for two objectives. Empty for three objectives. */
  path: FrontierPoint[];
  /** Spanning edges through the non-dominated candidates for three objectives. */
  edges: FrontierEdge[];
  dimensions: ObjectiveCount;
  /** Directions used for the calculation, stored so probes can be classified later. */
  directions: AxisDirections;
  /** Candidates in their original order, with computed status. */
  solutions: EvaluatedSolution[];
  /** Non-dominated candidates, sorted by increasing X. */
  optimal: EvaluatedSolution[];
  dominated: EvaluatedSolution[];
  targets: EvaluatedTarget[];
  tolerance: number;
}

export interface Probe {
  x: number;
  y: number;
  /** Present when probing a three-objective chart. */
  z?: number;
  pinned: boolean;
}

export interface Layers {
  grid: boolean;
  regions: boolean;
  frontier: boolean;
  points: boolean;
  annotations: boolean;
}

export const MAXIMIZE_BOTH: AxisDirections = { x: 'maximize', y: 'maximize' };
export const MAXIMIZE_THREE: AxisDirections = { x: 'maximize', y: 'maximize', z: 'maximize' };

/** Default third objective, used when a project switches from two to three objectives. */
export const EMPTY_Z_AXIS: AxisConfig = {
  label: 'Objective 3',
  direction: 'maximize',
  min: 0,
  max: 100,
  ticks: [0, 20, 40, 60, 80, 100],
  description: 'Score achieved on the third objective. Choose whether higher or lower is better.',
};

export const EMPTY_PROJECT: ParetoProject = {
  title: 'Untitled frontier',
  summary: '',
  x: {
    label: 'Objective 1',
    direction: 'maximize',
    min: 0,
    max: 100,
    ticks: [0, 20, 40, 60, 80, 100],
    description: 'Score achieved on the first objective. Choose whether higher or lower is better.',
  },
  y: {
    label: 'Objective 2',
    direction: 'maximize',
    min: 0,
    max: 100,
    ticks: [0, 20, 40, 60, 80, 100],
    description: 'Score achieved on the second objective. Choose whether higher or lower is better.',
  },
  z: null,
  candidates: [],
  targets: [],
};

const AXIS_KEYS: readonly ObjectiveKey[] = ['x', 'y', 'z'];

export function isObjectiveDirection(value: unknown): value is ObjectiveDirection {
  return value === 'maximize' || value === 'minimize';
}

export function isThreeDimensional(project: ParetoProject): boolean {
  return project.z !== null && project.z !== undefined;
}

/** Axes that participate in the current project. */
export function activeAxes(project: ParetoProject): AxisConfig[] {
  return project.z ? [project.x, project.y, project.z] : [project.x, project.y];
}

/** Directions that participate in the current project. */
export function activeDirections(project: ParetoProject): AxisDirections {
  return project.z
    ? { x: project.x.direction, y: project.y.direction, z: project.z.direction }
    : { x: project.x.direction, y: project.y.direction };
}

/** Adds or removes the third objective, keeping every point usable. */
export function setObjectiveCount(project: ParetoProject, count: ObjectiveCount): ParetoProject {
  if (count === 2) {
    return {
      ...project,
      z: null,
      candidates: project.candidates.map((point) => ({
        id: point.id,
        label: point.label,
        x: point.x,
        y: point.y,
      })),
      targets: project.targets.map((point) => ({
        id: point.id,
        label: point.label,
        x: point.x,
        y: point.y,
      })),
    };
  }
  const z = project.z ?? EMPTY_Z_AXIS;
  const value = (z.min + z.max) / 2;
  return {
    ...project,
    z,
    candidates: project.candidates.map((point) => ({ ...point, z: finiteOrPoint(point.z, value) })),
    targets: project.targets.map((point) => ({ ...point, z: finiteOrPoint(point.z, value) })),
  };
}

function finiteOrPoint(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Sanitizes untrusted input (imported JSON) into a usable project. */
export function normalizeProject(value: unknown): ParetoProject | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const x = normalizeAxis(raw.x, EMPTY_PROJECT.x);
  const y = normalizeAxis(raw.y, EMPTY_PROJECT.y);
  if (!x || !y) return null;

  const hasZ = raw.z !== undefined && raw.z !== null;
  const z = hasZ ? normalizeAxis(raw.z, EMPTY_Z_AXIS) : null;
  if (hasZ && !z) return null;

  const axes = z ? [x, y, z] : [x, y];
  const usedIds = new Set<string>();
  return {
    title: textOr(raw.title, EMPTY_PROJECT.title),
    summary: textOr(raw.summary, ''),
    x,
    y,
    z,
    candidates: normalizeSolutions(raw.candidates, axes, usedIds, 'candidate'),
    targets: normalizeSolutions(raw.targets, axes, usedIds, 'target'),
  };
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeAxis(value: unknown, fallback: AxisConfig): AxisConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const min = finiteOrNull(raw.min);
  const max = finiteOrNull(raw.max);
  if (min === null || max === null || max <= min) return null;
  const ticks = Array.isArray(raw.ticks)
    ? raw.ticks
        .map(finiteOrNull)
        .filter((tick): tick is number => tick !== null && tick >= min && tick <= max)
    : [];
  return {
    label: textOr(raw.label, fallback.label),
    direction: isObjectiveDirection(raw.direction) ? raw.direction : fallback.direction,
    min,
    max,
    ticks,
    description: textOr(raw.description, fallback.description),
  };
}

function normalizeSolutions(
  value: unknown,
  axes: AxisConfig[],
  usedIds: Set<string>,
  prefix: string,
): Solution[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): Solution[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const raw = entry as Record<string, unknown>;
    const coordinates: Partial<Record<ObjectiveKey, number>> = {};
    for (const key of AXIS_KEYS.slice(0, axes.length)) {
      const axis = axisFor(axes, key);
      if (!axis) return [];
      const parsed = finiteOrNull(raw[key]);
      if (parsed === null) {
        if (key !== 'z') return [];
        coordinates.z = (axis.min + axis.max) / 2;
      } else {
        coordinates[key] = clamp(parsed, axis.min, axis.max);
      }
    }
    const candidateId = typeof raw.id === 'string' && raw.id.trim() ? raw.id : `${prefix}-${index + 1}`;
    let id = candidateId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${candidateId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    const point: Solution = {
      id,
      label: textOr(raw.label, `New point ${index + 1}`),
      x: coordinates.x ?? 0,
      y: coordinates.y ?? 0,
    };
    if (axes.length === 3 && coordinates.z !== undefined) point.z = coordinates.z;
    return [point];
  });
}

function axisFor(axes: AxisConfig[], key: ObjectiveKey): AxisConfig | undefined {
  return key === 'x' ? axes[0] : key === 'y' ? axes[1] : axes[2];
}

/** Maps an axis value to a "higher is better" score so every rule works on both directions. */
export function objectiveScore(value: number, direction: ObjectiveDirection): number {
  return direction === 'maximize' ? value : -value;
}

/** Arrow shown next to an axis label to communicate which direction is preferred. */
export function objectiveArrow(direction: ObjectiveDirection): string {
  return direction === 'maximize' ? '↑' : '↓';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function safeSpan(min: number, max: number): number {
  return Math.max(max - min, MIN_SPAN);
}

interface Comparison {
  atLeast: boolean;
  better: boolean;
}

function compareScores(a: number, b: number, direction: ObjectiveDirection, tolerance: number): Comparison {
  const av = objectiveScore(a, direction);
  const bv = objectiveScore(b, direction);
  return { atLeast: av >= bv - tolerance, better: av > bv + tolerance };
}

/**
 * True when `a` is at least as good as `b` on every active objective and strictly better on one,
 * after mapping each axis to a "higher is better" score.
 */
export function dominates(
  a: Solution | { x: number; y: number; z?: number },
  b: Solution | { x: number; y: number; z?: number },
  directions: AxisDirections = MAXIMIZE_THREE,
  tolerance = 0,
): boolean {
  const x = compareScores(a.x, b.x, directions.x, tolerance);
  const y = compareScores(a.y, b.y, directions.y, tolerance);
  let zAtLeast = true;
  let zBetter = false;
  if (
    typeof a.z === 'number' &&
    typeof b.z === 'number' &&
    directions.z &&
    Number.isFinite(a.z) &&
    Number.isFinite(b.z)
  ) {
    const z = compareScores(a.z, b.z, directions.z, tolerance);
    zAtLeast = z.atLeast;
    zBetter = z.better;
  }
  return x.atLeast && y.atLeast && zAtLeast && (x.better || y.better || zBetter);
}

/** True when the point lies inside the configured plot area. */
export function inRange(point: { x?: number; y?: number; z?: number }, project: ParetoProject): boolean {
  const x = finiteOrNull(point.x);
  const y = finiteOrNull(point.y);
  if (x === null || y === null) return false;
  if (x < project.x.min || x > project.x.max || y < project.y.min || y > project.y.max) return false;
  if (!project.z) return true;
  const z = finiteOrNull(point.z);
  return z !== null && z >= project.z.min && z <= project.z.max;
}

/** Returns the configured ticks, or an even distribution when fewer than two are provided. */
export function axisTicks(axis: AxisConfig): number[] {
  const span = safeSpan(axis.min, axis.max);
  const inBounds = axis.ticks
    .filter((tick) => Number.isFinite(tick) && tick >= axis.min && tick <= axis.max)
    .sort((a, b) => a - b);
  if (inBounds.length >= 2) return inBounds;
  return Array.from({ length: 6 }, (_, i) => axis.min + (span * i) / 5);
}

/** Tolerance in objective units, proportional to the smallest active axis range. */
export function frontierTolerance(project: ParetoProject): number {
  const reference = project.z
    ? Math.min(safeSpan(project.x.min, project.x.max), safeSpan(project.y.min, project.y.max), safeSpan(project.z.min, project.z.max))
    : safeSpan(project.y.min, project.y.max);
  return Math.max(0.01, reference * FRONTIER_RELATIVE_TOLERANCE);
}

/**
 * Best achievable Y at a given X (maximum or minimum, depending on the Y direction),
 * or null when no two-objective frontier exists.
 */
export function ceilingAt(x: number, path: FrontierPoint[]): number | null {
  if (path.length === 0) return null;
  if (x <= path[0].x) return path[0].y;
  const last = path[path.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    if (x <= to.x) {
      const ratio = (x - from.x) / safeSpan(from.x, to.x);
      return from.y + (to.y - from.y) * ratio;
    }
  }
  return last.y;
}

/** Classifies an arbitrary point against a two-objective computed frontier. */
export function classify(x: number, y: number, analysis: FrontierAnalysis): Feasibility {
  const ceiling = ceilingAt(x, analysis.path);
  if (ceiling === null) return null;
  const advantage =
    objectiveScore(y, analysis.directions.y) - objectiveScore(ceiling, analysis.directions.y);
  if (advantage > analysis.tolerance) return 'infeasible';
  if (Math.abs(advantage) <= analysis.tolerance) return 'optimal';
  return 'dominated';
}

/** Classifies a full point against a two- or three-objective analysis. */
export function classifyPoint(point: Solution, analysis: FrontierAnalysis): Feasibility {
  if (analysis.dimensions === 2) return classify(point.x, point.y, analysis);
  if (analysis.solutions.length === 0) return null;
  if (analysis.solutions.some((solution) => dominates(solution, point, analysis.directions, analysis.tolerance))) {
    return 'dominated';
  }
  if (analysis.optimal.some((solution) => dominates(point, solution, analysis.directions, analysis.tolerance))) {
    return 'infeasible';
  }
  return 'optimal';
}

/** How many Y units a point gains or loses compared with the frontier. Positive is better. */
export function frontierAdvantage(
  y: number,
  ceiling: number,
  direction: ObjectiveDirection,
): number {
  return objectiveScore(y, direction) - objectiveScore(ceiling, direction);
}

function describeAdvantage(
  y: number,
  ceiling: number,
  direction: ObjectiveDirection,
): string {
  const amount = formatValue(Math.abs(frontierAdvantage(y, ceiling, direction)));
  return direction === 'maximize'
    ? `exceeds the frontier by ${amount} units`
    : `is ${amount} units below the frontier`;
}

function objectiveNames(project: ParetoProject): string {
  const names = [project.x.label || 'X', project.y.label || 'Y'];
  if (project.z) names.push(project.z.label || 'Z');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names[2]}`;
}

function coordinates(point: Solution, project: ParetoProject): string {
  const values = [formatValue(point.x), formatValue(point.y)];
  if (project.z && typeof point.z === 'number') values.push(formatValue(point.z));
  return `(${values.join(', ')})`;
}

function noteForSolution(solution: EvaluatedSolution, project: ParetoProject): string {
  if (solution.kind === 'optimal') {
    return 'No other candidate is better on every objective at once.';
  }
  const dominator = project.candidates.find((candidate) => candidate.id === solution.dominatedBy);
  if (!dominator) return 'Another candidate is better on every objective.';
  return `${dominator.label} ${coordinates(dominator, project)} is better on every ${objectiveNames(project)}.`;
}

function noteForTarget(target: EvaluatedTarget, project: ParetoProject): string {
  if (project.z) {
    if (target.kind === 'infeasible') {
      const beaten = project.candidates.find((candidate) => candidate.id === target.comparedTo);
      return beaten
        ? `It dominates ${beaten.label} ${coordinates(beaten, project)}, beyond the current frontier.`
        : 'It dominates a non-dominated candidate, beyond the current frontier.';
    }
    if (target.kind === 'dominated') return 'At least one candidate is better on every objective.';
    if (target.kind === 'optimal') return 'No candidate dominates it and it does not beat any frontier point.';
    return 'Add at least one candidate to compute a frontier.';
  }
  const ceiling = target.ceiling;
  if (ceiling === null) return 'Add at least one candidate to compute a frontier.';
  if (target.kind === 'infeasible') {
    return `It ${describeAdvantage(target.y, ceiling, project.y.direction)} on ${project.y.label}.`;
  }
  if (target.kind === 'optimal') return 'It lies on the computed frontier.';
  return `At ${project.x.label} = ${formatValue(target.x)} the frontier reaches ${project.y.label} = ${formatValue(ceiling)}.`;
}

function evaluateAgainstFrontier(
  point: { x: number; y: number },
  path: FrontierPoint[],
  tolerance: number,
  directions: AxisDirections,
): { kind: Feasibility; ceiling: number | null } {
  const ceiling = ceilingAt(point.x, path);
  if (ceiling === null) return { kind: null, ceiling: null };
  const advantage = frontierAdvantage(point.y, ceiling, directions.y);
  if (advantage > tolerance) return { kind: 'infeasible', ceiling };
  if (Math.abs(advantage) <= tolerance) return { kind: 'optimal', ceiling };
  return { kind: 'dominated', ceiling };
}

function normalizedScores(
  point: Solution,
  project: ParetoProject,
  directions: AxisDirections,
): number[] {
  const axes = activeAxes(project);
  return axes.map((axis, index) => {
    const key = AXIS_KEYS[index];
    const value = key === 'x' ? point.x : key === 'y' ? point.y : point.z ?? 0;
    const direction = key === 'x' ? directions.x : key === 'y' ? directions.y : directions.z ?? 'maximize';
    const score = objectiveScore(value, direction);
    const low = Math.min(objectiveScore(axis.min, direction), objectiveScore(axis.max, direction));
    const high = Math.max(objectiveScore(axis.min, direction), objectiveScore(axis.max, direction));
    return (score - low) / safeSpan(low, high);
  });
}

/** Minimum spanning tree through the non-dominated candidates, used as a 3D frontier skeleton. */
export function frontierEdges(project: ParetoProject, optimal: EvaluatedSolution[]): FrontierEdge[] {
  if (optimal.length < 2) return [];
  const directions = activeDirections(project);
  const vectors = new Map(optimal.map((point) => [point.id, normalizedScores(point, project, directions)]));
  const visited = new Set([optimal[0].id]);
  const edges: FrontierEdge[] = [];
  while (visited.size < optimal.length) {
    let best: { from: string; to: string; distance: number } | null = null;
    for (const from of visited) {
      for (const to of optimal) {
        if (visited.has(to.id)) continue;
        const a = vectors.get(from) ?? [];
        const b = vectors.get(to.id) ?? [];
        const distance = Math.sqrt(a.reduce((sum, value, index) => sum + (value - (b[index] ?? 0)) ** 2, 0));
        if (!best || distance < best.distance) best = { from, to: to.id, distance };
      }
    }
    if (!best) break;
    edges.push({ from: best.from, to: best.to });
    visited.add(best.to);
  }
  return edges;
}

/**
 * Computes the Pareto set and evaluates every candidate and reference point.
 * Non-finite or out-of-range coordinates are ignored so the result stays inside the plot.
 */
export function evaluateProject(project: ParetoProject): FrontierAnalysis {
  const directions = activeDirections(project);
  const dimensions: ObjectiveCount = project.z ? 3 : 2;
  const usable = project.candidates.filter(
    (candidate) =>
      Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y) &&
      (!project.z || (typeof candidate.z === 'number' && Number.isFinite(candidate.z))) &&
      inRange(candidate, project),
  );

  const solutions: EvaluatedSolution[] = usable.map((candidate) => {
    const dominator = usable.find(
      (other) => other.id !== candidate.id && dominates(other, candidate, directions),
    );
    return {
      ...candidate,
      kind: dominator ? 'dominated' : 'optimal',
      dominatedBy: dominator?.id,
      note: '',
    };
  });

  solutions.forEach((solution) => {
    solution.note = noteForSolution(solution, project);
  });

  // Original X ascending; ties keep the candidate preferred on Y for the drawn frontier.
  const optimal = solutions
    .filter((solution) => solution.kind === 'optimal')
    .sort((a, b) => {
      const byX = a.x - b.x;
      if (byX !== 0) return byX;
      const byY = objectiveScore(b.y, directions.y) - objectiveScore(a.y, directions.y);
      if (byY !== 0) return byY;
      return objectiveScore(b.z ?? 0, directions.z ?? 'maximize') - objectiveScore(a.z ?? 0, directions.z ?? 'maximize');
    });

  let path: FrontierPoint[] = [];
  let edges: FrontierEdge[] = [];
  if (dimensions === 2) {
    // Identical solutions are both non-dominated, but the drawn frontier needs one vertex per X.
    const front = optimal.filter((point, index) => index === 0 || point.x !== optimal[index - 1].x);
    const rawPath: FrontierPoint[] =
      front.length === 0
        ? []
        : [
            { x: project.x.min, y: front[0].y },
            ...front.map((point) => ({ x: point.x, y: point.y })),
            { x: project.x.max, y: front[front.length - 1].y },
          ];
    path = rawPath.filter(
      (point, index) =>
        index === 0 || point.x !== rawPath[index - 1].x || point.y !== rawPath[index - 1].y,
    );
  } else {
    edges = frontierEdges(project, optimal);
  }

  const tolerance = frontierTolerance(project);
  const targets: EvaluatedTarget[] = project.targets
    .filter((target) => Number.isFinite(target.x) && Number.isFinite(target.y) && inRange(target, project))
    .map((target) => {
      const evaluated: EvaluatedTarget = { ...target, kind: null, ceiling: null, note: '' };
      if (dimensions === 3) {
        const dominator = solutions.find((solution) => dominates(solution, target, directions, tolerance));
        const improved = optimal.find((point) => dominates(target, point, directions, tolerance));
        evaluated.kind = dominator ? 'dominated' : improved ? 'infeasible' : 'optimal';
        evaluated.comparedTo = dominator?.id ?? improved?.id;
      } else {
        const result = evaluateAgainstFrontier(target, path, tolerance, directions);
        evaluated.kind = result.kind;
        evaluated.ceiling = result.ceiling;
      }
      evaluated.note = noteForTarget(evaluated, project);
      return evaluated;
    });

  return {
    path,
    edges,
    dimensions,
    directions,
    solutions,
    optimal,
    dominated: solutions.filter((solution) => solution.kind === 'dominated'),
    targets,
    tolerance,
  };
}

/** Messages that block the wizard or warn the user in the data editor. */
export function validationMessages(project: ParetoProject): string[] {
  const messages: string[] = [];
  if (!project.title.trim()) messages.push('Give the project a title.');
  if (!project.x.label.trim()) messages.push('Name the X axis.');
  if (!project.y.label.trim()) messages.push('Name the Y axis.');
  if (project.z && !project.z.label.trim()) messages.push('Name the Z axis.');
  if (
    !isObjectiveDirection(project.x.direction) ||
    !isObjectiveDirection(project.y.direction) ||
    (project.z && !isObjectiveDirection(project.z.direction))
  ) {
    messages.push('Choose whether each objective should be maximized or minimized.');
  }
  const axisIssues: Array<[string, AxisConfig]> = project.z
    ? [['X', project.x], ['Y', project.y], ['Z', project.z]]
    : [['X', project.x], ['Y', project.y]];
  for (const [name, axis] of axisIssues) {
    if (!Number.isFinite(axis.min) || !Number.isFinite(axis.max) || axis.max <= axis.min) {
      messages.push(`The ${name} axis maximum must be greater than its minimum.`);
    }
  }
  if (project.candidates.length < 1) messages.push('Add at least one candidate solution.');
  const points = [...project.candidates, ...project.targets];
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    messages.push('Every point needs numeric coordinates.');
  }
  if (project.z && points.some((point) => typeof point.z !== 'number' || !Number.isFinite(point.z))) {
    messages.push('Every point needs a numeric value on the Z axis.');
  }
  if (points.some((point) => !inRange(point, project))) {
    messages.push('Every point must lie inside the axis ranges.');
  }
  return messages;
}

/** Formats a number for display. */
export function formatValue(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return Number(value.toFixed(digits)).toString();
}
