import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { AgentFormData, Agent, AgentTemplate } from '../../types';

interface AgentCreatorProps {
  projects: Record<string, any>;
}

const AgentCreator: React.FC<AgentCreatorProps> = ({ projects }) => {
  const [formData, setFormData] = useState<AgentFormData>({
    agentName: '',
    description: '',
    scope: 'user',
    projectName: '',
    textFace: '(◕‿◕)',
    textColor: '#00ff00',
    tools: []
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const [existingAgents, setExistingAgents] = useState<Agent[]>([]);
  const [showAgentsList, setShowAgentsList] = useState(false);
  const [templates, setTemplates] = useState<AgentTemplate | null>(null);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadTemplates();
    loadAvailableTools();
  }, []);

  useEffect(() => {
    loadExistingAgents();
  }, [formData.scope, formData.projectName]);

  useEffect(() => {
    // Set default tools when templates load
    if (templates && formData.tools.length === 0) {
      setFormData(prev => ({ ...prev, tools: [...templates.defaultTools] }));
    }
  }, [templates]);

  const loadTemplates = async () => {
    try {
      const response = await ApiService.getAgentTemplates();
      setTemplates(response);
      
      // Set default values
      if (response.asciiPresets.length > 0) {
        setFormData(prev => ({ 
          ...prev, 
          textFace: response.asciiPresets[0].face,
          tools: [...response.defaultTools]
        }));
      }
      if (response.colorPresets.length > 0) {
        setFormData(prev => ({ ...prev, textColor: response.colorPresets[0].hex }));
      }
    } catch (error) {
      console.warn('Failed to load agent templates:', error);
    }
  };

  const loadAvailableTools = async () => {
    try {
      const response = await ApiService.getAvailableTools();
      setAvailableTools(response.tools);
    } catch (error) {
      console.warn('Failed to load available tools:', error);
    }
  };

  const loadExistingAgents = async () => {
    try {
      const agents = await ApiService.listAgents(
        formData.scope,
        formData.scope === 'project' ? formData.projectName : undefined
      );
      setExistingAgents(agents);
    } catch (error) {
      console.warn('Failed to load existing agents:', error);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Agent name validation
    if (!formData.agentName.trim()) {
      errors.agentName = 'Agent name is required';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.agentName)) {
      errors.agentName = 'Agent name can only contain letters, numbers, hyphens, and underscores';
    } else if (formData.agentName.length < 2) {
      errors.agentName = 'Agent name must be at least 2 characters long';
    } else if (formData.agentName.length > 50) {
      errors.agentName = 'Agent name must be 50 characters or less';
    }

    // Check for duplicate agent names
    const exists = existingAgents.some(agent => agent.name === formData.agentName);
    if (exists) {
      errors.agentName = `Agent "${formData.agentName}" already exists`;
    }

    // Description validation
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    } else if (formData.description.trim().length < 20) {
      errors.description = 'Description must be at least 20 characters long for good agent generation';
    }

    // Project validation for project scope
    if (formData.scope === 'project' && !formData.projectName) {
      errors.projectName = 'Project is required for project scope';
    }

    // Tools validation
    if (formData.tools.length === 0) {
      errors.tools = 'At least one tool must be selected';
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
      const result = await ApiService.createAgent(formData);

      if (result.success) {
        setSubmitStatus({
          type: 'success',
          message: `Successfully created agent: ${result.relativePath}`
        });
        
        // Reset form
        setFormData({
          agentName: '',
          description: '',
          scope: formData.scope, // Keep scope selection
          projectName: formData.projectName, // Keep project selection
          textFace: templates?.asciiPresets[0]?.face || '(◕‿◕)',
          textColor: templates?.colorPresets[0]?.hex || '#00ff00',
          tools: templates?.defaultTools || []
        });
        
        // Reload agents list
        await loadExistingAgents();
      } else {
        setSubmitStatus({
          type: 'error',
          message: result.error || 'Failed to create agent'
        });
      }
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create agent'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof AgentFormData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleDeleteAgent = async (agentName: string) => {
    if (!window.confirm(`Are you sure you want to delete agent "${agentName}"?`)) {
      return;
    }

    try {
      const result = await ApiService.deleteAgent({
        agentName,
        scope: formData.scope,
        projectName: formData.scope === 'project' ? formData.projectName : undefined
      });

      if (result.success) {
        await loadExistingAgents();
      } else {
        window.alert(`Failed to delete agent: ${result.error}`);
      }
    } catch (error) {
      window.alert(`Failed to delete agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const projectOptions = Object.keys(projects);

  if (!templates) {
    return <div style={{ color: '#fff', padding: '20px' }}>Loading agent templates...</div>;
  }

  return (
    <div style={{ backgroundColor: '#2d2d2d', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ color: '#ffffff', margin: '0' }}>Create Agent</h3>
        <button
          type="button"
          onClick={() => setShowAgentsList(!showAgentsList)}
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
          {showAgentsList ? 'Hide' : 'Show'} Existing Agents ({existingAgents.length})
        </button>
      </div>

      {showAgentsList && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: '#1e1e1e', 
          borderRadius: '6px',
          border: '1px solid #444'
        }}>
          <h4 style={{ color: '#fff', marginTop: '0', marginBottom: '10px' }}>
            Existing {formData.scope === 'user' ? 'User' : 'Project'} Agents
          </h4>
          {existingAgents.length === 0 ? (
            <p style={{ color: '#888', margin: '0' }}>No agents found</p>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {existingAgents.map((agent, index) => (
                <div key={index} style={{ 
                  marginBottom: '8px', 
                  padding: '8px', 
                  backgroundColor: '#333', 
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ 
                      color: agent.textColor, 
                      fontWeight: 'bold',
                      fontFamily: 'monospace'
                    }}>
                      {agent.textFace} {agent.name}
                    </div>
                    <div style={{ color: '#ccc', fontSize: '14px', marginTop: '4px' }}>
                      {agent.description}
                    </div>
                    <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>
                      Tools: {agent.tools.join(', ')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAgent(agent.name)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#cc0000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Delete
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

          {/* Agent Name */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Agent Name *
            </label>
            <input
              type="text"
              value={formData.agentName}
              onChange={(e) => handleInputChange('agentName', e.target.value)}
              placeholder="bug-hunter"
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1e1e1e',
                color: '#ffffff',
                border: validationErrors.agentName ? '2px solid #f44336' : '1px solid #666',
                borderRadius: '4px'
              }}
            />
            {validationErrors.agentName && (
              <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                {validationErrors.agentName}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Letters, numbers, hyphens, and underscores only
            </div>
          </div>

          {/* ASCII Face Selection */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Text Face *
            </label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '8px',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '10px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #666',
              borderRadius: '4px'
            }}>
              {templates.asciiPresets.map((preset, index) => (
                <label key={index} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  color: '#ccc',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '3px',
                  backgroundColor: formData.textFace === preset.face ? '#333' : 'transparent'
                }}>
                  <input
                    type="radio"
                    value={preset.face}
                    checked={formData.textFace === preset.face}
                    onChange={(e) => handleInputChange('textFace', e.target.value)}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: '16px' }}>{preset.face}</span>
                  <span style={{ fontSize: '12px' }}>{preset.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Text Color *
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {templates.colorPresets.map((color, index) => (
                <label key={index} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  color: '#ccc',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    value={color.hex}
                    checked={formData.textColor === color.hex}
                    onChange={(e) => handleInputChange('textColor', e.target.value)}
                  />
                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    backgroundColor: color.hex,
                    border: '1px solid #666',
                    borderRadius: '3px'
                  }} />
                  <span style={{ fontSize: '14px' }}>{color.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Agent Preview */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Agent Preview
            </label>
            <div style={{
              padding: '10px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #666',
              borderRadius: '4px',
              color: formData.textColor,
              fontFamily: 'monospace',
              fontSize: '16px'
            }}>
              {formData.textFace} {formData.agentName || 'your-agent-name'}
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
              placeholder="A specialized agent for hunting down bugs and debugging complex issues. Helps with error analysis, troubleshooting, and providing solutions."
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
              Describe what this agent should do - Claude will generate a specialized prompt based on this
            </div>
          </div>

          {/* Tools Selection */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Available Tools *
            </label>
            <div style={{ 
              maxHeight: '200px', 
              overflowY: 'auto',
              padding: '10px',
              backgroundColor: '#1e1e1e',
              border: validationErrors.tools ? '2px solid #f44336' : '1px solid #666',
              borderRadius: '4px'
            }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '8px' 
              }}>
                {availableTools.map((tool, index) => (
                  <label key={index} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    color: '#ccc',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.tools.includes(tool)}
                      onChange={(e) => {
                        const newTools = e.target.checked
                          ? [...formData.tools, tool]
                          : formData.tools.filter(t => t !== tool);
                        handleInputChange('tools', newTools);
                      }}
                    />
                    <span style={{ fontSize: '14px' }}>{tool}</span>
                  </label>
                ))}
              </div>
            </div>
            {validationErrors.tools && (
              <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                {validationErrors.tools}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Selected tools: {formData.tools.length} / {availableTools.length}
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
            {isSubmitting ? 'Creating Agent...' : 'Create Agent'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AgentCreator;