import React from 'react';
import { AppState } from '../../types';
import ClaudeMdEditor from './ClaudeMdEditor';
import MCPManagement from '../MCPManagement/MCPManagement';
import HookManagement from '../HookManagement/HookManagement';

interface ProjectScopeProps {
  appState: AppState;
  selectedProject: string;
  onRefresh: () => void;
}

const ProjectScope: React.FC<ProjectScopeProps> = ({
  appState,
  selectedProject,
  onRefresh,
}) => {
  if (!selectedProject) {
    return (
      <div className="no-data">
        Please select a project from the dropdown above
      </div>
    );
  }

  const project = appState.projects[selectedProject];
  if (!project) {
    return (
      <div className="no-data">
        Project "{selectedProject}" not found
      </div>
    );
  }

  return (
    <div id="projectScopeContent" className="sections">
      <div className="scope-section">
        <div className="scope-header">📁 Project: {selectedProject}</div>
        <div className="scope-content">
          <div className="project-info">
            <p><strong>Path:</strong> {project.path}</p>
          </div>
          
          <ClaudeMdEditor
            projectPath={project.path}
            claudeMdContent={project.claudeMd || ''}
            onRefresh={onRefresh}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header">🔌 Project MCP Servers</div>
        <div className="scope-content">
          <MCPManagement 
            scope="project"
            projectPath={project.path}
            onMCPUpdate={onRefresh}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header">🎣 Project Hook Events</div>
        <div className="scope-content">
          <HookManagement 
            scope="project"
            projectName={selectedProject}
          />
        </div>
      </div>
    </div>
  );
};

export default ProjectScope;