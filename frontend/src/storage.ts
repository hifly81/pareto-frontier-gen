import type { ParetoProject } from './domain/pareto';
import { normalizeProject, validationMessages } from './domain/pareto';
import { newId } from './id';

export interface SavedProject {
  id: string;
  savedAt: string;
  version: 1;
  project: ParetoProject;
}

export interface SaveOutcome {
  entries: SavedProject[];
  status: 'saved' | 'unchanged' | 'error';
  message: string;
}

export const STORAGE_KEY = 'pareto-frontier-generator.projects.v1';
const MAX_SAVED = 12;
const MAX_IMPORT_BYTES = 1_000_000;

function parseSaved(value: unknown): SavedProject | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !entry.id.trim()) return null;
  if (typeof entry.savedAt !== 'string' || !Number.isFinite(Date.parse(entry.savedAt))) return null;
  if (entry.version !== undefined && entry.version !== 1) return null;
  const project = normalizeProject(entry.project);
  if (!project) return null;
  return {
    id: entry.id,
    savedAt: new Date(entry.savedAt).toISOString(),
    version: 1,
    project,
  };
}

export function readSavedProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((value): SavedProject[] => {
      const entry = parseSaved(value);
      if (!entry || seen.has(entry.id)) return [];
      seen.add(entry.id);
      return [entry];
    });
  } catch {
    return [];
  }
}

function persist(entries: SavedProject[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function saveProject(project: ParetoProject): SaveOutcome {
  const entries = readSavedProjects();
  const issues = validationMessages(project);
  if (issues.length > 0) {
    return { entries, status: 'error', message: issues[0] };
  }
  const normalized = normalizeProject(project);
  if (!normalized) {
    return { entries, status: 'error', message: 'The project could not be serialized.' };
  }
  if (entries[0] && JSON.stringify(entries[0].project) === JSON.stringify(normalized)) {
    return { entries, status: 'unchanged', message: 'This project is already saved.' };
  }

  const entry: SavedProject = {
    id: newId('saved'),
    savedAt: new Date().toISOString(),
    version: 1,
    project: normalized,
  };
  const next = [entry, ...entries].slice(0, MAX_SAVED);
  try {
    persist(next);
  } catch {
    return {
      entries,
      status: 'error',
      message: 'Browser storage is unavailable or full. The project was not saved.',
    };
  }
  return { entries: next, status: 'saved', message: 'Saved to this browser.' };
}

export function deleteSavedProject(id: string): SavedProject[] {
  const next = readSavedProjects().filter((entry) => entry.id !== id);
  try {
    persist(next);
  } catch {
    return readSavedProjects();
  }
  return next;
}

function fileNameFor(project: ParetoProject): string {
  const slug = project.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'pareto-frontier'}.json`;
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
  link.download = fileNameFor(project);
  document.body.appendChild(link);
  link.click();
  link.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** Reads and validates a project JSON file, accepting raw projects and saved entries. */
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
