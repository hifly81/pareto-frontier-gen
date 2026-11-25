import { describe, expect, it } from 'vitest';
import {
  classify,
  classifyPoint,
  dominates,
  EMPTY_PROJECT,
  evaluateProject,
  inRange,
  isObjectiveDirection,
  normalizeProject,
  setObjectiveCount,
  validationMessages,
} from './pareto';
import type { ParetoProject } from './pareto';
import { TEMPLATES } from './templates';

const directions = {
  bothMax: { x: 'maximize', y: 'maximize' },
  minMax: { x: 'minimize', y: 'maximize' },
  maxMin: { x: 'maximize', y: 'minimize' },
  bothMin: { x: 'minimize', y: 'minimize' },
} as const;

function withCandidates(candidates: ParetoProject['candidates']): ParetoProject {
  return { ...EMPTY_PROJECT, candidates };
}

describe('dominates', () => {
  it('uses greater-or-equal on both axes when both are maximized', () => {
    expect(dominates({ x: 60, y: 80 }, { x: 50, y: 80 }, directions.bothMax)).toBe(true);
    expect(dominates({ x: 50, y: 70 }, { x: 60, y: 80 }, directions.bothMax)).toBe(false);
    expect(dominates({ x: 50, y: 80 }, { x: 50, y: 80 }, directions.bothMax)).toBe(false);
  });

  it('reverses the X comparison when cost is minimized', () => {
    expect(dominates({ x: 2, y: 80 }, { x: 5, y: 80 }, directions.minMax)).toBe(true);
    expect(dominates({ x: 5, y: 80 }, { x: 2, y: 80 }, directions.minMax)).toBe(false);
    expect(dominates({ x: 2, y: 70 }, { x: 5, y: 80 }, directions.minMax)).toBe(false);
  });

  it('reverses the Y comparison when cost is the second objective', () => {
    expect(dominates({ x: 80, y: 2 }, { x: 60, y: 5 }, directions.maxMin)).toBe(true);
    expect(dominates({ x: 80, y: 5 }, { x: 60, y: 2 }, directions.maxMin)).toBe(false);
  });

  it('reverses both comparisons when both objectives are minimized', () => {
    expect(dominates({ x: 2, y: 2 }, { x: 5, y: 5 }, directions.bothMin)).toBe(true);
    expect(dominates({ x: 2, y: 5 }, { x: 5, y: 2 }, directions.bothMin)).toBe(false);
  });
});

describe('evaluateProject', () => {
  it('computes a constant frontier for a single candidate', () => {
    const analysis = evaluateProject(withCandidates([{ id: 'a', label: 'A', x: 40, y: 60 }]));
    expect(analysis.path).toEqual([
      { x: 0, y: 60 },
      { x: 40, y: 60 },
      { x: 100, y: 60 },
    ]);
    expect(analysis.optimal.map((point) => point.id)).toEqual(['a']);
    expect(classify(80, 60, analysis)).toBe('optimal');
  });

  it('returns no frontier without candidates', () => {
    const analysis = evaluateProject(EMPTY_PROJECT);
    expect(analysis.path).toEqual([]);
    expect(classify(50, 50, analysis)).toBeNull();
  });

  it('collapses identical coordinates into one frontier vertex', () => {
    const analysis = evaluateProject(
      withCandidates([
        { id: 'a', label: 'A', x: 0, y: 100 },
        { id: 'b', label: 'B', x: 100, y: 0 },
        { id: 'c', label: 'C', x: 0, y: 100 },
        { id: 'd', label: 'D', x: 100, y: 0 },
      ]),
    );
    expect(analysis.optimal).toHaveLength(4);
    expect(analysis.path).toEqual([
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ]);
  });

  it('ignores candidates outside the axis range so the path cannot fold back', () => {
    const analysis = evaluateProject(
      withCandidates([
        { id: 'visible', label: 'Visible', x: 50, y: 50 },
        { id: 'outside', label: 'Outside', x: 150, y: 100 },
      ]),
    );
    expect(analysis.solutions.map((point) => point.id)).toEqual(['visible']);
    expect(analysis.path).toEqual([
      { x: 0, y: 50 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ]);
  });

  it('classifies targets with the configured Y tolerance', () => {
    const project: ParetoProject = {
      ...withCandidates([{ id: 'a', label: 'A', x: 0, y: 60 }]),
      targets: [
        { id: 'on', label: 'On', x: 50, y: 61 },
        { id: 'over', label: 'Over', x: 50, y: 61.1 },
        { id: 'under', label: 'Under', x: 50, y: 58.5 },
      ],
    };
    const analysis = evaluateProject(project);
    expect(analysis.tolerance).toBe(1);
    expect(analysis.targets.map((target) => target.kind)).toEqual(['optimal', 'infeasible', 'dominated']);
  });

  it('flags a low-cost, high-accuracy LLM target as infeasible', () => {
    const llm = TEMPLATES.find((template) => template.id === 'llm-models');
    expect(llm).toBeDefined();
    const analysis = evaluateProject(llm!.project);
    expect(analysis.directions).toEqual(directions.minMax);
    expect(analysis.optimal.map((point) => point.id)).toEqual([
      'llm-nano',
      'llm-small',
      'llm-mid',
      'llm-large',
      'llm-flagship',
    ]);
    expect(analysis.dominated.map((point) => point.id)).toEqual([
      'llm-old-nano',
      'llm-bulky-mid',
      'llm-premium-clone',
    ]);
    expect(analysis.targets.map((target) => target.kind)).toEqual(['infeasible', 'dominated']);
    expect(analysis.path.map((point) => point.y)).toEqual([61, 61, 72, 82, 89, 94, 94]);
  });

  it('treats a lower value as better when the Y objective is minimized', () => {
    const project: ParetoProject = {
      ...withCandidates([
        { id: 'a', label: 'A', x: 20, y: 20 },
        { id: 'b', label: 'B', x: 80, y: 80 },
      ]),
      y: { ...EMPTY_PROJECT.y, direction: 'minimize' },
      targets: [{ id: 't', label: 'T', x: 50, y: 40 }],
    };
    const analysis = evaluateProject(project);
    expect(analysis.targets[0].ceiling).toBe(50);
    expect(analysis.targets[0].kind).toBe('infeasible');
    expect(classify(50, 60, analysis)).toBe('dominated');
  });
});

describe('normalizeProject', () => {
  it('rejects projects without usable axes', () => {
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject({ ...EMPTY_PROJECT, x: { min: 10, max: 10 } })).toBeNull();
  });

  it('defaults missing directions, clamps coordinates and deduplicates ids', () => {
    const normalized = normalizeProject({
      title: 'Imported',
      summary: '',
      x: { label: 'Cost', min: 0, max: 10, ticks: [-1, 5, 20] },
      y: { label: 'Quality', min: 0, max: 100, ticks: [0, 100] },
      candidates: [
        { id: 'a', label: 'A', x: -5, y: 200 },
        { id: 'a', label: 'A2', x: 4, y: 40 },
        { id: 'bad', label: 'Bad', x: 'nope', y: 10 },
      ],
      targets: [{ id: 'a', label: 'T', x: 5, y: 50 }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.x.direction).toBe('maximize');
    expect(normalized!.x.ticks).toEqual([5]);
    expect(normalized!.candidates).toEqual([
      { id: 'a', label: 'A', x: 0, y: 100 },
      { id: 'a-2', label: 'A2', x: 4, y: 40 },
    ]);
    expect(normalized!.targets.map((target) => target.id)).toEqual(['a-3']);
  });
});

describe('validationMessages', () => {
  it('requires a title, named axes, valid ranges and at least one candidate', () => {
    const project: ParetoProject = {
      ...EMPTY_PROJECT,
      title: '',
      x: { ...EMPTY_PROJECT.x, label: '' },
      candidates: [],
    };
    const messages = validationMessages(project);
    expect(messages).toContain('Give the project a title.');
    expect(messages).toContain('Name the X axis.');
    expect(messages).toContain('Add at least one candidate solution.');
  });

  it('warns about out-of-range points', () => {
    const messages = validationMessages(
      withCandidates([{ id: 'a', label: 'A', x: 120, y: 50 }]),
    );
    expect(messages).toContain('Every point must lie inside the axis ranges.');
  });
});

describe('three objectives', () => {
  const threeD = (): ParetoProject => ({
    ...EMPTY_PROJECT,
    z: { ...EMPTY_PROJECT.x, label: 'Quality', direction: 'maximize' },
    candidates: [
      { id: 'low', label: 'Low', x: 20, y: 90, z: 20 },
      { id: 'mid', label: 'Mid', x: 50, y: 10, z: 50 },
      { id: 'high', label: 'High', x: 80, y: 20, z: 80 },
      { id: 'bad', label: 'Bad', x: 10, y: 10, z: 10 },
    ],
    targets: [
      { id: 'beyond', label: 'Beyond', x: 90, y: 95, z: 90 },
      { id: 'balanced', label: 'Balanced', x: 10, y: 95, z: 10 },
      { id: 'gap', label: 'Gap', x: 60, y: 15, z: 60 },
    ],
  });

  it('compares all three objectives with their own directions', () => {
    const mixed = { x: 'minimize', y: 'maximize', z: 'minimize' } as const;
    expect(dominates({ x: 2, y: 80, z: 3 }, { x: 5, y: 70, z: 4 }, mixed)).toBe(true);
    expect(dominates({ x: 2, y: 80, z: 5 }, { x: 5, y: 70, z: 4 }, mixed)).toBe(false);
    expect(dominates({ x: 20, y: 20, z: 20 }, { x: 10, y: 10, z: 10 })).toBe(true);
  });

  it('builds a 3D frontier skeleton instead of a flat path', () => {
    const analysis = evaluateProject(threeD());
    expect(analysis.dimensions).toBe(3);
    expect(analysis.path).toEqual([]);
    expect(analysis.directions).toEqual({ x: 'maximize', y: 'maximize', z: 'maximize' });
    expect(analysis.optimal.map((point) => point.id)).toEqual(['low', 'high']);
    expect(analysis.dominated.map((point) => point.id)).toEqual(['mid', 'bad']);
    expect(analysis.edges).toHaveLength(1);
    expect([analysis.edges[0].from, analysis.edges[0].to].sort()).toEqual(['high', 'low']);
  });

  it('classifies arbitrary points against the three-objective set', () => {
    const analysis = evaluateProject(threeD());
    expect(classifyPoint({ id: 'a', label: 'A', x: 90, y: 95, z: 90 }, analysis)).toBe('infeasible');
    expect(classifyPoint({ id: 'b', label: 'B', x: 10, y: 95, z: 10 }, analysis)).toBe('optimal');
    expect(classifyPoint({ id: 'c', label: 'C', x: 60, y: 15, z: 60 }, analysis)).toBe('dominated');
    expect(analysis.targets.map((target) => target.kind)).toEqual(['infeasible', 'optimal', 'dominated']);
  });

  it('adds and removes the third objective without losing coordinates', () => {
    const two = withCandidates([{ id: 'a', label: 'A', x: 20, y: 30 }]);
    const three = setObjectiveCount(two, 3);
    expect(three.z?.min).toBe(0);
    expect(three.candidates[0]).toMatchObject({ x: 20, y: 30, z: 50 });
    expect(setObjectiveCount(three, 2).candidates[0]).toEqual({ id: 'a', label: 'A', x: 20, y: 30 });
  });

  it('normalizes imported Z axes and defaults missing Z values', () => {
    const normalized = normalizeProject({
      ...EMPTY_PROJECT,
      z: { label: 'Quality', direction: 'minimize', min: 0, max: 10, ticks: [0, 10] },
      candidates: [{ id: 'a', label: 'A', x: 1, y: 2, z: 99 }],
      targets: [{ id: 'b', label: 'B', x: 1, y: 2 }],
    });
    expect(normalized?.z?.direction).toBe('minimize');
    expect(normalized?.candidates[0].z).toBe(10);
    expect(normalized?.targets[0].z).toBe(5);
  });

  it('validates the third axis when present', () => {
    const project = threeD();
    project.z = { ...project.z!, label: '' };
    project.candidates[0].z = 500;
    const messages = validationMessages(project);
    expect(messages).toContain('Name the Z axis.');
    expect(messages).toContain('Every point must lie inside the axis ranges.');
  });
});

describe('templates', () => {
  it('ships six distinct, valid and fully editable projects', () => {
    expect(TEMPLATES).toHaveLength(6);
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(6);
    expect(TEMPLATES.filter((template) => template.project.z)).toHaveLength(2);
    for (const template of TEMPLATES) {
      expect(validationMessages(template.project)).toEqual([]);
      expect(isObjectiveDirection(template.project.x.direction)).toBe(true);
      expect(isObjectiveDirection(template.project.y.direction)).toBe(true);
      if (template.project.z) {
        expect(isObjectiveDirection(template.project.z.direction)).toBe(true);
      }
      const ids = [...template.project.candidates, ...template.project.targets].map((point) => point.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        [...template.project.candidates, ...template.project.targets].every((point) =>
          inRange(point, template.project),
        ),
      ).toBe(true);
    }
  });
});
