/** Palette shared by the SVG components and the brand documentation. */
export const COLORS = {
  ink: '#0f172a',
  muted: '#64748b',
  grid: '#e6e9f2',
  axis: '#94a3b8',
  surface: '#ffffff',
  indigo: '#4f46e5',
  teal: '#0d9488',
  amber: '#f59e0b',
  rose: '#e11d48',
} as const;

export const KIND_COLOR = {
  optimal: COLORS.teal,
  dominated: COLORS.amber,
  infeasible: COLORS.rose,
} as const;
