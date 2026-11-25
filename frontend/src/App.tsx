import { useEffect, useState } from 'react';
import { HomeView } from './components/HomeView';
import { Wizard } from './components/Wizard';
import { Workspace } from './components/Workspace';
import { EMPTY_PROJECT } from './domain/pareto';
import type { ParetoProject } from './domain/pareto';
import { TEMPLATES } from './domain/templates';
import type { Template } from './domain/templates';

type View = 'home' | 'wizard' | 'workspace';

const snapshot = (project: ParetoProject) => JSON.stringify(project);

export default function App() {
  const [view, setView] = useState<View>('home');
  const [project, setProject] = useState<ParetoProject>(EMPTY_PROJECT);
  const [openedSnapshot, setOpenedSnapshot] = useState(() => snapshot(EMPTY_PROJECT));

  const dirty = view === 'workspace' && snapshot(project) !== openedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function goHome() {
    if (dirty && !window.confirm('Discard unsaved changes and return home?')) return;
    setView('home');
  }

  function startFree() {
    setProject(EMPTY_PROJECT);
    setOpenedSnapshot(snapshot(EMPTY_PROJECT));
    setView('workspace');
  }

  function startWizard() {
    setProject(EMPTY_PROJECT);
    setOpenedSnapshot(snapshot(EMPTY_PROJECT));
    setView('wizard');
  }

  function loadProject(next: ParetoProject) {
    setProject(next);
    setOpenedSnapshot(snapshot(next));
    setView('workspace');
  }

  function loadTemplate(template: Template) {
    loadProject(template.project);
  }

  return (
    <>
      {view === 'home' && (
        <HomeView
          templates={TEMPLATES}
          onWizard={startWizard}
          onFree={startFree}
          onTemplate={loadTemplate}
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
        <Workspace project={project} onChange={setProject} onHome={goHome} />
      )}
    </>
  );
}
