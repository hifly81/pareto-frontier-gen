import type {
  AxisConfig,
  FrontierAnalysis,
  ObjectiveKey,
  ParetoProject,
  PointKind,
  Solution,
} from '../domain/pareto';
import {
  ceilingAt,
  formatValue,
  objectiveArrow,
  setObjectiveCount,
  validationMessages,
} from '../domain/pareto';
import { AxisFields, SolutionTable, suggestSolutionPoint } from './FormFields';

interface ChartConfigPanelProps {
  project: ParetoProject;
  analysis: FrontierAnalysis;
  onChange: (project: ParetoProject) => void;
}

export function ChartConfigPanel({ project, analysis, onChange }: ChartConfigPanelProps) {
  const candidateStatuses: Record<string, PointKind | null> = Object.fromEntries(
    analysis.solutions.map((solution) => [solution.id, solution.kind]),
  );
  const targetStatuses: Record<string, PointKind | null> = Object.fromEntries(
    analysis.targets.map((target) => [target.id, target.kind]),
  );

  function patchAxis(axisName: ObjectiveKey, patch: Partial<AxisConfig>) {
    if (axisName === 'z') {
      if (!project.z) return;
      onChange({ ...project, z: { ...project.z, ...patch } });
      return;
    }
    onChange({ ...project, [axisName]: { ...project[axisName], ...patch } });
  }

  function setCandidates(candidates: Solution[]) {
    onChange({ ...project, candidates });
  }

  function setTargets(targets: Solution[]) {
    onChange({ ...project, targets });
  }

  const issues = validationMessages(project);
  const xMid = project.x.min + (project.x.max - project.x.min) / 2;
  const ceiling = ceilingAt(xMid, analysis.path);

  return (
    <div className="config-body">
      <p className="config-intro">
        Edit the objectives and the solutions below. The arrows ({objectiveArrow('maximize')} /{' '}
        {objectiveArrow('minimize')}) show which direction is preferred on each axis. The frontier,
        statuses and reference-point checks update instantly. Statuses are never entered manually.
      </p>

      {issues.length > 0 && (
        <p className="config-warning" role="alert">
          {issues.join(' ')}
        </p>
      )}

      <fieldset className="config-group objective-toggle">
        <legend>Objectives</legend>
        <button
          type="button"
          className="mode-option"
          aria-pressed={!project.z}
          onClick={() => onChange(setObjectiveCount(project, 2))}
        >
          <strong>2 objectives</strong>
          <span>Flat trade-off chart</span>
        </button>
        <button
          type="button"
          className="mode-option"
          aria-pressed={Boolean(project.z)}
          onClick={() => onChange(setObjectiveCount(project, 3))}
        >
          <strong>3 objectives</strong>
          <span>Interactive 3D chart</span>
        </button>
      </fieldset>

      <div className="config-grid">
        <AxisFields axisName="x" axis={project.x} onPatch={(patch) => patchAxis('x', patch)} />
        <AxisFields axisName="y" axis={project.y} onPatch={(patch) => patchAxis('y', patch)} />
        {project.z && (
          <AxisFields axisName="z" axis={project.z} onPatch={(patch) => patchAxis('z', patch)} />
        )}
      </div>

      <fieldset className="config-group config-group--points config-group--project">
        <legend>Project</legend>
        <label className="field field--wide">
          <span>Title</span>
          <input
            type="text"
            value={project.title}
            onChange={(event) => onChange({ ...project, title: event.target.value })}
          />
        </label>
        <label className="field field--wide">
          <span>Short description</span>
          <textarea
            rows={2}
            value={project.summary}
            onChange={(event) => onChange({ ...project, summary: event.target.value })}
          />
        </label>
      </fieldset>

      <SolutionTable
        title="Candidate solutions"
        solutions={project.candidates}
        xAxis={project.x}
        yAxis={project.y}
        zAxis={project.z}
        statuses={candidateStatuses}
        addLabel="+ Add solution"
        emptyHint="Add at least one candidate solution to compute a frontier."
        suggestPoint={(index) => suggestSolutionPoint(project, index)}
        onChange={setCandidates}
      />

      <SolutionTable
        title="Reference points (targets)"
        solutions={project.targets}
        xAxis={project.x}
        yAxis={project.y}
        zAxis={project.z}
        statuses={targetStatuses}
        addLabel="+ Add target"
        emptyHint="Optional: add a desired combination to check it against the frontier."
        suggestPoint={(index) => suggestSolutionPoint(project, index)}
        onChange={setTargets}
      />

      <p className="config-hint">
        {analysis.optimal.length} of {analysis.solutions.length} solutions are on the frontier.
        {project.z
          ? ` The 3D frontier skeleton connects them with ${analysis.edges.length} link${analysis.edges.length === 1 ? '' : 's'}.`
          : ceiling !== null &&
            ` At ${project.x.label || 'X'} = ${formatValue(xMid, 2)}, the frontier reaches ${project.y.label || 'Y'} = ${formatValue(ceiling, 2)}.`}
      </p>
    </div>
  );
}
