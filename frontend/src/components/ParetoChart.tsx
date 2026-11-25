import { useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import {
  axisTicks,
  ceilingAt,
  classify,
  clamp,
  formatValue,
  frontierAdvantage,
  inRange,
  objectiveArrow,
  safeSpan,
} from '../domain/pareto';
import type {
  AxisConfig,
  FrontierAnalysis,
  Layers,
  ParetoProject,
  PointKind,
  Probe,
} from '../domain/pareto';
import { COLORS, KIND_COLOR } from '../theme';
import { ParetoChart3D } from './ParetoChart3D';
import type { ChartView } from './ParetoChart3D';

const VIEW = { width: 680, height: 660, left: 80, top: 60, size: 520 };
const RIGHT = VIEW.left + VIEW.size;
const BOTTOM = VIEW.top + VIEW.size;

const px = (x: number, axis: AxisConfig) =>
  VIEW.left + ((x - axis.min) / safeSpan(axis.min, axis.max)) * VIEW.size;
const py = (y: number, axis: AxisConfig) =>
  BOTTOM - ((y - axis.min) / safeSpan(axis.min, axis.max)) * VIEW.size;

const colorFor = (kind: PointKind | null) => (kind ? KIND_COLOR[kind] : COLORS.muted);

function probeDigits(project: ParetoProject): number {
  const step = Math.min(safeSpan(project.x.min, project.x.max), safeSpan(project.y.min, project.y.max));
  return Math.max(0, Math.min(4, Math.ceil(-Math.log10(step / VIEW.size))));
}

interface DisplayPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: PointKind | null;
  target: boolean;
}

interface LabelPosition {
  dx: number;
  dy: number;
  anchor: 'start' | 'end';
}

function labelPosition(point: DisplayPoint, project: ParetoProject): LabelPosition {
  const xRatio = (point.x - project.x.min) / safeSpan(project.x.min, project.x.max);
  const yRatio = (point.y - project.y.min) / safeSpan(project.y.min, project.y.max);
  if (xRatio > 0.75) return { dx: -14, dy: -12, anchor: 'end' };
  if (yRatio > 0.85) return { dx: 14, dy: 24, anchor: 'start' };
  return { dx: 14, dy: 22, anchor: 'start' };
}

export interface ParetoChartProps {
  project: ParetoProject;
  analysis: FrontierAnalysis;
  layers: Layers;
  selectedId: string | null;
  probe: Probe | null;
  view: ChartView;
  onViewChange: (view: ChartView) => void;
  onSelectPoint: (id: string) => void;
  onProbe: (probe: Probe | null) => void;
}

function ParetoChart2D({
  project,
  analysis,
  layers,
  selectedId,
  probe,
  onSelectPoint,
  onProbe,
}: ParetoChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { x: xAxis, y: yAxis } = project;

  const xTicks = axisTicks(xAxis);
  const yTicks = axisTicks(yAxis);

  const displayPoints: DisplayPoint[] = [
    ...analysis.solutions
      .filter((solution) => inRange(solution, project))
      .map((solution) => ({ ...solution, target: false })),
    ...analysis.targets
      .filter((target) => inRange(target, project))
      .map((target) => ({ ...target, target: true })),
  ];

  const vertices = useMemo(
    () =>
      analysis.path.map(
        (point) => [px(point.x, xAxis), py(point.y, yAxis)] as const,
      ),
    [analysis.path, xAxis.min, xAxis.max, yAxis.min, yAxis.max],
  );

  const paths = useMemo(() => {
    if (vertices.length === 0) return { curve: '', feasible: '', infeasible: '' };
    const line = (point: readonly [number, number]) => `L ${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
    const curve = vertices
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
      .join(' ');
    const first = analysis.path[0];
    const last = analysis.path[analysis.path.length - 1];
    const below = `M ${VIEW.left} ${BOTTOM} L ${VIEW.left} ${py(first.y, yAxis)} ${vertices.map(line).join(' ')} L ${RIGHT} ${BOTTOM} Z`;
    const above = `M ${VIEW.left} ${VIEW.top} L ${RIGHT} ${VIEW.top} L ${RIGHT} ${py(last.y, yAxis)} ${[...vertices].reverse().map(line).join(' ')} Z`;
    const yPrefersHigher = yAxis.direction === 'maximize';
    return {
      curve,
      feasible: yPrefersHigher ? below : above,
      infeasible: yPrefersHigher ? above : below,
    };
  }, [vertices, analysis.path, yAxis.min, yAxis.max, yAxis.direction]);

  function toData(event: MouseEvent<SVGSVGElement>): Probe | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const vx = ((event.clientX - rect.left) / rect.width) * VIEW.width;
    const vy = ((event.clientY - rect.top) / rect.height) * VIEW.height;
    if (vx < VIEW.left || vx > RIGHT || vy < VIEW.top || vy > BOTTOM) return null;
    const x = xAxis.min + ((vx - VIEW.left) / VIEW.size) * safeSpan(xAxis.min, xAxis.max);
    const y = yAxis.min + ((BOTTOM - vy) / VIEW.size) * safeSpan(yAxis.min, yAxis.max);
    const digits = probeDigits(project);
    const round = (value: number) => Number(value.toFixed(digits));
    return { x: round(x), y: round(y), pinned: false };
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>) {
    if (probe?.pinned) return;
    onProbe(toData(event));
  }

  function handleClick(event: MouseEvent<SVGSVGElement>) {
    const next = toData(event);
    if (next) onProbe({ ...next, pinned: true });
    else onProbe(null);
  }

  function handlePointClick(event: MouseEvent<SVGGElement>, id: string) {
    event.stopPropagation();
    onSelectPoint(id);
  }

  function handlePointKeyDown(event: KeyboardEvent<SVGGElement>, id: string) {
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectPoint(id);
    }
  }

  function handleChartKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const moves: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const digits = probeDigits(project);
    const stepX = safeSpan(xAxis.min, xAxis.max) / 50;
    const stepY = safeSpan(yAxis.min, yAxis.max) / 50;
    const base = probe ?? {
      x: xAxis.min + safeSpan(xAxis.min, xAxis.max) / 2,
      y: yAxis.min + safeSpan(yAxis.min, yAxis.max) / 2,
      pinned: false,
    };
    const round = (value: number) => Number(value.toFixed(digits));
    onProbe({
      x: round(clamp(base.x + move[0] * stepX, xAxis.min, xAxis.max)),
      y: round(clamp(base.y + move[1] * stepY, yAxis.min, yAxis.max)),
      pinned: true,
    });
  }

  const hasFrontier = vertices.length > 0;
  const probeLabelX = probe ? clamp(px(probe.x, xAxis) + 12, VIEW.left, RIGHT - 158) : 0;
  const probeLabelY = probe ? clamp(py(probe.y, yAxis) - 34, VIEW.top, BOTTOM - 24) : 0;
  const probeStatus = probe ? classify(probe.x, probe.y, analysis) : null;
  const probeStatusLabel =
    probeStatus === 'optimal' ? 'frontier' : probeStatus === null ? 'unknown' : probeStatus;
  const labelVertex = vertices[Math.floor(vertices.length / 2)];

  return (
    <svg
      ref={svgRef}
      className="pareto-chart"
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      role="group"
      tabIndex={0}
      aria-label={`Pareto frontier chart. ${xAxis.label} ${objectiveArrow(xAxis.direction)}, ${yAxis.label} ${objectiveArrow(yAxis.direction)}. Use arrow keys to probe, Tab to focus points.`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => !probe?.pinned && onProbe(null)}
      onClick={handleClick}
      onKeyDown={handleChartKeyDown}
    >
      <title>Pareto frontier computed from candidate solutions</title>
      <desc>
        Frontier based on {analysis.solutions.length} candidate solutions and{' '}
        {analysis.targets.length} reference points.
      </desc>
      <defs>
        <linearGradient id="feasibleFill" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={COLORS.teal} stopOpacity="0.03" />
          <stop offset="100%" stopColor={COLORS.teal} stopOpacity="0.17" />
        </linearGradient>
        <pattern
          id="infeasibleHatch"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="10" stroke={COLORS.rose} strokeOpacity="0.16" strokeWidth="1.5" />
        </pattern>
        <marker
          id="dominanceArrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.amber} />
        </marker>
      </defs>

      {layers.grid && (
        <g className="chart-grid" aria-hidden="true">
          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              {tick !== xAxis.min && (
                <line x1={px(tick, xAxis)} y1={VIEW.top} x2={px(tick, xAxis)} y2={BOTTOM} stroke={COLORS.grid} strokeWidth="1" />
              )}
              <text x={px(tick, xAxis)} y={BOTTOM + 22} textAnchor="middle" className="tick-label">
                {formatValue(tick, 2)}
              </text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              {tick !== yAxis.min && (
                <line x1={VIEW.left} y1={py(tick, yAxis)} x2={RIGHT} y2={py(tick, yAxis)} stroke={COLORS.grid} strokeWidth="1" />
              )}
              <text x={VIEW.left - 14} y={py(tick, yAxis) + 4} textAnchor="end" className="tick-label">
                {formatValue(tick, 2)}
              </text>
            </g>
          ))}
        </g>
      )}

      {layers.regions && hasFrontier && (
        <g aria-hidden="true">
          <path d={paths.feasible} fill="url(#feasibleFill)" />
          <path d={paths.infeasible} fill="url(#infeasibleHatch)" />
          <text
            x={px(xAxis.min + safeSpan(xAxis.min, xAxis.max) * 0.24, xAxis)}
            y={py(
              yAxis.min +
                safeSpan(yAxis.min, yAxis.max) * (yAxis.direction === 'maximize' ? 0.18 : 0.82),
              yAxis,
            )}
            className="region-label region-label--feasible"
          >
            FEASIBLE REGION
          </text>
          <text
            x={px(xAxis.min + safeSpan(xAxis.min, xAxis.max) * 0.62, xAxis)}
            y={py(
              yAxis.min +
                safeSpan(yAxis.min, yAxis.max) * (yAxis.direction === 'maximize' ? 0.92 : 0.08),
              yAxis,
            )}
            className="region-label region-label--infeasible"
          >
            INFEASIBLE REGION
          </text>
        </g>
      )}

      <g className="chart-axes" aria-hidden="true">
        <line x1={VIEW.left} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} stroke={COLORS.axis} strokeWidth="1.5" />
        <line x1={VIEW.left} y1={VIEW.top} x2={VIEW.left} y2={BOTTOM} stroke={COLORS.axis} strokeWidth="1.5" />
        <text x={VIEW.left + VIEW.size / 2} y={BOTTOM + 48} textAnchor="middle" className="axis-label">
          {xAxis.label || 'X axis'} {objectiveArrow(xAxis.direction)}
        </text>
        <text
          transform={`translate(${VIEW.left - 52}, ${VIEW.top + VIEW.size / 2}) rotate(-90)`}
          textAnchor="middle"
          className="axis-label"
        >
          {yAxis.label || 'Y axis'} {objectiveArrow(yAxis.direction)}
        </text>
      </g>

      {!hasFrontier && (
        <text x={VIEW.left + VIEW.size / 2} y={VIEW.top + VIEW.size / 2} textAnchor="middle" className="chart-empty">
          Add a candidate solution to compute a frontier
        </text>
      )}

      {layers.frontier && hasFrontier && (
        <g aria-hidden="true">
          <path d={paths.curve} fill="none" stroke={COLORS.indigo} strokeOpacity="0.12" strokeWidth="12" strokeLinecap="round" />
          <path d={paths.curve} fill="none" stroke={COLORS.indigo} strokeWidth="3" strokeLinecap="round" />
          {labelVertex && (
            <text x={labelVertex[0]} y={labelVertex[1] - 16} textAnchor="middle" className="frontier-label">
              PARETO FRONTIER
            </text>
          )}
        </g>
      )}

      {layers.annotations && layers.points && (
        <g aria-hidden="true">
          {analysis.dominated.map((solution) => {
            if (!inRange(solution, project)) return null;
            const better = analysis.solutions.find((candidate) => candidate.id === solution.dominatedBy);
            if (!better || !inRange(better, project)) return null;
            const ceiling = ceilingAt(solution.x, analysis.path) ?? solution.y;
            const guideTop = py(ceiling, yAxis);
            const midX = (px(solution.x, xAxis) + px(better.x, xAxis)) / 2;
            const midY = (py(solution.y, yAxis) + py(better.y, yAxis)) / 2;
            const labelX = clamp(midX + 8, VIEW.left, RIGHT - 80);
            const labelY = clamp(midY - 16, VIEW.top, BOTTOM - 20);
            return (
              <g key={`annotation-${solution.id}`}>
                <line
                  x1={px(solution.x, xAxis)}
                  y1={py(solution.y, yAxis)}
                  x2={px(solution.x, xAxis)}
                  y2={guideTop}
                  stroke={COLORS.teal}
                  strokeOpacity="0.65"
                  strokeWidth="1.5"
                  strokeDasharray="3 4"
                />
                <text x={px(solution.x, xAxis) + 6} y={guideTop + 4} className="annotation-label">
                  best {formatValue(ceiling, 2)}
                </text>
                <line
                  x1={px(solution.x, xAxis)}
                  y1={py(solution.y, yAxis)}
                  x2={px(better.x, xAxis)}
                  y2={py(better.y, yAxis)}
                  stroke={COLORS.amber}
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  markerEnd="url(#dominanceArrow)"
                />
                <rect x={labelX} y={labelY} width="76" height="19" rx="6" fill={COLORS.surface} fillOpacity="0.92" />
                <text x={labelX + 6} y={labelY + 13} className="annotation-label annotation-label--amber">
                  dominates
                </text>
              </g>
            );
          })}

          {analysis.targets.map((target) => {
            if (target.kind !== 'infeasible' || target.ceiling === null || !inRange(target, project)) {
              return null;
            }
            const top = py(target.y, yAxis);
            const frontier = py(target.ceiling, yAxis);
            const advantage = frontierAdvantage(target.y, target.ceiling, yAxis.direction);
            return (
              <g key={`target-annotation-${target.id}`}>
                <line
                  x1={px(target.x, xAxis)}
                  y1={top}
                  x2={px(target.x, xAxis)}
                  y2={frontier}
                  stroke={COLORS.rose}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={clamp(px(target.x, xAxis) + 6, VIEW.left, RIGHT - 120)}
                  y={clamp((top + frontier) / 2, VIEW.top + 12, BOTTOM - 8)}
                  className="annotation-label annotation-label--rose"
                >
                  {formatValue(Math.abs(advantage), 2)} beyond
                </text>
              </g>
            );
          })}
        </g>
      )}

      {layers.points && (
        <g>
          {displayPoints.map((point) => {
            const color = colorFor(point.kind);
            const position = labelPosition(point, project);
            const active = selectedId === point.id;
            const cx = px(point.x, xAxis);
            const cy = py(point.y, yAxis);
            return (
              <g
                key={point.id}
                className="chart-point"
                role="button"
                tabIndex={0}
                aria-label={`${point.label}: ${xAxis.label} ${formatValue(point.x)}, ${yAxis.label} ${formatValue(point.y)}`}
                onClick={(event) => handlePointClick(event, point.id)}
                onKeyDown={(event) => handlePointKeyDown(event, point.id)}
              >
                <circle cx={cx} cy={cy} r={active ? 15 : 11} fill={color} fillOpacity="0.14" />
                {active && (
                  <circle cx={cx} cy={cy} r="19" fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1.5" />
                )}
                {point.target ? (
                  <rect
                    x={cx - 6}
                    y={cy - 6}
                    width="12"
                    height="12"
                    transform={`rotate(45 ${cx} ${cy})`}
                    fill={color}
                    stroke={COLORS.surface}
                    strokeWidth="2"
                  />
                ) : (
                  <circle cx={cx} cy={cy} r="6.5" fill={color} stroke={COLORS.surface} strokeWidth="2" />
                )}
                <text
                  x={cx + position.dx}
                  y={cy + position.dy}
                  textAnchor={position.anchor}
                  className="point-label"
                  style={{ fill: color }}
                >
                  {point.label}
                  <tspan dx="6" className="point-coords">
                    ({formatValue(point.x, 2)}, {formatValue(point.y, 2)})
                  </tspan>
                </text>
              </g>
            );
          })}
        </g>
      )}

      {probe && (
        <g aria-hidden="true">
          <line x1={px(probe.x, xAxis)} y1={BOTTOM} x2={px(probe.x, xAxis)} y2={py(probe.y, yAxis)} stroke={COLORS.muted} strokeDasharray="3 4" strokeOpacity="0.7" />
          <line x1={VIEW.left} y1={py(probe.y, yAxis)} x2={px(probe.x, xAxis)} y2={py(probe.y, yAxis)} stroke={COLORS.muted} strokeDasharray="3 4" strokeOpacity="0.7" />
          <circle cx={px(probe.x, xAxis)} cy={py(probe.y, yAxis)} r="5" fill={COLORS.surface} stroke={COLORS.ink} strokeWidth="2" />
          <rect x={probeLabelX} y={probeLabelY} width="150" height="23" rx="7" fill={COLORS.ink} />
          <text x={probeLabelX + 8} y={probeLabelY + 15} className="probe-label">
            {formatValue(probe.x, 2)}, {formatValue(probe.y, 2)} · {probeStatusLabel}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Selects the flat renderer for two objectives and the isometric renderer for three. */
export function ParetoChart(props: ParetoChartProps) {
  return props.project.z ? <ParetoChart3D {...props} /> : <ParetoChart2D {...props} />;
}
