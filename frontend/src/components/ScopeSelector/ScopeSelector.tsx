import React from 'react';
import { Project } from '../../types';
import './ScopeSelector.css';

interface ScopeSelectorProps {
  selectedScope: 'user' | 'project';
  onScopeChange: (scope: 'user' | 'project') => void;
  projects: Record<string, Project>;
  selectedProject: string;
  onProjectChange: (projectName: string) => void;
}

const ScopeSelector: React.FC<ScopeSelectorProps> = ({
  selectedScope,
  onScopeChange,
  projects,
  selectedProject,
  onProjectChange,
}) => {
  const projectNames = Object.keys(projects);

  return (
    <div className="target-selector">
      <div className="target-tabs">
        <button
          className={`target-tab ${selectedScope === 'user' ? 'active' : ''}`}
          onClick={() => onScopeChange('user')}
        >
          👤 User Level
        </button>
        <button
          className={`target-tab ${selectedScope === 'project' ? 'active' : ''}`}
          onClick={() => onScopeChange('project')}
        >
          📁 Project Level
        </button>
      </div>

      {selectedScope === 'project' && (
        <div className="project-selector">
          <select
            value={selectedProject}
            onChange={(e) => onProjectChange(e.target.value)}
            className="project-select"
          >
            <option value="">Select a project...</option>
            {projectNames.map((projectName) => (
              <option key={projectName} value={projectName}>
                {projectName} ({projects[projectName].path})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default ScopeSelector;