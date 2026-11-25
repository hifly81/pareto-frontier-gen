import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import {
  EMPTY_Z_AXIS,
  axisTicks,
  classifyPoint,
  clamp,
  formatValue,
  inRange,
  objectiveArrow,
  safeSpan,
} from '../domain/pareto';
import type { AxisConfig, ParetoProject, PointKind, Probe } from '../domain/pareto';
import type { ParetoChartProps } from './ParetoChart';
import { COLORS, KIND_COLOR } from '../theme';

/** Orbit angles in degrees: X runs right, Y runs up and Z runs back-left by default. */
export interface ChartView {
  yaw: number;
  pitch: number;
}

export const DEFAULT_CHART_VIEW: ChartView = { yaw: 12, pitch: -10 };

const VIEW = { width: 680, height: 660 };
const PLOT = { left: 60, top: 70, width: 560, height: 480 };
const PITCH_LIMIT = 70;
const YAW_SPEED = 0.45;
const PITCH_SPEED = 0.3;

interface ScreenPoint {
  x: number;
  y: number;
}

type CornerKey = 'origin' | 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';

interface Projection {
  basis: { x: ScreenPoint; y: ScreenPoint; z: ScreenPoint };
  scale: number;
  offset: ScreenPoint;
  at: (rx: number, ry: number, rz: number) => ScreenPoint;
  corners: Record<CornerKey, ScreenPoint>;
}

/** Orthographic projection of the unit objective box, auto-fitted to the viewBox. */
function makeProjection(view: ChartView): Projection {
  const yaw = (view.yaw * Math.PI) / 180;
  const pitch = (view.pitch * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const basis = {
    x: { x: cy, y: -sp * sy },
    y: { x: 0, y: -cp },
    z: { x: -sy, y: sp * cy },
  };

  const raw = (rx: number, ry: number, rz: number): ScreenPoint => ({
    x: rx * basis.x.x + rz * basis.z.x,
    y: rx * basis.x.y + ry * basis.y.y + rz * basis.z.y,
  });

  const rawCorners: ScreenPoint[] = [];
  for (const rx of [0, 1]) {
    for (const ry of [0, 1]) {
      for (const rz of [0, 1]) rawCorners.push(raw(rx, ry, rz));
    }
  }
  const minX = Math.min(...rawCorners.map((point) => point.x));
  const maxX = Math.max(...rawCorners.map((point) => point.x));
  const minY = Math.min(...rawCorners.map((point) => point.y));
  const maxY = Math.max(...rawCorners.map((point) => point.y));
  const scale = Math.min(PLOT.width / (maxX - minX), PLOT.height / (maxY - minY));
  const offset = {
    x: PLOT.left + (PLOT.width - (maxX - minX) * scale) / 2 - minX * scale,
    y: PLOT.top + (PLOT.height - (maxY - minY) * scale) / 2 - minY * scale,
  };
  const at = (rx: number, ry: number, rz: number): ScreenPoint => {
    const point = raw(rx, ry, rz);
    return { x: offset.x + point.x * scale, y: offset.y + point.y * scale };
  };
  const corners: Record<CornerKey, ScreenPoint> = {
    origin: at(0, 0, 0),
    x: at(1, 0, 0),
    y: at(0, 1, 0),
    z: at(0, 0, 1),
    xy: at(1, 1, 0),
    xz: at(1, 0, 1),
    yz: at(0, 1, 1),
    xyz: at(1, 1, 1),
  };

  return { basis, scale, offset, at, corners };
}

function short(value: number): string {
  return value.toFixed(2);
}

function pointLabel(point: { x: number; y: number; z: number }): string {
  return `(${formatValue(point.x, 2)}, ${formatValue(point.y, 2)}, ${formatValue(point.z, 2)})`;
}

function probeDigits(project: ParetoProject): number {
  const axes = project.z ? [project.x, project.y, project.z] : [project.x, project.y];
  const step = Math.min(...axes.map((axis) => safeSpan(axis.min, axis.max)));
  return Math.max(0, Math.min(4, Math.ceil(-Math.log10(step / 420))));
}

interface DisplayPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  kind: PointKind | null;
  target: boolean;
}

export function ParetoChart3D({
  project,
  analysis,
  layers,
  selectedId,
  probe,
  view,
  onViewChange,
  onSelectPoint,
  onProbe,
}: ParetoChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    clientX: number;
    clientY: number;
    view: ChartView;
    moved: boolean;
  } | null>(null);
  const skipClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const { x: xAxis, y: yAxis } = project;
  // The dispatcher only mounts this renderer for three-objective projects.
  const zAxis = project.z ?? EMPTY_Z_AXIS;
  const projection = useMemo(() => makeProjection(view), [view]);
  const center = projection.at(0.5, 0.5, 0.5);

  const ratio = (value: number, axis: AxisConfig) =>
    (value - axis.min) / safeSpan(axis.min, axis.max);
  const valueAt = (unit: number, axis: AxisConfig) =>
    axis.min + clamp(unit, 0, 1) * safeSpan(axis.min, axis.max);
  const projectPoint = (x: number, y: number, z: number) =>
    projection.at(ratio(x, xAxis), ratio(y, yAxis), ratio(z, zAxis));

  /** Places a label just outside the rotated box, keeping text readable. */
  function outward(point: ScreenPoint, distance: number) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: point.x + (dx / length) * distance,
      y: point.y + (dy / length) * distance,
      anchor: Math.abs(dx) < 14 ? ('middle' as const) : dx < 0 ? ('end' as const) : ('start' as const),
    };
  }

  const corners = projection.corners;
  const boxEdges: Array<[ScreenPoint, ScreenPoint]> = [
    [corners.origin, corners.x],
    [corners.origin, corners.y],
    [corners.origin, corners.z],
    [corners.x, corners.xy],
    [corners.x, corners.xz],
    [corners.y, corners.xy],
    [corners.y, corners.yz],
    [corners.z, corners.xz],
    [corners.z, corners.yz],
    [corners.xy, corners.xyz],
    [corners.xz, corners.xyz],
    [corners.yz, corners.xyz],
  ];

  const xTicks = axisTicks(xAxis);
  const yTicks = axisTicks(yAxis);
  const zTicks = axisTicks(zAxis);

  const displayPoints: DisplayPoint[] = [
    ...analysis.solutions
      .filter((solution) => inRange(solution, project))
      .map((solution) => ({
        id: solution.id,
        label: solution.label,
        x: solution.x,
        y: solution.y,
        z: solution.z ?? zAxis.min,
        kind: solution.kind,
        target: false,
      })),
    ...analysis.targets
      .filter((target) => inRange(target, project))
      .map((target) => ({
        id: target.id,
        label: target.label,
        x: target.x,
        y: target.y,
        z: target.z ?? zAxis.min,
        kind: target.kind,
        target: true,
      })),
  ].sort((a, b) => ratio(b.z, zAxis) - ratio(a.z, zAxis));

  const optimalById = useMemo(
    () => new Map(analysis.optimal.map((solution) => [solution.id, solution])),
    [analysis.optimal],
  );

  const frontierLines = analysis.edges.flatMap((edge) => {
    const from = optimalById.get(edge.from);
    const to = optimalById.get(edge.to);
    if (!from || !to) return [];
    return [
      {
        id: `${edge.from}-${edge.to}`,
        from: projectPoint(from.x, from.y, from.z ?? zAxis.min),
        to: projectPoint(to.x, to.y, to.z ?? zAxis.min),
      },
    ];
  });

  const midZ = zAxis.min + (zAxis.max - zAxis.min) / 2;
  const digits = probeDigits(project);

  /** Resolves the pointer on the middle-Z plane, or middle-X when Z faces the viewer. */
  function toData(event: MouseEvent<SVGSVGElement>): Probe | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const vx = ((event.clientX - rect.left) / rect.width) * VIEW.width;
    const vy = ((event.clientY - rect.top) / rect.height) * VIEW.height;
    const sx = (vx - projection.offset.x) / projection.scale;
    const sy = (vy - projection.offset.y) / projection.scale;
    const { basis } = projection;

    let rx = 0.5;
    let ry = 0.5;
    let rz = 0.5;
    if (Math.abs(basis.x.x) >= Math.abs(basis.z.x)) {
      rz = 0.5;
      rx = (sx - rz * basis.z.x) / basis.x.x;
      ry = (sy - rx * basis.x.y - rz * basis.z.y) / basis.y.y;
    } else {
      rx = 0.5;
      rz = (sx - rx * basis.x.x) / basis.z.x;
      ry = (sy - rx * basis.x.y - rz * basis.z.y) / basis.y.y;
    }
    if ([rx, ry, rz].some((unit) => unit < -0.05 || unit > 1.05)) return null;

    const round = (value: number) => Number(value.toFixed(digits));
    return {
      x: round(valueAt(rx, xAxis)),
      y: round(valueAt(ry, yAxis)),
      z: round(valueAt(rz, zAxis)),
      pinned: false,
    };
  }

  function handleMouseDown(event: MouseEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    dragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      view,
      moved: false,
    };
    skipClickRef.current = false;
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (drag && (event.buttons & 1) === 1) {
      const dx = event.clientX - drag.clientX;
      const dy = event.clientY - drag.clientY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      skipClickRef.current = true;
      setDragging(true);
      onViewChange({
        yaw: drag.view.yaw + dx * YAW_SPEED,
        pitch: clamp(drag.view.pitch - dy * PITCH_SPEED, -PITCH_LIMIT, PITCH_LIMIT),
      });
      return;
    }
    if (probe?.pinned) return;
    onProbe(toData(event));
  }

  function handleMouseUp() {
    dragRef.current = null;
    setDragging(false);
  }

  function handleMouseLeave() {
    dragRef.current = null;
    skipClickRef.current = false;
    setDragging(false);
    if (!probe?.pinned) onProbe(null);
  }

  function handleClick(event: MouseEvent<SVGSVGElement>) {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    const next = toData(event);
    if (next) onProbe({ ...next, pinned: true });
    else onProbe(null);
  }

  function handlePointClick(event: MouseEvent<SVGGElement>, id: string) {
    event.stopPropagation();
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
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
    const rotation: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    if (event.shiftKey && rotation[event.key]) {
      const [turn, tilt] = rotation[event.key];
      event.preventDefault();
      onViewChange({
        yaw: view.yaw + turn * 10,
        pitch: clamp(view.pitch + tilt * 5, -PITCH_LIMIT, PITCH_LIMIT),
      });
      return;
    }

    const moves: Record<string, [number, number, number]> = {
      ArrowLeft: [-1, 0, 0],
      ArrowRight: [1, 0, 0],
      ArrowUp: [0, 1, 0],
      ArrowDown: [0, -1, 0],
      PageUp: [0, 0, 1],
      PageDown: [0, 0, -1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const round = (value: number) => Number(value.toFixed(digits));
    const base = probe ?? {
      x: (xAxis.min + xAxis.max) / 2,
      y: (yAxis.min + yAxis.max) / 2,
      z: midZ,
      pinned: false,
    };
    onProbe({
      x: round(clamp(base.x + (move[0] * safeSpan(xAxis.min, xAxis.max)) / 50, xAxis.min, xAxis.max)),
      y: round(clamp(base.y + (move[1] * safeSpan(yAxis.min, yAxis.max)) / 50, yAxis.min, yAxis.max)),
      z: round(clamp((base.z ?? midZ) + (move[2] * safeSpan(zAxis.min, zAxis.max)) / 20, zAxis.min, zAxis.max)),
      pinned: true,
    });
  }

  const currentProbe = probe
    ? {
        x: probe.x,
        y: probe.y,
        z: probe.z ?? midZ,
        pinned: probe.pinned,
      }
    : null;
  const probeScreen = currentProbe
    ? projectPoint(currentProbe.x, currentProbe.y, currentProbe.z)
    : null;
  const probeStatus = currentProbe
    ? classifyPoint(
        { id: 'probe', label: 'Probe', x: currentProbe.x, y: currentProbe.y, z: currentProbe.z },
        analysis,
      )
    : null;
  const probeStatusLabel =
    probeStatus === 'optimal' ? 'frontier' : probeStatus === null ? 'unknown' : probeStatus;
  const probeLabelX = probeScreen ? clamp(probeScreen.x + 12, 8, VIEW.width - 168) : 0;
  const probeLabelY = probeScreen ? clamp(probeScreen.y - 34, 8, VIEW.height - 30) : 0;

  const bottomFace = [corners.origin, corners.x, corners.xz, corners.z]
    .map((point) => `${short(point.x)},${short(point.y)}`)
    .join(' ');
  const topFace = [corners.y, corners.xy, corners.xyz, corners.yz]
    .map((point) => `${short(point.x)},${short(point.y)}`)
    .join(' ');

  const axisEnds: Record<'x' | 'y' | 'z', ScreenPoint> = {
    x: corners.x,
    y: corners.y,
    z: corners.z,
  };
  const axisLabel = (key: 'x' | 'y' | 'z') =>
    outward(
      {
        x: (corners.origin.x + axisEnds[key].x) / 2,
        y: (corners.origin.y + axisEnds[key].y) / 2,
      },
      32,
    );
  const xLabel = axisLabel('x');
  const yLabel = axisLabel('y');
  const zLabel = axisLabel('z');

  return (
    <svg
      ref={svgRef}
      className={`pareto-chart pareto-chart--3d ${dragging ? 'is-dragging' : ''}`}
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      role="group"
      tabIndex={0}
      aria-label={`Pareto frontier chart in three dimensions. ${xAxis.label} ${objectiveArrow(xAxis.direction)}, ${yAxis.label} ${objectiveArrow(yAxis.direction)}, ${zAxis.label} ${objectiveArrow(zAxis.direction)}. Drag the chart to rotate it, or focus it and use Shift with the arrow keys. Left and Right arrows move X, Up and Down arrows move Y, Page Up and Page Down move Z. The mouse probes X and Y on the middle-Z plane. Tab to focus points.`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onKeyDown={handleChartKeyDown}
    >
      <title>Three-dimensional Pareto frontier computed from candidate solutions</title>
      <desc>
        Frontier based on {analysis.solutions.length} candidate solutions and{' '}
        {analysis.targets.length} reference points across three objectives. Drag to rotate the chart.
      </desc>
      <defs>
        <linearGradient id="fill3Feasible" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={COLORS.teal} stopOpacity="0.04" />
          <stop offset="100%" stopColor={COLORS.teal} stopOpacity="0.16" />
        </linearGradient>
        <pattern
          id="hatch3Infeasible"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="10" stroke={COLORS.rose} strokeOpacity="0.16" strokeWidth="1.5" />
        </pattern>
      </defs>

      {layers.regions && (
        <g aria-hidden="true">
          <polygon points={bottomFace} fill="url(#fill3Feasible)" />
          <polygon points={topFace} fill="url(#hatch3Infeasible)" />
          <text
            x={(corners.origin.x + corners.xz.x) / 2}
            y={(corners.origin.y + corners.xz.y) / 2 + 26}
            textAnchor="middle"
            className="region-label region-label--feasible"
          >
            FEASIBLE VOLUME
          </text>
          <text
            x={(corners.y.x + corners.xyz.x) / 2}
            y={(corners.y.y + corners.xyz.y) / 2 - 10}
            textAnchor="middle"
            className="region-label region-label--infeasible"
          >
            BEYOND THE FRONTIER
          </text>
        </g>
      )}

      {layers.grid && (
        <g className="chart-grid" aria-hidden="true">
          {xTicks.map((tick) => {
            const from = projectPoint(tick, yAxis.min, zAxis.min);
            const to = projectPoint(tick, yAxis.min, zAxis.max);
            return (
              <line
                key={`floor-x-${tick}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={COLORS.grid}
                strokeWidth="1"
              />
            );
          })}
          {zTicks.map((tick) => {
            const from = projectPoint(xAxis.min, yAxis.min, tick);
            const to = projectPoint(xAxis.max, yAxis.min, tick);
            return (
              <line
                key={`floor-z-${tick}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={COLORS.grid}
                strokeWidth="1"
              />
            );
          })}
          {yTicks.map((tick) => {
            const from = projectPoint(xAxis.min, tick, zAxis.min);
            const to = projectPoint(xAxis.min, tick, zAxis.max);
            return (
              <line
                key={`wall-y-${tick}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={COLORS.grid}
                strokeWidth="1"
              />
            );
          })}
        </g>
      )}

      <g className="chart-axes" aria-hidden="true">
        {boxEdges.map(([from, to], index) => (
          <line
            key={`box-${index}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={COLORS.axis}
            strokeOpacity={index < 3 ? 1 : 0.4}
            strokeWidth={index < 3 ? 1.8 : 1}
          />
        ))}
        {xTicks.map((tick) => {
          const point = projectPoint(tick, yAxis.min, zAxis.min);
          const label = outward(point, 18);
          return (
            <text key={`label-x-${tick}`} x={label.x} y={label.y} textAnchor={label.anchor} className="tick-label">
              {formatValue(tick, 2)}
            </text>
          );
        })}
        {yTicks.map((tick) => {
          const point = projectPoint(xAxis.min, tick, zAxis.min);
          const label = outward(point, 18);
          return (
            <text key={`label-y-${tick}`} x={label.x} y={label.y} textAnchor={label.anchor} className="tick-label">
              {formatValue(tick, 2)}
            </text>
          );
        })}
        {zTicks.map((tick) => {
          const point = projectPoint(xAxis.min, yAxis.min, tick);
          const label = outward(point, 18);
          return (
            <text key={`label-z-${tick}`} x={label.x} y={label.y} textAnchor={label.anchor} className="tick-label">
              {formatValue(tick, 2)}
            </text>
          );
        })}
        <text x={xLabel.x} y={xLabel.y} textAnchor={xLabel.anchor} className="axis-label">
          {xAxis.label || 'X axis'} {objectiveArrow(xAxis.direction)}
        </text>
        <text x={yLabel.x} y={yLabel.y} textAnchor={yLabel.anchor} className="axis-label">
          {yAxis.label || 'Y axis'} {objectiveArrow(yAxis.direction)}
        </text>
        <text x={zLabel.x} y={zLabel.y} textAnchor={zLabel.anchor} className="axis-label">
          {zAxis.label || 'Z axis'} {objectiveArrow(zAxis.direction)}
        </text>
      </g>

      {analysis.solutions.length === 0 && (
        <text x={VIEW.width / 2} y={VIEW.height / 2} textAnchor="middle" className="chart-empty">
          Add a candidate solution to compute a frontier
        </text>
      )}

      {layers.frontier && frontierLines.length > 0 && (
        <g aria-hidden="true">
          {frontierLines.map((line) => (
            <g key={line.id}>
              <line
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                stroke={COLORS.indigo}
                strokeOpacity="0.14"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <line
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                stroke={COLORS.indigo}
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          ))}
          <text
            x={(corners.y.x + corners.xyz.x) / 2}
            y={(corners.y.y + corners.xyz.y) / 2 + 20}
            textAnchor="middle"
            className="frontier-label"
          >
            PARETO FRONTIER
          </text>
        </g>
      )}

      {layers.points && (
        <g>
          {displayPoints.map((point) => {
            const color = colorFor(point.kind);
            const position = projectPoint(point.x, point.y, point.z);
            const active = selectedId === point.id;
            const anchor = position.x > VIEW.width * 0.65 ? 'end' : 'start';
            const dx = anchor === 'end' ? -12 : 12;
            return (
              <g
                key={point.id}
                className="chart-point"
                role="button"
                tabIndex={0}
                aria-label={`${point.label}: ${xAxis.label} ${formatValue(point.x)}, ${yAxis.label} ${formatValue(point.y)}, ${zAxis.label} ${formatValue(point.z)}`}
                onClick={(event) => handlePointClick(event, point.id)}
                onKeyDown={(event) => handlePointKeyDown(event, point.id)}
              >
                <circle cx={position.x} cy={position.y} r={active ? 15 : 11} fill={color} fillOpacity="0.14" />
                {active && (
                  <circle cx={position.x} cy={position.y} r="19" fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1.5" />
                )}
                {point.target ? (
                  <rect
                    x={position.x - 6}
                    y={position.y - 6}
                    width="12"
                    height="12"
                    transform={`rotate(45 ${position.x} ${position.y})`}
                    fill={color}
                    stroke={COLORS.surface}
                    strokeWidth="2"
                  />
                ) : (
                  <circle cx={position.x} cy={position.y} r="6.5" fill={color} stroke={COLORS.surface} strokeWidth="2" />
                )}
                <text
                  x={position.x + dx}
                  y={position.y - 10}
                  textAnchor={anchor}
                  className="point-label"
                  style={{ fill: color }}
                >
                  {point.label}
                  <tspan dx="6" className="point-coords">
                    {pointLabel(point)}
                  </tspan>
                </text>
              </g>
            );
          })}
        </g>
      )}

      {currentProbe && probeScreen && (
        <g aria-hidden="true">
          <line
            x1={probeScreen.x}
            y1={probeScreen.y}
            x2={projectPoint(currentProbe.x, yAxis.min, currentProbe.z).x}
            y2={projectPoint(currentProbe.x, yAxis.min, currentProbe.z).y}
            stroke={COLORS.muted}
            strokeDasharray="3 4"
            strokeOpacity="0.7"
          />
          <line
            x1={probeScreen.x}
            y1={probeScreen.y}
            x2={projectPoint(xAxis.min, currentProbe.y, currentProbe.z).x}
            y2={projectPoint(xAxis.min, currentProbe.y, currentProbe.z).y}
            stroke={COLORS.muted}
            strokeDasharray="3 4"
            strokeOpacity="0.7"
          />
          <line
            x1={probeScreen.x}
            y1={probeScreen.y}
            x2={projectPoint(currentProbe.x, currentProbe.y, zAxis.min).x}
            y2={projectPoint(currentProbe.x, currentProbe.y, zAxis.min).y}
            stroke={COLORS.muted}
            strokeDasharray="3 4"
            strokeOpacity="0.7"
          />
          <circle cx={probeScreen.x} cy={probeScreen.y} r="5" fill={COLORS.surface} stroke={COLORS.ink} strokeWidth="2" />
          <rect x={probeLabelX} y={probeLabelY} width="158" height="23" rx="7" fill={COLORS.ink} />
          <text x={probeLabelX + 8} y={probeLabelY + 15} className="probe-label">
            {formatValue(currentProbe.x, 2)}, {formatValue(currentProbe.y, 2)},{' '}
            {formatValue(currentProbe.z, 2)} · {probeStatusLabel}
          </text>
        </g>
      )}
    </svg>
  );
}

function colorFor(kind: PointKind | null): string {
  return kind ? KIND_COLOR[kind] : COLORS.muted;
}
