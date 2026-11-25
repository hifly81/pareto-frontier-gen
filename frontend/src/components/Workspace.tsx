import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ceilingAt,
  classify,
  classifyPoint,
  evaluateProject,
  formatValue,
  frontierAdvantage,
  isObjectiveDirection,
  objectiveArrow,
  objectiveScore,
} from '../domain/pareto';
import type {
  EvaluatedSolution,
  EvaluatedTarget,
  FrontierAnalysis,
  Layers,
  ParetoProject,
  PointKind,
  Probe,
} from '../domain/pareto';
import { COLORS, KIND_COLOR } from '../theme';
import { exportChartPng, exportChartSvg } from '../chartExport';
import { exportProject, importProject } from '../projectFile';
import { ChartConfigPanel } from './ChartConfigPanel';
import { ParetoChart } from './ParetoChart';
import type { ChartView } from './ParetoChart3D';
import { DEFAULT_CHART_VIEW } from './ParetoChart3D';
import { SiteHeader } from './SiteHeader';

const DEFAULT_LAYERS: Layers = {
  grid: true,
  regions: true,
  frontier: true,
  points: true,
  annotations: true,
};

const LAYER_LABELS: Array<{ key: keyof Layers; label: string }> = [
  { key: 'grid', label: 'Grid' },
  { key: 'regions', label: 'Regions' },
  { key: 'frontier', label: 'Frontier' },
  { key: 'points', label: 'Points' },
  { key: 'annotations', label: 'Annotations' },
];

const KIND_LABELS: Record<PointKind, string> = {
  optimal: 'Pareto-optimal',
  dominated: 'Dominated',
  infeasible: 'Infeasible',
};

const CONCEPTS: Array<{ color: string; title: string; text: string }> = [
  {
    color: COLORS.indigo,
    title: 'Computed frontier',
    text: 'With two objectives it is a line through the non-dominated solutions. With three it becomes a connected skeleton in the 3D volume.',
  },
  {
    color: COLORS.teal,
    title: 'Pareto-optimal solutions',
    text: 'Moving from one to another requires a trade-off: one objective improves only if another gets worse.',
  },
  {
    color: COLORS.amber,
    title: 'Dominated solutions',
    text: 'Reachable alternatives that are inefficient: another candidate is better on every objective.',
  },
  {
    color: COLORS.rose,
    title: 'Infeasible targets',
    text: 'Desired combinations beyond the frontier. No candidate set can reach them under the current data.',
  },
];

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${formatValue(Math.abs(value), 2)}`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function coordinates(point: { x: number; y: number; z?: number }, project: ParetoProject): string {
  const values = [formatValue(point.x), formatValue(point.y)];
  if (project.z && typeof point.z === 'number') values.push(formatValue(point.z));
  return `(${values.join(', ')})`;
}

interface DetailProps {
  project: ParetoProject;
  analysis: FrontierAnalysis;
  candidate: EvaluatedSolution | null;
  target: EvaluatedTarget | null;
  probe: Probe | null;
}

function Detail({ project, analysis, candidate, target, probe }: DetailProps) {
  const xLabel = `${project.x.label || 'X axis'} ${objectiveArrow(project.x.direction)}`;
  const yLabel = `${project.y.label || 'Y axis'} ${objectiveArrow(project.y.direction)}`;
  const zLabel = project.z ? `${project.z.label || 'Z axis'} ${objectiveArrow(project.z.direction)}` : '';

  if (candidate) {
    const index = analysis.optimal.findIndex((solution) => solution.id === candidate.id);
    const next = index >= 0 ? analysis.optimal[index + 1] : undefined;
    const better = analysis.solutions.find((solution) => solution.id === candidate.dominatedBy);
    const ceiling = ceilingAt(candidate.x, analysis.path);

    return (
      <>
        <div className="detail-eyebrow">CANDIDATE SOLUTION</div>
        <h2>{candidate.label || 'Unnamed solution'}</h2>
        <div className="detail-coords">
          <span>{xLabel}</span>
          <strong>{formatValue(candidate.x)}</strong>
          <span>{yLabel}</span>
          <strong>{formatValue(candidate.y)}</strong>
          {project.z && typeof candidate.z === 'number' && (
            <>
              <span>{zLabel}</span>
              <strong>{formatValue(candidate.z)}</strong>
            </>
          )}
        </div>
        <span className={`status status--${candidate.kind}`}>{KIND_LABELS[candidate.kind]}</span>
        <p className="detail-note">{candidate.note}</p>

        {next && (
          <div className="detail-fact">
            <span className="detail-fact-title">Trade-off toward {next.label || 'next solution'}</span>
            <div className="delta-row">
              <span>Δ {xLabel}</span>
              <strong
                className={
                  objectiveScore(next.x, project.x.direction) >
                  objectiveScore(candidate.x, project.x.direction)
                    ? 'delta-up'
                    : 'delta-down'
                }
              >
                {signed(next.x - candidate.x)}
              </strong>
              <span>Δ {yLabel}</span>
              <strong
                className={
                  objectiveScore(next.y, project.y.direction) >
                  objectiveScore(candidate.y, project.y.direction)
                    ? 'delta-up'
                    : 'delta-down'
                }
              >
                {signed(next.y - candidate.y)}
              </strong>
              {project.z && typeof next.z === 'number' && typeof candidate.z === 'number' && (
                <>
                  <span>Δ {zLabel}</span>
                  <strong
                    className={
                      objectiveScore(next.z, project.z.direction) >
                      objectiveScore(candidate.z, project.z.direction)
                        ? 'delta-up'
                        : 'delta-down'
                    }
                  >
                    {signed(next.z - candidate.z)}
                  </strong>
                </>
              )}
            </div>
          </div>
        )}

        {candidate.kind === 'dominated' && (
          <div className="detail-fact">
            <span className="detail-fact-title">Comparison</span>
            <p>
              {project.z
                ? better
                  ? `${better.label || 'Another solution'} ${coordinates(better, project)} dominates this solution on every objective.`
                  : 'Another candidate improves every objective.'
                : ceiling !== null &&
                  `At ${xLabel} = ${formatValue(candidate.x)} the frontier reaches ${yLabel} = ${formatValue(ceiling)}. `}
              {!project.z &&
                (better
                  ? `${better.label || 'Another solution'} ${coordinates(better, project)} dominates this solution.`
                  : 'Another candidate improves both objectives.')}
            </p>
          </div>
        )}
      </>
    );
  }

  if (target) {
    const kindClass = target.kind ?? 'unknown';
    return (
      <>
        <div className="detail-eyebrow">REFERENCE POINT</div>
        <h2>{target.label || 'Unnamed target'}</h2>
        <div className="detail-coords">
          <span>{xLabel}</span>
          <strong>{formatValue(target.x)}</strong>
          <span>{yLabel}</span>
          <strong>{formatValue(target.y)}</strong>
          {project.z && typeof target.z === 'number' && (
            <>
              <span>{zLabel}</span>
              <strong>{formatValue(target.z)}</strong>
            </>
          )}
        </div>
        <span className={`status status--${kindClass}`}>
          {target.kind ? KIND_LABELS[target.kind] : 'Unclassified'}
        </span>
        <p className="detail-note">{target.note}</p>
        {target.ceiling !== null && (
          <div className="detail-fact">
            <span className="detail-fact-title">Frontier at this value</span>
            <p>
              {yLabel} = {formatValue(target.ceiling)} at {xLabel} = {formatValue(target.x)}.
            </p>
          </div>
        )}
      </>
    );
  }

  if (probe) {
    const probePoint = {
      id: 'probe',
      label: 'Probe',
      x: probe.x,
      y: probe.y,
      z: probe.z ?? (project.z ? (project.z.min + project.z.max) / 2 : undefined),
    };
    const status =
      analysis.dimensions === 3 ? classifyPoint(probePoint, analysis) : classify(probe.x, probe.y, analysis);
    const ceiling = analysis.dimensions === 2 ? ceilingAt(probe.x, analysis.path) : null;
    const title =
      status === 'optimal'
        ? project.z
          ? 'Not dominated'
          : 'On the frontier'
        : status === 'infeasible'
          ? 'Beyond the frontier'
          : status === 'dominated'
            ? 'Inside the feasible region'
            : 'No frontier yet';

    return (
      <>
        <div className="detail-eyebrow">{probe.pinned ? 'PINNED POINT' : 'PROBING'}</div>
        <h2>{title}</h2>
        <div className="detail-coords">
          <span>{xLabel}</span>
          <strong>{formatValue(probe.x)}</strong>
          <span>{yLabel}</span>
          <strong>{formatValue(probe.y)}</strong>
          {project.z && (
            <>
              <span>{zLabel}</span>
              <strong>{formatValue(probePoint.z ?? 0)}</strong>
            </>
          )}
        </div>
        <span className={`status status--${status ?? 'unknown'}`}>
          {status ? KIND_LABELS[status] : 'Unclassified'}
        </span>
        <p className="detail-note">
          {status === 'optimal' &&
            (project.z
              ? 'No candidate beats this combination on every objective, and it does not beat a frontier solution.'
              : 'This combination lies on the computed frontier: no candidate is better on both objectives.')}
          {status === 'dominated' &&
            (project.z
              ? 'At least one candidate is better on every objective at once.'
              : ceiling !== null &&
                `At ${xLabel} = ${formatValue(probe.x, 2)} the frontier reaches ${yLabel} = ${formatValue(ceiling, 2)}: a better combination is available.`)}
          {status === 'infeasible' &&
            (project.z
              ? 'This combination dominates a frontier solution, so it lies beyond the current frontier.'
              : ceiling !== null &&
                `The frontier at ${xLabel} = ${formatValue(probe.x, 2)} reaches ${yLabel} = ${formatValue(ceiling, 2)}. This point is ${formatValue(Math.abs(frontierAdvantage(probe.y, ceiling, project.y.direction)), 2)} units beyond it.`)}
          {status === null && 'Add candidate solutions to compute a frontier first.'}
        </p>
      </>
    );
  }

  return (
    <>
      <div className="detail-eyebrow">COMPUTED FROM DATA</div>
      <h2>Explore the trade-off</h2>
      <p className="detail-note">
        {analysis.solutions.length === 0
          ? 'Add at least one candidate solution in the Chart data panel to compute a frontier.'
          : 'Hover over a solution or target to see how it was classified, or move across the chart to check any combination.'}
      </p>
      <div className="detail-fact">
        <span className="detail-fact-title">The rule</span>
        <p>
          A solution is Pareto-optimal when no other candidate improves one objective without
          worsening another. {analysis.optimal.length} of {analysis.solutions.length} solutions
          qualify here.
        </p>
      </div>
    </>
  );
}

interface WorkspaceProps {
  project: ParetoProject;
  onChange: (project: ParetoProject) => void;
  onHome: () => void;
}

export function Workspace({ project, onChange, onHome }: WorkspaceProps) {
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [view, setView] = useState<ChartView>(DEFAULT_CHART_VIEW);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<HTMLElement>(null);

  const analysis = useMemo(() => evaluateProject(project), [project]);
  const candidate = analysis.solutions.find((solution) => solution.id === selectedId) ?? null;
  const target = analysis.targets.find((point) => point.id === selectedId) ?? null;

  const axesInvalid =
    !project.x.label.trim() ||
    !project.y.label.trim() ||
    !Number.isFinite(project.x.min) ||
    !Number.isFinite(project.x.max) ||
    !Number.isFinite(project.y.min) ||
    !Number.isFinite(project.y.max) ||
    !isObjectiveDirection(project.x.direction) ||
    !isObjectiveDirection(project.y.direction) ||
    project.x.max <= project.x.min ||
    project.y.max <= project.y.min ||
    Boolean(
      project.z &&
        (!project.z.label.trim() ||
          !Number.isFinite(project.z.min) ||
          !Number.isFinite(project.z.max) ||
          !isObjectiveDirection(project.z.direction) ||
          project.z.max <= project.z.min),
    );

  useEffect(() => {
    if (selectedId !== null && !candidate && !target) setSelectedId(null);
  }, [selectedId, candidate, target]);

  const announcement = candidate
    ? `${candidate.label}: ${candidate.kind}`
    : target
      ? `${target.label}: ${target.kind ?? 'unclassified'}`
      : probe?.pinned
        ? `Probe ${coordinates(probe, project)}: ${analysis.dimensions === 3 ? (classifyPoint({ id: 'probe', label: 'Probe', ...probe, z: probe.z ?? 0 }, analysis) ?? 'unclassified') : (classify(probe.x, probe.y, analysis) ?? 'unclassified')}`
        : '';

  function handleProbe(next: Probe | null) {
    if (next?.pinned) {
      setSelectedId(null);
      setProbe(next);
      return;
    }
    if (probe?.pinned || selectedId !== null) return;
    setProbe(next);
  }

  function handleSelectPoint(id: string) {
    setSelectedId(id);
    setProbe(null);
  }

  function resetView() {
    setLayers(DEFAULT_LAYERS);
    setSelectedId(null);
    setProbe(null);
    setView(DEFAULT_CHART_VIEW);
    setNotice(null);
  }

  function handleExport() {
    try {
      exportProject(project);
      setNotice('Project exported as JSON.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function currentChart(): SVGSVGElement | null {
    return chartRef.current?.querySelector<SVGSVGElement>('svg.pareto-chart') ?? null;
  }

  function handleExportSvg() {
    const svg = currentChart();
    if (!svg) {
      setNotice('Fix the axis settings before exporting the chart.');
      return;
    }
    try {
      exportChartSvg(svg, project);
      setNotice('Chart exported as SVG.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function handleExportPng() {
    const svg = currentChart();
    if (!svg) {
      setNotice('Fix the axis settings before exporting the chart.');
      return;
    }
    try {
      await exportChartPng(svg, project);
      setNotice('Chart exported as PNG.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importProject(file);
      onChange(imported);
      setSelectedId(null);
      setProbe(null);
      setNotice('Project imported. Export it as JSON if you want to keep it.');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      event.target.value = '';
    }
  }

  const axisNotes = project.z ? [project.x, project.y, project.z] : [project.x, project.y];

  return (
    <div className="app-shell">
      <SiteHeader
        context="WORKSPACE"
        detail={`${analysis.optimal.length} of ${analysis.solutions.length} non-dominated`}
        onHome={onHome}
      />

      <div className="workspace-head">
        <div className="intro intro--compact">
          <div className="eyebrow">COMPUTED FRONTIER</div>
          <h1>{project.title || 'Untitled frontier'}</h1>
          <p>{project.summary || 'The Pareto front is recalculated whenever the data changes.'}</p>
        </div>
        <div className="workspace-actions">
          <button type="button" className="reset-button" onClick={resetView}>
            Reset view
          </button>
          <button type="button" className="reset-button" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            tabIndex={-1}
            onChange={handleImport}
          />
          <button
            type="button"
            className="reset-button"
            onClick={handleExportSvg}
            disabled={axesInvalid}
          >
            Export SVG
          </button>
          <button
            type="button"
            className="reset-button"
            onClick={handleExportPng}
            disabled={axesInvalid}
          >
            Export PNG
          </button>
          <button type="button" className="primary-button" onClick={handleExport}>
            Export JSON
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`notice ${
            notice.startsWith('Project') || notice.startsWith('Chart') ? 'notice--success' : ''
          }`}
          role="status"
        >
          {notice}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <main className="layout">
        <section className="card chart-card" aria-label="Interactive chart" ref={chartRef}>
          <div className="card-header">
            <div>
              <h2>Trade-off between objectives</h2>
              <p>
                Computed from {analysis.solutions.length} candidate solution
                {analysis.solutions.length === 1 ? '' : 's'} · {project.z ? '3D chart' : '2D chart'}
              </p>
            </div>
          </div>
          {axesInvalid ? (
            <div className="chart-error" role="alert">
              <strong>Fix the axis settings to draw the chart.</strong>
              <span>
                Each axis needs a name, a valid preference and a maximum greater than its minimum.
              </span>
            </div>
          ) : (
            <>
              <ParetoChart
                project={project}
                analysis={analysis}
                layers={layers}
                selectedId={selectedId}
                probe={probe}
                view={view}
                onViewChange={setView}
                onSelectPoint={handleSelectPoint}
                onProbe={handleProbe}
              />
              {project.z && (
                <div className="chart-nav-hint" aria-label="3D chart controls">
                  <span className="chart-nav-hint-title">Explore the 3D chart</span>
                  <span className="chart-nav-hint-item">
                    <kbd>Drag</kbd> rotate the chart
                  </span>
                  <span className="chart-nav-hint-item">
                    <kbd>←</kbd>
                    <kbd>→</kbd> X · {project.x.label || 'X axis'} {objectiveArrow(project.x.direction)}
                  </span>
                  <span className="chart-nav-hint-item">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> Y · {project.y.label || 'Y axis'} {objectiveArrow(project.y.direction)}
                  </span>
                  <span className="chart-nav-hint-item">
                    <kbd>Page Up</kbd>
                    <kbd>Page Down</kbd> Z · {project.z.label || 'Z axis'} {objectiveArrow(project.z.direction)}
                  </span>
                  <span className="chart-nav-hint-note">
                    Click the chart to focus it: arrow keys probe X/Y, Page Up/Down probe Z, and
                    Shift + arrows rotate it. A click without dragging pins a probe on the middle Z
                    plane. Reset view restores the default angle.
                  </span>
                </div>
              )}
            </>
          )}
          <div className={`axis-notes ${project.z ? 'axis-notes--3' : ''}`}>
            {axisNotes.map((axis, index) => (
              <div key={index}>
                <h3>{`${axis.label || `Axis ${index + 1}`} ${objectiveArrow(axis.direction)}`}</h3>
                <p>{axis.description || 'No description provided.'}</p>
              </div>
            ))}
          </div>
          <div className="chart-footer">
            {axisNotes.map((axis, index) => (
              <span key={index}>
                {formatValue(axis.min)} ≤ {`${axis.label || `Axis ${index + 1}`} ${objectiveArrow(axis.direction)}`} ≤{' '}
                {formatValue(axis.max)}
              </span>
            ))}
          </div>
        </section>

        <aside className="sidebar">
          <section className="card detail-card" aria-live="polite">
            <Detail
              project={project}
              analysis={analysis}
              candidate={candidate}
              target={target}
              probe={probe}
            />
          </section>

          <section className="card legend-card">
            <h2>Legend</h2>
            <ul className="legend-list">
              <li><span className="legend-line" style={{ background: COLORS.indigo }} />Computed frontier</li>
              <li><span className="legend-dot" style={{ background: KIND_COLOR.optimal }} />Pareto-optimal solution</li>
              <li><span className="legend-dot" style={{ background: KIND_COLOR.dominated }} />Dominated solution</li>
              <li><span className="legend-diamond" style={{ background: KIND_COLOR.infeasible }} />Infeasible target</li>
            </ul>
          </section>

          <section className="card layers-card">
            <h2>Layers</h2>
            <div className="layer-buttons">
              {LAYER_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={layers[key]}
                  className={`layer-button ${layers[key] ? 'is-active' : ''}`}
                  onClick={() => setLayers((current) => ({ ...current, [key]: !current[key] }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <section className="card config-card" aria-label="Chart data settings">
        <div className="card-header">
          <div>
            <h2>Chart data</h2>
            <p>Edit the objectives, the candidate solutions and the reference points.</p>
          </div>
        </div>
        <ChartConfigPanel project={project} analysis={analysis} onChange={onChange} />
      </section>

      <section className="concepts" aria-label="How to read the chart">
        {CONCEPTS.map((concept) => (
          <article className="concept-card" key={concept.title}>
            <span className="concept-bar" style={{ background: concept.color }} />
            <h3>{concept.title}</h3>
            <p>{concept.text}</p>
          </article>
        ))}
      </section>

      <footer className="site-footer">
        <span>Pareto Generator</span>
        <a
          href="https://github.com/hifly81/pareto-frontier-gen"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub repository
        </a>
      </footer>
    </div>
  );
}
