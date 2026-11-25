import { evaluateProject } from '../domain/pareto';
import type { Template } from '../domain/templates';
import { SiteHeader } from './SiteHeader';

interface HomeViewProps {
  templates: readonly Template[];
  onWizard: () => void;
  onFree: () => void;
  onTemplate: (template: Template) => void;
}

export function HomeView({ templates, onWizard, onFree, onTemplate }: HomeViewProps) {
  return (
    <div className="app-shell">
      <SiteHeader />

      <div className="intro">
        <h1>Build a frontier from real solutions.</h1>
        <p>
          Add candidate solutions, set each objective to maximize or minimize, and let the
          dominance algorithm find the efficient trade-offs. Work in two dimensions or switch to a
          three-dimensional chart with three objectives. Start from scratch or explore a ready-made
          example.
        </p>
      </div>

      <main className="home-grid">
        <section className="card mode-card" aria-labelledby="create-heading">
          <div className="mode-number">01</div>
          <h2 id="create-heading">Create from scratch</h2>
          <p>Define your own objectives and solutions. Choose how much guidance you want.</p>
          <div className="mode-options">
            <button type="button" className="option-button" onClick={onWizard}>
              <strong>Guided wizard</strong>
              <span>Three steps: axes, solutions, review.</span>
            </button>
            <button type="button" className="option-button" onClick={onFree}>
              <strong>Free editor</strong>
              <span>Open the full editor immediately.</span>
            </button>
          </div>
          <p className="mode-footnote">
            Both modes produce the same editable project. The frontier is computed from your data.
          </p>
        </section>

        <section className="card template-section" aria-labelledby="templates-heading">
          <div className="mode-number">02</div>
          <h2 id="templates-heading">Load a template</h2>
          <p>Six examples with candidate solutions and reference targets, in 2D and 3D. Fully editable once loaded.</p>
          <div className="template-grid">
            {templates.map((template) => {
              const analysis = evaluateProject(template.project);
              return (
                <button
                  type="button"
                  className="template-card"
                  key={template.id}
                  onClick={() => onTemplate(template)}
                >
                  <span className="template-category">{template.category}</span>
                  <strong>{template.title}</strong>
                  <span className="template-description">{template.description}</span>
                  <span className="template-stats">
                    {template.project.z ? '3D · ' : '2D · '}
                    {template.project.candidates.length} solutions · {analysis.optimal.length} on the front
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

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
