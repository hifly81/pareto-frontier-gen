import { useState } from 'react';
import type { AxisConfig, ParetoProject, Solution } from '../domain/pareto';
import {
  evaluateProject,
  formatValue,
  isObjectiveDirection,
  setObjectiveCount,
  validationMessages,
} from '../domain/pareto';
import { AxisFields, SolutionTable, suggestSolutionPoint } from './FormFields';
import { SiteHeader } from './SiteHeader';

interface WizardProps {
  initial: ParetoProject;
  onCancel: () => void;
  onFinish: (project: ParetoProject) => void;
}

const STEPS = ['Objectives', 'Solutions', 'Review'] as const;

export function Wizard({ initial, onCancel, onFinish }: WizardProps) {
  const [project, setProject] = useState<ParetoProject>(initial);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const axes = project.z ? [project.x, project.y, project.z] : [project.x, project.y];
  const axesValid =
    Boolean(project.title.trim()) &&
    axes.every(
      (axis) =>
        Boolean(axis.label.trim()) &&
        Number.isFinite(axis.min) &&
        Number.isFinite(axis.max) &&
        axis.max > axis.min &&
        isObjectiveDirection(axis.direction),
    );

  const candidatesValid =
    project.candidates.length >= 1 &&
    project.candidates.every(
      (candidate) =>
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y) &&
        (!project.z || (typeof candidate.z === 'number' && Number.isFinite(candidate.z))),
    );

  const issues = validationMessages(project);
  const analysis = evaluateProject(project);

  function patchAxis(axisName: 'x' | 'y' | 'z', patch: Partial<AxisConfig>) {
    setProject((current) => {
      if (axisName === 'z') {
        if (!current.z) return current;
        return { ...current, z: { ...current.z, ...patch } };
      }
      return { ...current, [axisName]: { ...current[axisName], ...patch } };
    });
  }

  function setCandidates(candidates: Solution[]) {
    setProject((current) => ({ ...current, candidates }));
  }

  return (
    <div className="app-shell">
      <SiteHeader context="GUIDED WIZARD" detail={`Step ${step} of 3`} onHome={onCancel} />

      <div className="intro intro--compact">
        <div className="eyebrow">CREATE FROM SCRATCH</div>
        <h1>Set up your frontier</h1>
        <p>Three short steps. You can change everything later in the chart data editor.</p>
      </div>

      <ol className="wizard-stepper" aria-label="Wizard progress">
        {STEPS.map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3;
          return (
            <li
              key={label}
              className={`step-chip ${step === number ? 'is-current' : ''} ${step > number ? 'is-done' : ''}`}
              aria-current={step === number ? 'step' : undefined}
            >
              <span>{step > number ? '✓' : number}</span>
              {label}
            </li>
          );
        })}
      </ol>

      <section className="card wizard-card">
        {step === 1 && (
          <div className="wizard-body">
            <h2>1. Objectives</h2>
            <p className="config-intro">
              Choose two or three objectives. Each one can be maximized or minimized independently.
              Set names, preferences, ranges, ticks and descriptions.
            </p>
            <fieldset className="config-group objective-toggle">
              <legend>Objectives</legend>
              <button
                type="button"
                className="mode-option"
                aria-pressed={!project.z}
                onClick={() => setProject((current) => setObjectiveCount(current, 2))}
              >
                <strong>2 objectives</strong>
                <span>Flat trade-off chart</span>
              </button>
              <button
                type="button"
                className="mode-option"
                aria-pressed={Boolean(project.z)}
                onClick={() => setProject((current) => setObjectiveCount(current, 3))}
              >
                <strong>3 objectives</strong>
                <span>Interactive 3D chart</span>
              </button>
            </fieldset>
            <label className="field field--solo">
              <span>Project title</span>
              <input
                type="text"
                value={project.title}
                placeholder="e.g. Product launch plan"
                onChange={(event) => setProject({ ...project, title: event.target.value })}
              />
            </label>
            <label className="field field--solo">
              <span>Short description</span>
              <textarea
                rows={2}
                value={project.summary}
                placeholder="What does this comparison describe?"
                onChange={(event) => setProject({ ...project, summary: event.target.value })}
              />
            </label>
            <div className="config-grid">
              <AxisFields axisName="x" axis={project.x} onPatch={(patch) => patchAxis('x', patch)} />
              <AxisFields axisName="y" axis={project.y} onPatch={(patch) => patchAxis('y', patch)} />
              {project.z && (
                <AxisFields axisName="z" axis={project.z} onPatch={(patch) => patchAxis('z', patch)} />
              )}
            </div>
            {!axesValid && (
              <p className="config-warning" role="alert">
                Add a title and a name for each objective, then check that every maximum is greater
                than its minimum.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <h2>2. Candidate solutions</h2>
            <p className="config-intro">
              Enter the alternatives you want to compare. A solution is Pareto-optimal when no other
              solution is at least as good on every objective and strictly better on one, after
              accounting for each axis preference.
            </p>
            <SolutionTable
              title="Candidate solutions"
              solutions={project.candidates}
              xAxis={project.x}
              yAxis={project.y}
              zAxis={project.z}
              addLabel="+ Add solution"
              emptyHint="No solutions yet. Add at least one to compute a frontier."
              suggestPoint={(index) => suggestSolutionPoint(project, index)}
              onChange={setCandidates}
            />
            {project.candidates.length > 0 && (
              <p className="config-hint">
                {project.candidates.length} solution{project.candidates.length === 1 ? '' : 's'} added ·{' '}
                {analysis.optimal.length} currently non-dominated.
              </p>
            )}
            {!candidatesValid && (
              <p className="config-warning" role="alert">
                Add at least one solution with numeric coordinates on every objective to continue.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-body">
            <h2>3. Review</h2>
            <p className="config-intro">
              The frontier is computed from the solutions you entered. Open the chart to explore it
              in {project.z ? 'three dimensions' : 'two dimensions'} and edit anything you want.
            </p>
            <div className="review-stats">
              <div>
                <strong>{project.candidates.length}</strong>
                <span>Candidate solutions</span>
              </div>
              <div>
                <strong>{analysis.optimal.length}</strong>
                <span>Pareto-optimal</span>
              </div>
              <div>
                <strong>{analysis.dominated.length}</strong>
                <span>Dominated</span>
              </div>
              <div>
                <strong>{analysis.targets.filter((target) => target.kind === 'infeasible').length}</strong>
                <span>Infeasible targets</span>
              </div>
            </div>
            <ul className="review-list">
              {analysis.optimal.map((solution) => (
                <li key={solution.id}>
                  <strong>{solution.label || 'Unnamed solution'}</strong>
                  <span>
                    {formatValue(solution.x)} · {formatValue(solution.y)}
                    {project.z && typeof solution.z === 'number' && ` · ${formatValue(solution.z)}`}
                  </span>
                </li>
              ))}
            </ul>
            {issues.length > 0 && (
              <p className="config-warning" role="alert">
                {issues.join(' ')}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="wizard-actions">
        <button
          type="button"
          className="reset-button"
          onClick={() => (step === 1 ? onCancel() : setStep((step - 1) as 1 | 2))}
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={step === 1 ? !axesValid : step === 2 ? !candidatesValid : issues.length > 0}
          onClick={() => (step === 3 ? onFinish(project) : setStep((step + 1) as 2 | 3))}
        >
          {step === 3 ? 'Open frontier' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
