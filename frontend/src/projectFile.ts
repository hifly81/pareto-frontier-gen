import type { ParetoProject } from './domain/pareto';
import { normalizeProject, validationMessages } from './domain/pareto';

const MAX_IMPORT_BYTES = 1_000_000;

export function projectFileName(project: ParetoProject, extension: string): string {
  const slug = project.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'pareto-frontier'}.${extension}`;
}

/** Downloads the project as a portable JSON file. */
export function exportProject(project: ParetoProject): void {
  if (validationMessages(project).length > 0) {
    throw new Error('Fix the project issues before exporting it.');
  }
  const normalized = normalizeProject(project);
  if (!normalized) throw new Error('The project could not be serialized.');
  const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = projectFileName(project, 'json');
  document.body.appendChild(link);
  link.click();
  link.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** Reads and validates a project JSON file, accepting raw projects and a `{ project }` wrapper. */
export async function importProject(file: File): Promise<ParetoProject> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('The file is too large. Import a project JSON below 1 MB.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const candidate =
    typeof parsed === 'object' && parsed !== null && 'project' in parsed
      ? (parsed as { project: unknown }).project
      : parsed;
  const project = normalizeProject(candidate);
  if (!project) {
    throw new Error('The file does not contain a valid Pareto project.');
  }
  return project;
}
