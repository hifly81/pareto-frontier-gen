import { useEffect, useState } from 'react';
import type {
  AxisConfig,
  ObjectiveDirection,
  ObjectiveKey,
  ParetoProject,
  PointKind,
  Solution,
} from '../domain/pareto';
import { clamp, objectiveArrow } from '../domain/pareto';
import { newId } from '../id';

export interface SuggestedPoint {
  x: number;
  y: number;
  z?: number;
}

/** Spreads newly added points along a trade-off consistent with the axis directions. */
export function suggestSolutionPoint(project: ParetoProject, index: number): SuggestedPoint {
  const rank = index % 7;
  const xRatio = Math.min(0.9, 0.2 + rank * 0.1);
  const yRatio =
    project.x.direction === project.y.direction
      ? Math.max(0.05, 0.9 - rank * 0.1)
      : Math.min(0.95, 0.1 + rank * 0.1);
  const point: SuggestedPoint = {
    x: Number((project.x.min + (project.x.max - project.x.min) * xRatio).toFixed(2)),
    y: Number((project.y.min + (project.y.max - project.y.min) * yRatio).toFixed(2)),
  };
  if (project.z) {
    const zRatio = Math.min(0.95, 0.15 + ((rank * 2) % 7) * 0.1);
    point.z = Number((project.z.min + (project.z.max - project.z.min) * zRatio).toFixed(2));
  }
  return point;
}

function bound(value: number, axis: AxisConfig): number {
  return axis.max > axis.min ? clamp(value, axis.min, axis.max) : value;
}

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  bounds?: { min: number; max: number };
}

export function NumberField({ label, value, onCommit, bounds }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step="any"
        min={bounds && bounds.max > bounds.min ? bounds.min : undefined}
        max={bounds && bounds.max > bounds.min ? bounds.max : undefined}
        value={draft}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const parsed = Number(text);
          if (text.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  );
}

const AXIS_PLACEHOLDERS: Record<ObjectiveKey, string> = {
  x: 'e.g. Cost per 1M tokens',
  y: 'e.g. Benchmark accuracy',
  z: 'e.g. Throughput',
};

interface AxisFieldsProps {
  axisName: ObjectiveKey;
  axis: AxisConfig;
  onPatch: (patch: Partial<AxisConfig>) => void;
}

export function AxisFields({ axisName, axis, onPatch }: AxisFieldsProps) {
  const [ticksDraft, setTicksDraft] = useState(axis.ticks.join(', '));

  useEffect(() => setTicksDraft(axis.ticks.join(', ')), [axis.ticks]);

  return (
    <fieldset className="config-group">
      <legend>{axisName.toUpperCase()} axis</legend>
      <label className="field field--wide">
        <span>Axis measure / name</span>
        <input
          type="text"
          value={axis.label}
          placeholder={AXIS_PLACEHOLDERS[axisName]}
          onChange={(event) => onPatch({ label: event.target.value })}
        />
      </label>
      <label className="field field--wide">
        <span>Preference</span>
        <select
          value={axis.direction}
          onChange={(event) => onPatch({ direction: event.target.value as ObjectiveDirection })}
        >
          <option value="maximize">Maximize ↑ (higher is better)</option>
          <option value="minimize">Minimize ↓ (lower is better)</option>
        </select>
      </label>
      <NumberField
        label="Minimum"
        value={axis.min}
        bounds={{ min: axis.min, max: axis.max }}
        onCommit={(min) => onPatch({ min: min < axis.max ? min : axis.max - 1 })}
      />
      <NumberField
        label="Maximum"
        value={axis.max}
        bounds={{ min: axis.min, max: axis.max }}
        onCommit={(max) => onPatch({ max: max > axis.min ? max : axis.min + 1 })}
      />
      <label className="field field--wide">
        <span>Tick values (comma separated)</span>
        <input
          type="text"
          value={ticksDraft}
          placeholder="0, 20, 40, 60, 80, 100"
          onChange={(event) => {
            const text = event.target.value;
            setTicksDraft(text);
            const ticks = text
              .split(',')
              .map((part) => part.trim())
              .filter((part) => part !== '')
              .map(Number)
              .filter(Number.isFinite);
            onPatch({ ticks });
          }}
        />
      </label>
      <label className="field field--wide">
        <span>Axis description</span>
        <textarea
          rows={2}
          value={axis.description}
          placeholder={`Describe what the ${axisName.toUpperCase()} axis measures`}
          onChange={(event) => onPatch({ description: event.target.value })}
        />
      </label>
    </fieldset>
  );
}

const STATUS_LABELS: Record<PointKind, string> = {
  optimal: 'Pareto-optimal',
  dominated: 'Dominated',
  infeasible: 'Infeasible',
};

interface StatusBadgeProps {
  kind: PointKind | null;
}

export function StatusBadge({ kind }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${kind ?? 'unknown'}`}>
      {kind ? STATUS_LABELS[kind] : 'Unclassified'}
    </span>
  );
}

interface SolutionTableProps {
  title: string;
  solutions: Solution[];
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  zAxis?: AxisConfig | null;
  statuses?: Record<string, PointKind | null>;
  addLabel: string;
  emptyHint: string;
  suggestPoint: (index: number) => SuggestedPoint;
  onChange: (solutions: Solution[]) => void;
}

export function SolutionTable({
  title,
  solutions,
  xAxis,
  yAxis,
  zAxis,
  statuses,
  addLabel,
  emptyHint,
  suggestPoint,
  onChange,
}: SolutionTableProps) {
  const rowClass = `point-row ${zAxis ? 'point-row--3d' : ''}`;

  function patch(id: string, patch: Partial<Solution>) {
    onChange(
      solutions.map((solution) => {
        if (solution.id !== id) return solution;
        const next: Solution = {
          ...solution,
          ...patch,
          x: patch.x !== undefined ? bound(patch.x, xAxis) : solution.x,
          y: patch.y !== undefined ? bound(patch.y, yAxis) : solution.y,
        };
        if (zAxis) {
          next.z =
            patch.z !== undefined
              ? bound(patch.z, zAxis)
              : typeof solution.z === 'number'
                ? solution.z
                : bound((zAxis.min + zAxis.max) / 2, zAxis);
        }
        return next;
      }),
    );
  }

  function add() {
    const suggested = suggestPoint(solutions.length);
    const point: Solution = {
      id: newId('point'),
      label: `New point ${solutions.length + 1}`,
      x: bound(suggested.x, xAxis),
      y: bound(suggested.y, yAxis),
    };
    if (zAxis) point.z = bound(suggested.z ?? (zAxis.min + zAxis.max) / 2, zAxis);
    onChange([...solutions, point]);
  }

  return (
    <fieldset className="config-group config-group--points">
      <legend>{title}</legend>
      <div className="point-table" role="group" aria-label={title}>
        <div className={`${rowClass} point-row--header`} aria-hidden="true">
          <span>Name</span>
          <span>
            {xAxis.label || 'X'} {objectiveArrow(xAxis.direction)}
          </span>
          <span>
            {yAxis.label || 'Y'} {objectiveArrow(yAxis.direction)}
          </span>
          {zAxis && (
            <span>
              {zAxis.label || 'Z'} {objectiveArrow(zAxis.direction)}
            </span>
          )}
          <span>{statuses ? 'Computed status' : 'Role'}</span>
          <span />
        </div>
        {solutions.map((solution) => (
          <div className={rowClass} key={solution.id}>
            <input
              type="text"
              aria-label="Point name"
              value={solution.label}
              onChange={(event) => patch(solution.id, { label: event.target.value })}
            />
            <NumberField
              label={`${xAxis.label || 'X'} value`}
              value={solution.x}
              bounds={{ min: xAxis.min, max: xAxis.max }}
              onCommit={(x) => patch(solution.id, { x })}
            />
            <NumberField
              label={`${yAxis.label || 'Y'} value`}
              value={solution.y}
              bounds={{ min: yAxis.min, max: yAxis.max }}
              onCommit={(y) => patch(solution.id, { y })}
            />
            {zAxis && (
              <NumberField
                label={`${zAxis.label || 'Z'} value`}
                value={solution.z ?? (zAxis.min + zAxis.max) / 2}
                bounds={{ min: zAxis.min, max: zAxis.max }}
                onCommit={(z) => patch(solution.id, { z })}
              />
            )}
            {statuses ? (
              <StatusBadge kind={statuses[solution.id] ?? null} />
            ) : (
              <span className="role-label">Candidate</span>
            )}
            <button
              type="button"
              className="remove-button"
              aria-label={`Remove ${solution.label}`}
              title="Remove point"
              onClick={() => onChange(solutions.filter((item) => item.id !== solution.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="add-button" onClick={add}>
        {addLabel}
      </button>
      {solutions.length === 0 && <p className="config-hint">{emptyHint}</p>}
    </fieldset>
  );
}
