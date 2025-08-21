import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import './ProjectRegistration.css';

interface ProjectRegistrationProps {
  projects: Record<string, any>;
}

const ProjectRegistration: React.FC<ProjectRegistrationProps> = ({ projects }) => {
  const [hasGlobalCommands, setHasGlobalCommands] = useState<boolean | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmUnregister, setConfirmUnregister] = useState<string | null>(null);
  const [editingStatusDisplay, setEditingStatusDisplay] = useState<string | null>(null);
  const [newStatusDisplay, setNewStatusDisplay] = useState<string>('');

  useEffect(() => {
    const checkGlobalCommands = async () => {
      try {
        const result = await ApiService.checkGlobalCommands();
        setHasGlobalCommands(result.hasGlobalCommands);
      } catch (error) {
        console.error('Failed to check global commands:', error);
        setHasGlobalCommands(false);
      }
    };

    checkGlobalCommands();
  }, []);

  const projectList = Object.entries(projects);

  const handleOpenVSCode = async (projectPath: string) => {
    setLoadingAction(`vscode-${projectPath}`);
    try {
      await ApiService.openInVSCode(projectPath);
    } catch (error) {
      console.error('Failed to open VS Code:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleOpenFinder = async (projectPath: string) => {
    setLoadingAction(`finder-${projectPath}`);
    try {
      await ApiService.openInFinder(projectPath);
    } catch (error) {
      console.error('Failed to open Finder:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUnregister = async (projectName: string) => {
    setLoadingAction(`unregister-${projectName}`);
    try {
      await ApiService.unregisterProject(projectName);
      setConfirmUnregister(null);
    } catch (error) {
      console.error('Failed to unregister project:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEditStatusDisplay = (projectName: string, currentDisplay?: string) => {
    setEditingStatusDisplay(projectName);
    setNewStatusDisplay(currentDisplay || '');
  };

  const handleSaveStatusDisplay = async (projectName: string) => {
    console.log('Saving status display:', projectName, newStatusDisplay);
    setLoadingAction(`status-${projectName}`);
    try {
      await ApiService.updateStatusDisplay(projectName, newStatusDisplay || null);
      setEditingStatusDisplay(null);
      setNewStatusDisplay('');
      console.log('Status display saved successfully');
    } catch (error) {
      console.error('Failed to update status display:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancelEditStatusDisplay = () => {
    setEditingStatusDisplay(null);
    setNewStatusDisplay('');
  };

  const getProjectName = (projectPath: string) => {
    return projectPath.split('/').pop() || projectPath;
  };

  return (
    <div className="config-section">
      <div className="config-file">
        <h4>Registered Projects ({projectList.length})</h4>
        
        {projectList.length > 0 && (
          <div className="projects-grid">
            {projectList.map(([projectName, projectData]) => (
              <div key={projectName} className="project-card">
                <button
                  className="unregister-btn"
                  onClick={() => setConfirmUnregister(projectName)}
                  title="Unregister project"
                >
                  ✕
                </button>
                <div className="project-header">
                  <div className="project-info">
                    <h5 className="project-name">{projectName}</h5>
                    <p className="project-path">{projectData.path}</p>
                    {editingStatusDisplay === projectName ? (
                      <div className="status-display-info">
                        <span className="status-display-label">Status:</span>
                        <input
                          type="text"
                          value={newStatusDisplay}
                          onChange={(e) => setNewStatusDisplay(e.target.value)}
                          onBlur={(e) => {
                            console.log('Input onBlur triggered');
                            handleSaveStatusDisplay(projectName);
                          }}
                          onKeyDown={(e) => {
                            console.log('Key pressed:', e.key);
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveStatusDisplay(projectName);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              handleCancelEditStatusDisplay();
                            }
                          }}
                          placeholder="Enter URL or description"
                          className="status-display-input-inline"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="status-display-info">
                        <span className="status-display-label">Status:</span>
                        <span 
                          className="status-display-value"
                          onClick={() => handleEditStatusDisplay(projectName, projectData.statusDisplay)}
                          title="Click to edit"
                        >
                          {projectData.statusDisplay || 'Click to set'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="project-actions">
                  <button
                    className="action-btn vscode-btn"
                    onClick={() => handleOpenVSCode(projectData.path)}
                    disabled={loadingAction === `vscode-${projectData.path}`}
                    title="Open in VS Code"
                  >
                    {loadingAction === `vscode-${projectData.path}` ? '...' : 'VS Code'}
                  </button>
                  <button
                    className="action-btn finder-btn"
                    onClick={() => handleOpenFinder(projectData.path)}
                    disabled={loadingAction === `finder-${projectData.path}`}
                    title="Open in Finder"
                  >
                    {loadingAction === `finder-${projectData.path}` ? '...' : 'Finder'}
                  </button>
                </div>
                
                {confirmUnregister === projectName && (
                  <div className="confirmation-overlay">
                    <div className="confirmation-dialog">
                      <h6>Unregister Project?</h6>
                      <p>Remove <strong>{projectName}</strong> from the dashboard?</p>
                      <div className="confirmation-actions">
                        <button
                          className="confirm-btn"
                          onClick={() => handleUnregister(projectName)}
                          disabled={loadingAction === `unregister-${projectName}`}
                        >
                          {loadingAction === `unregister-${projectName}` ? 'Removing...' : 'Yes, Remove'}
                        </button>
                        <button
                          className="cancel-confirm-btn"
                          onClick={() => setConfirmUnregister(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <h4>Register New Projects</h4>
        
        <div className="help-text">
          <p>Projects must be registered using the command line interface:</p>
          
          {hasGlobalCommands === null ? (
            <p>Checking available commands...</p>
          ) : hasGlobalCommands ? (
            <div>
              <p><strong>Recommended method (global commands installed):</strong></p>
              <ul>
                <li><code>cm-reg</code> - Run from any project directory to register it</li>
                <li><code>cm-unreg</code> - Unregister a project</li>
              </ul>
            </div>
          ) : (
            <div>
              <p><strong>Install global commands first:</strong></p>
              <ol>
                <li>Run <code>./install.sh</code> from this project directory</li>
                <li>Restart your terminal or run <code>source ~/.zshrc</code></li>
                <li>Use <code>cm-reg</code> to register projects</li>
              </ol>
              
              <p><strong>Alternative method:</strong></p>
              <ul>
                <li><code>npm run claude:register</code> - Run from any project directory</li>
              </ul>
            </div>
          )}
          
          <p><strong>Example usage:</strong></p>
          <pre>
{`cd /path/to/your/project
${hasGlobalCommands ? 'cm-reg' : 'npm run claude:register'}`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ProjectRegistration;