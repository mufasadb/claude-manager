import React, { useState, useEffect, useCallback } from 'react';
import { ApiService } from '../../services/ApiService';
import { SlashCommandFormData, SlashCommand } from '../../types';

interface SlashCommandCreatorProps {
  projects: Record<string, any>;
}

const SlashCommandCreator: React.FC<SlashCommandCreatorProps> = ({ projects }) => {
  const [formData, setFormData] = useState<SlashCommandFormData>({
    commandName: '',
    instructions: '',
    scope: 'user',
    category: '',
    projectName: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const [existingCommands, setExistingCommands] = useState<SlashCommand[]>([]);
  const [showCommandsList, setShowCommandsList] = useState(false);
  const [deletingCommand, setDeletingCommand] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{
    command: SlashCommand | null;
    isOpen: boolean;
  }>({ command: null, isOpen: false });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const loadExistingCommands = useCallback(async () => {
    try {
      const commands = await ApiService.listSlashCommands(
        formData.scope,
        formData.scope === 'project' ? formData.projectName : undefined
      );
      setExistingCommands(commands);
    } catch (error) {
      console.warn('Failed to load existing commands:', error);
    }
  }, [formData.scope, formData.projectName]);

  useEffect(() => {
    loadExistingCommands();
  }, [loadExistingCommands]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Command name validation
    if (!formData.commandName.trim()) {
      errors.commandName = 'Command name is required';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.commandName)) {
      errors.commandName = 'Command name can only contain letters, numbers, hyphens, and underscores';
    } else if (formData.commandName.length < 2) {
      errors.commandName = 'Command name must be at least 2 characters long';
    } else if (formData.commandName.length > 50) {
      errors.commandName = 'Command name must be 50 characters or less';
    }

    // Check for duplicate command names
    const commandPath = formData.category 
      ? `${formData.category}/${formData.commandName}`
      : formData.commandName;
    
    const exists = existingCommands.some(cmd => cmd.relativePath === `${commandPath}.md`);
    if (exists) {
      errors.commandName = `Command "${commandPath}" already exists`;
    }

    // Instructions validation
    if (!formData.instructions.trim()) {
      errors.instructions = 'Instructions are required';
    } else if (formData.instructions.trim().length < 10) {
      errors.instructions = 'Instructions must be at least 10 characters long';
    }

    // Project validation for project scope
    if (formData.scope === 'project' && !formData.projectName) {
      errors.projectName = 'Project is required for project scope';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus({ type: null, message: '' });

    try {
      const result = await ApiService.createSlashCommand({
        ...formData,
        category: formData.category.trim() || undefined
      } as any);

      if (result.success) {
        setSubmitStatus({
          type: 'success',
          message: `Successfully created command: ${result.relativePath}`
        });
        
        // Reset form
        setFormData({
          commandName: '',
          instructions: '',
          scope: formData.scope, // Keep scope selection
          category: '',
          projectName: formData.projectName // Keep project selection
        });
        
        // Reload commands list
        await loadExistingCommands();
      } else {
        setSubmitStatus({
          type: 'error',
          message: result.error || 'Failed to create command'
        });
      }
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create command'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof SlashCommandFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const getPreviewPath = (): string => {
    if (!formData.commandName) return '/';
    
    const category = formData.category.trim();
    const path = category ? `${category}:${formData.commandName}` : formData.commandName;
    return `/${path}`;
  };

  const handleDeleteClick = (command: SlashCommand) => {
    setShowDeleteConfirm({ command, isOpen: true });
  };

  const handleDeleteConfirm = async () => {
    if (!showDeleteConfirm.command) return;

    const command = showDeleteConfirm.command;
    setDeletingCommand(command.relativePath);
    
    try {
      const result = await ApiService.deleteSlashCommand(
        formData.scope,
        command.relativePath,
        formData.scope === 'project' ? formData.projectName : undefined
      );

      if (result.success) {
        setSubmitStatus({
          type: 'success',
          message: `Successfully deleted command: ${command.relativePath}`
        });
        
        // Reload commands list
        await loadExistingCommands();
      } else {
        setSubmitStatus({
          type: 'error',
          message: result.error || 'Failed to delete command'
        });
      }
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete command'
      });
    } finally {
      setDeletingCommand(null);
      setShowDeleteConfirm({ command: null, isOpen: false });
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm({ command: null, isOpen: false });
  };

  const projectOptions = Object.keys(projects);

  return (
    <div style={{ backgroundColor: '#2d2d2d', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ color: '#ffffff', margin: '0' }}>Create Slash Command</h3>
        <button
          type="button"
          onClick={() => setShowCommandsList(!showCommandsList)}
          style={{
            padding: '6px 12px',
            backgroundColor: '#444',
            color: '#fff',
            border: '1px solid #666',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {showCommandsList ? 'Hide' : 'Show'} Existing Commands ({existingCommands.length})
        </button>
      </div>

      {showCommandsList && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: '#1e1e1e', 
          borderRadius: '6px',
          border: '1px solid #444'
        }}>
          <h4 style={{ color: '#fff', marginTop: '0', marginBottom: '10px' }}>
            Existing {formData.scope === 'user' ? 'User' : 'Project'} Commands
          </h4>
          {existingCommands.length === 0 ? (
            <p style={{ color: '#888', margin: '0' }}>No commands found</p>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {existingCommands.map((cmd, index) => (
                <div key={index} style={{ 
                  marginBottom: '8px', 
                  padding: '8px', 
                  backgroundColor: '#333', 
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                      /{cmd.category ? `${cmd.category}:${cmd.name}` : cmd.name}
                    </div>
                    <div style={{ color: '#ccc', fontSize: '14px', marginTop: '4px' }}>
                      {cmd.description}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteClick(cmd)}
                    disabled={deletingCommand === cmd.relativePath}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: deletingCommand === cmd.relativePath ? '#666' : '#f44336',
                      cursor: deletingCommand === cmd.relativePath ? 'not-allowed' : 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: '8px',
                      fontSize: '16px'
                    }}
                    title={deletingCommand === cmd.relativePath ? 'Deleting...' : 'Delete command'}
                  >
                    {deletingCommand === cmd.relativePath ? '⏳' : '🗑️'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* Scope Selection */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Scope *
            </label>
            <div style={{ display: 'flex', gap: '20px' }}>
              <label style={{ color: '#ccc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="radio"
                  value="user"
                  checked={formData.scope === 'user'}
                  onChange={(e) => handleInputChange('scope', e.target.value as 'user' | 'project')}
                />
                User (Global)
              </label>
              <label style={{ color: '#ccc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="radio"
                  value="project"
                  checked={formData.scope === 'project'}
                  onChange={(e) => handleInputChange('scope', e.target.value as 'user' | 'project')}
                />
                Project
              </label>
            </div>
          </div>

          {/* Project Selection (when scope is project) */}
          {formData.scope === 'project' && (
            <div>
              <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
                Project *
              </label>
              <select
                value={formData.projectName}
                onChange={(e) => handleInputChange('projectName', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1e1e1e',
                  color: '#ffffff',
                  border: validationErrors.projectName ? '2px solid #f44336' : '1px solid #666',
                  borderRadius: '4px'
                }}
              >
                <option value="">Select a project...</option>
                {projectOptions.map((projectName) => (
                  <option key={projectName} value={projectName}>
                    {projectName}
                  </option>
                ))}
              </select>
              {validationErrors.projectName && (
                <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                  {validationErrors.projectName}
                </div>
              )}
            </div>
          )}

          {/* Command Name */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Command Name *
            </label>
            <input
              type="text"
              value={formData.commandName}
              onChange={(e) => handleInputChange('commandName', e.target.value)}
              placeholder="deploy-feature"
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1e1e1e',
                color: '#ffffff',
                border: validationErrors.commandName ? '2px solid #f44336' : '1px solid #666',
                borderRadius: '4px'
              }}
            />
            {validationErrors.commandName && (
              <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                {validationErrors.commandName}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Letters, numbers, hyphens, and underscores only
            </div>
          </div>

          {/* Category */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Category (Optional)
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              placeholder="deployment"
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1e1e1e',
                color: '#ffffff',
                border: '1px solid #666',
                borderRadius: '4px'
              }}
            />
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Groups commands into subdirectories for organization
            </div>
          </div>

          {/* Command Preview */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Command Preview
            </label>
            <div style={{
              padding: '10px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #666',
              borderRadius: '4px',
              color: '#4CAF50',
              fontFamily: 'monospace',
              fontSize: '16px'
            }}>
              {getPreviewPath()}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              What should this command do? *
            </label>
            <textarea
              value={formData.instructions}
              onChange={(e) => handleInputChange('instructions', e.target.value)}
              placeholder="Create a deployment command that checks git status, runs tests, builds for production, deploys to staging with rollback capability, and verifies success with notifications. Include error handling and logging at each step."
              rows={6}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1e1e1e',
                color: '#ffffff',
                border: validationErrors.instructions ? '2px solid #f44336' : '1px solid #666',
                borderRadius: '4px',
                resize: 'vertical'
              }}
            />
            {validationErrors.instructions && (
              <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                {validationErrors.instructions}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Describe what you want this command to accomplish. The AI will create a professional slash command with proper structure, tools, and examples based on your description.
            </div>
          </div>

          {/* Submit Status */}
          {submitStatus.type && (
            <div style={{
              padding: '12px',
              borderRadius: '4px',
              backgroundColor: submitStatus.type === 'success' ? '#1b5e20' : '#c62828',
              color: '#ffffff',
              border: `1px solid ${submitStatus.type === 'success' ? '#4caf50' : '#f44336'}`
            }}>
              {submitStatus.message}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '12px 24px',
              backgroundColor: isSubmitting ? '#666' : '#4CAF50',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {isSubmitting && (
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid #ffffff',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
{isSubmitting ? 'AI is creating your command...' : 'Generate Slash Command'}
          </button>

          {/* Add CSS for spinner animation */}
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </form>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm.isOpen && showDeleteConfirm.command && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#2d2d2d',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #666',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '16px' }}>
              Confirm Delete Command
            </h3>
            <p style={{ color: '#ccc', marginBottom: '20px' }}>
              Are you sure you want to delete the slash command:
            </p>
            <div style={{
              backgroundColor: '#1e1e1e',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #444',
              marginBottom: '20px'
            }}>
              <div style={{ color: '#4CAF50', fontWeight: 'bold', marginBottom: '4px' }}>
                /{showDeleteConfirm.command.category ? 
                  `${showDeleteConfirm.command.category}:${showDeleteConfirm.command.name}` : 
                  showDeleteConfirm.command.name}
              </div>
              <div style={{ color: '#ccc', fontSize: '14px' }}>
                {showDeleteConfirm.command.description}
              </div>
              <div style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>
                File: {showDeleteConfirm.command.relativePath}
              </div>
            </div>
            <p style={{ color: '#f44336', fontSize: '14px', marginBottom: '20px' }}>
              ⚠️ This action cannot be undone. The command file will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleDeleteCancel}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#444',
                  color: '#fff',
                  border: '1px solid #666',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deletingCommand !== null}
                style={{
                  padding: '8px 16px',
                  backgroundColor: deletingCommand !== null ? '#666' : '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: deletingCommand !== null ? 'not-allowed' : 'pointer'
                }}
              >
                {deletingCommand !== null ? 'Deleting...' : 'Delete Command'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlashCommandCreator;