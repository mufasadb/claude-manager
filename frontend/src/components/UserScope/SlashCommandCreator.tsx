import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { SlashCommandFormData, SlashCommand } from '../../types';

interface SlashCommandCreatorProps {
  projects: Record<string, any>;
}

const SlashCommandCreator: React.FC<SlashCommandCreatorProps> = ({ projects }) => {
  const [formData, setFormData] = useState<SlashCommandFormData>({
    commandName: '',
    description: '',
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

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadExistingCommands();
  }, [formData.scope, formData.projectName]);

  const loadExistingCommands = async () => {
    try {
      const commands = await ApiService.listSlashCommands(
        formData.scope,
        formData.scope === 'project' ? formData.projectName : undefined
      );
      setExistingCommands(commands);
    } catch (error) {
      console.warn('Failed to load existing commands:', error);
    }
  };

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

    // Description validation
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    } else if (formData.description.trim().length < 10) {
      errors.description = 'Description must be at least 10 characters long';
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
          description: '',
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
                  borderRadius: '4px' 
                }}>
                  <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                    /{cmd.category ? `${cmd.category}:${cmd.name}` : cmd.name}
                  </div>
                  <div style={{ color: '#ccc', fontSize: '14px', marginTop: '4px' }}>
                    {cmd.description}
                  </div>
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

          {/* Description */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Deploy the current feature branch to staging environment with proper testing and rollback capabilities"
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1e1e1e',
                color: '#ffffff',
                border: validationErrors.description ? '2px solid #f44336' : '1px solid #666',
                borderRadius: '4px',
                resize: 'vertical'
              }}
            />
            {validationErrors.description && (
              <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                {validationErrors.description}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Describe what this command should do - this helps Claude generate better prompts
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
              fontWeight: 'bold'
            }}
          >
            {isSubmitting ? 'Creating Command...' : 'Create Slash Command'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SlashCommandCreator;