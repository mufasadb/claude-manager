import React, { useState } from 'react';
import { ApiService } from '../../services/ApiService';
import { Project } from '../../types';
import './EnvVariablesTable.css';

interface EnvVariablesTableProps {
  envVars: Record<string, string>;
  projects: Record<string, Project>;
  onRefresh: () => void;
}

const EnvVariablesTable: React.FC<EnvVariablesTableProps> = ({
  envVars,
  projects,
  onRefresh,
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPushModal, setShowPushModal] = useState<{ key: string; value: string } | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [pushStatus, setPushStatus] = useState<string>('');

  const maskValue = (value: string): string => {
    if (value.length <= 6) {
      return '***';
    }
    return `${value.substring(0, 3)}***${value.substring(value.length - 3)}`;
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
      console.log(`Copied ${key} to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditingValue(value);
  };

  const handleSaveEdit = async () => {
    if (!editingKey) return;
    
    try {
      await ApiService.updateUserEnv(editingKey, editingValue);
      setEditingKey(null);
      setEditingValue('');
      onRefresh();
    } catch (error) {
      console.error('Failed to update environment variable:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  const handleDelete = async (key: string) => {
    try {
      await ApiService.deleteUserEnv(key);
      setShowDeleteConfirm(null);
      onRefresh();
    } catch (error) {
      console.error('Failed to delete environment variable:', error);
    }
  };

  const handlePushToProject = (key: string, value: string) => {
    setShowPushModal({ key, value });
    setSelectedProject('');
    setPushStatus('');
  };

  const confirmPushToProject = async () => {
    if (!showPushModal || !selectedProject) return;

    try {
      setPushStatus('Pushing...');
      const result = await ApiService.pushEnvToProject(
        selectedProject,
        showPushModal.key,
        showPushModal.value
      );

      if (result.conflict) {
        setPushStatus(`Variable ${showPushModal.key} already exists in ${selectedProject}. Please overwrite manually with copy-paste.`);
      } else if (result.success) {
        setPushStatus(`Successfully pushed ${showPushModal.key} to ${selectedProject}`);
        setTimeout(() => {
          setShowPushModal(null);
          setPushStatus('');
          onRefresh();
        }, 2000);
      }
    } catch (error) {
      setPushStatus(`Failed to push variable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const closePushModal = () => {
    setShowPushModal(null);
    setSelectedProject('');
    setPushStatus('');
  };

  if (Object.keys(envVars).length === 0) {
    return (
      <div className="no-data">No user-level environment variables configured</div>
    );
  }

  return (
    <div className="env-vars-table-container">
      <table className="env-vars-table">
        <thead>
          <tr>
            <th>Variable Name</th>
            <th>Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(envVars).map(([key, value]) => (
            <tr key={key}>
              <td className="env-var-key">{key}</td>
              <td className="env-var-value">
                {editingKey === key ? (
                  <div className="edit-input-container">
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="edit-input"
                      autoFocus
                    />
                    <div className="edit-actions">
                      <button 
                        onClick={handleSaveEdit}
                        className="save-btn"
                        title="Save changes"
                      >
                        ✓
                      </button>
                      <button 
                        onClick={handleCancelEdit}
                        className="cancel-btn"
                        title="Cancel editing"
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="masked-value">{maskValue(value)}</span>
                )}
              </td>
              <td className="env-var-actions">
                {editingKey === key ? null : (
                  <>
                    <button
                      onClick={() => copyToClipboard(value, key)}
                      className="action-btn copy-btn"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                    <button
                      onClick={() => handleEdit(key, value)}
                      className="action-btn edit-btn"
                      title="Edit variable"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handlePushToProject(key, value)}
                      className="action-btn push-btn"
                      title="Push to project"
                    >
                      📤
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(key)}
                      className="action-btn delete-btn"
                      title="Delete variable"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showDeleteConfirm && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-dialog">
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete the environment variable "{showDeleteConfirm}"?</p>
            <div className="delete-confirm-actions">
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="confirm-delete-btn"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="cancel-delete-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPushModal && (
        <div className="push-modal-overlay">
          <div className="push-modal-dialog">
            <h3>Push to Project</h3>
            <p>Push environment variable "{showPushModal.key}" to a project:</p>
            
            <div className="push-form">
              <label htmlFor="project-select">Select Project:</label>
              <select
                id="project-select"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="project-select"
              >
                <option value="">Choose a project...</option>
                {Object.entries(projects).map(([projectName, project]) => (
                  <option key={projectName} value={projectName}>
                    {projectName} ({project.path})
                  </option>
                ))}
              </select>
              
              {pushStatus && (
                <div className={`push-status ${pushStatus.includes('Successfully') ? 'success' : pushStatus.includes('already exists') ? 'warning' : 'error'}`}>
                  {pushStatus}
                </div>
              )}
            </div>
            
            <div className="push-modal-actions">
              <button
                onClick={confirmPushToProject}
                disabled={!selectedProject || pushStatus === 'Pushing...'}
                className="confirm-push-btn"
              >
                {pushStatus === 'Pushing...' ? 'Pushing...' : 'Push Variable'}
              </button>
              <button
                onClick={closePushModal}
                className="cancel-push-btn"
                disabled={pushStatus === 'Pushing...'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnvVariablesTable;