import { useEffect, useState } from 'react';
import { HomeView } from './components/HomeView';
import { Wizard } from './components/Wizard';
import { Workspace } from './components/Workspace';
import { EMPTY_PROJECT } from './domain/pareto';
import type { ParetoProject } from './domain/pareto';
import { TEMPLATES } from './domain/templates';
import type { Template } from './domain/templates';
import { deleteSavedProject, readSavedProjects, saveProject, STORAGE_KEY } from './storage';
import type { SavedProject } from './storage';

type View = 'home' | 'wizard' | 'workspace';

const snapshot = (project: ParetoProject) => JSON.stringify(project);

export default function App() {
  const [view, setView] = useState<View>('home');
  const [project, setProject] = useState<ParetoProject>(EMPTY_PROJECT);
  const [saved, setSaved] = useState<SavedProject[]>(readSavedProjects);
  const [lastSaved, setLastSaved] = useState(() => snapshot(EMPTY_PROJECT));

  const dirty = view === 'workspace' && snapshot(project) !== lastSaved;

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null) setSaved(readSavedProjects());
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function goHome() {
    if (dirty && !window.confirm('Discard unsaved changes and return home?')) return;
    setView('home');
  }

  function startFree() {
    setProject(EMPTY_PROJECT);
    setLastSaved(snapshot(EMPTY_PROJECT));
    setView('workspace');
  }

  function startWizard() {
    setProject(EMPTY_PROJECT);
    setLastSaved(snapshot(EMPTY_PROJECT));
    setView('wizard');
  }

  function loadProject(next: ParetoProject) {
    setProject(next);
    setLastSaved(snapshot(next));
    setView('workspace');
  }

  function loadTemplate(template: Template) {
    loadProject(template.project);
  }

  function openSaved(entry: SavedProject) {
    loadProject(entry.project);
  }

  function handleSave(): string {
    const outcome = saveProject(project);
    setSaved(outcome.entries);
    if (outcome.status !== 'error') setLastSaved(snapshot(project));
    return outcome.message;
  }

  return (
    <>
      {view === 'home' && (
        <HomeView
          templates={TEMPLATES}
          saved={saved}
          onWizard={startWizard}
          onFree={startFree}
          onTemplate={loadTemplate}
          onSaved={openSaved}
          onDeleteSaved={(id) => setSaved(deleteSavedProject(id))}
        />
      )}

      {view === 'wizard' && (
        <Wizard
          initial={project}
          onCancel={goHome}
          onFinish={(next) => loadProject(next)}
        />
      )}

      {view === 'workspace' && (
        <Workspace
          project={project}
          onChange={setProject}
          onHome={goHome}
          onSave={handleSave}
        />
      )}
    </>
  );
}
