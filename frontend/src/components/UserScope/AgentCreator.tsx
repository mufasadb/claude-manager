import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { AgentFormData, Agent, AgentTemplate } from '../../types';
import { Target, Wrench, Lightbulb, BookOpen, AlertTriangle } from 'lucide-react';

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

  const [useFaceEmoji, setUseFaceEmoji] = useState(false);
  const [toolSearchTerm, setToolSearchTerm] = useState('');
  const [selectedToolCategories, setSelectedToolCategories] = useState<string[]>(['core']);

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
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalContent, setErrorModalContent] = useState<{
    title: string;
    message: string;
    details?: string[];
    troubleshooting?: string[];
  }>({ title: '', message: '' });

  // Tool categorization helper
  const categorizeTools = (tools: string[]) => {
    const categories = {
      core: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
      productivity: ['Task', 'TodoWrite', 'WebSearch', 'WebFetch'],
      context7: tools.filter(tool => tool.startsWith('mcp__context7')),
      playwright: tools.filter(tool => tool.startsWith('mcp__playwright')),
      notion: tools.filter(tool => tool.startsWith('mcp__notion')),
      figma: tools.filter(tool => tool.startsWith('mcp__figma')),
      other: tools.filter(tool => 
        !['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', 'TodoWrite', 'WebSearch', 'WebFetch'].includes(tool) &&
        !tool.startsWith('mcp__context7') &&
        !tool.startsWith('mcp__playwright') &&
        !tool.startsWith('mcp__notion') &&
        !tool.startsWith('mcp__figma')
      )
    };
    return categories;
  };

  const getFilteredTools = () => {
    const categories = categorizeTools(availableTools);
    let filteredTools: string[] = [];
    
    selectedToolCategories.forEach(category => {
      if (categories[category as keyof typeof categories]) {
        filteredTools = [...filteredTools, ...categories[category as keyof typeof categories]];
      }
    });

    if (toolSearchTerm) {
      filteredTools = filteredTools.filter(tool => 
        tool.toLowerCase().includes(toolSearchTerm.toLowerCase())
      );
    }

    return Array.from(new Set(filteredTools)); // Remove duplicates
  };

  const getVisibleTools = () => {
    const filtered = getFilteredTools();
    // Hide selected tools unless they match current search/category filters
    return filtered.filter(tool => !formData.tools.includes(tool));
  };

  useEffect(() => {
    loadTemplates();
    loadAvailableTools();
  }, []);

  useEffect(() => {
    loadExistingAgents();
    loadAvailableTools(); // Reload tools when scope/project changes
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
      const response = await ApiService.getAvailableTools(formData.scope, formData.projectName);
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

    // Agent name validation with specific space detection
    if (!formData.agentName.trim()) {
      errors.agentName = 'Agent name is required';
    } else if (formData.agentName.includes(' ')) {
      // Show modal for space character issue
      setErrorModalContent({
        title: 'Invalid Agent Name',
        message: `Agent name "${formData.agentName}" contains spaces, which are not allowed.`,
        details: [
          'Agent names can only contain:',
          '• Letters (a-z, A-Z)',
          '• Numbers (0-9)', 
          '• Hyphens (-)',
          '• Underscores (_)'
        ],
        troubleshooting: [
          `Try "UX_Reviewer" instead of "UX Reviewer"`,
          `Or use "ux-reviewer" with hyphens`,
          `Or use "UXReviewer" without spaces`
        ]
      });
      setShowErrorModal(true);
      errors.agentName = 'Agent name contains invalid characters (spaces)';
      return false; // Immediately stop validation
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to create agent';
      
      // Check if this is an OpenRouter error with detailed information
      if (errorMessage.includes('OpenRouter AI service unavailable:')) {
        try {
          const jsonStart = errorMessage.indexOf('{');
          if (jsonStart > -1) {
            const errorDetails = JSON.parse(errorMessage.substring(jsonStart));
            setErrorModalContent({
              title: 'AI Service Unavailable',
              message: `${errorDetails.service} is currently unavailable: ${errorDetails.issue}`,
              details: errorDetails.possibleCauses || [],
              troubleshooting: errorDetails.troubleshooting || []
            });
            setShowErrorModal(true);
          } else {
            throw new Error('No JSON details found');
          }
        } catch (parseError) {
          // Fallback if JSON parsing fails
          setErrorModalContent({
            title: 'AI Service Error',
            message: 'OpenRouter AI service is currently unavailable.',
            details: [
              'Agent creation requires AI generation',
              'The service may be temporarily down'
            ],
            troubleshooting: [
              'Check your internet connection',
              'Try again in a few minutes',
              'Verify OpenRouter service status'
            ]
          });
          setShowErrorModal(true);
        }
      } else {
        setSubmitStatus({
          type: 'error',
          message: errorMessage
        });
      }
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

          {/* Face/Emoji Toggle */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <input
                type="checkbox"
                checked={useFaceEmoji}
                onChange={(e) => setUseFaceEmoji(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              <label style={{ color: '#ffffff', margin: '0' }}>
                Use Custom Face & Color (optional)
              </label>
            </div>
            {useFaceEmoji && (
              <>
                {/* ASCII Face Selection */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
                    Text Face
                  </label>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: '8px',
                    maxHeight: '150px',
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
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
                    Text Color
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
              </>
            )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <label style={{ color: '#ffffff', margin: '0' }}>
                Description *
              </label>
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                style={{
                  backgroundColor: '#444',
                  color: '#fff',
                  border: '1px solid #666',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Show agent creation help"
              >
                ?
              </button>
            </div>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder={`Describe your agent following these key elements:

• Specific Role & Expertise - What domain does this agent specialize in? (e.g., "Python security code reviewer" not "helpful assistant")

• Core Capabilities - What are the 3-5 main things it can do? Include specific examples and use cases

• Tool Usage Guidelines - How should it use available tools? When to use each one and what validation is needed?

• Boundaries & Limitations - What can't or won't it do? What are the safety constraints and escalation rules?

• Success Criteria - How will you know if this agent is working well? What constitutes good performance vs failure?

Focus on specialization over generalization - agents that do one thing excellently outperform those that try to do everything.`}
              rows={8}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1e1e1e',
                color: '#ffffff',
                border: validationErrors.description ? '2px solid #f44336' : '1px solid #666',
                borderRadius: '4px',
                resize: 'vertical',
                fontFamily: 'inherit',
                fontSize: '14px',
                lineHeight: '1.4'
              }}
            />
            {validationErrors.description && (
              <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                {validationErrors.description}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Claude will generate a specialized system message based on this description. Click the ? for detailed guidance.
            </div>
          </div>

          {/* Tools Selection */}
          <div>
            <label style={{ color: '#ffffff', display: 'block', marginBottom: '8px' }}>
              Available Tools *
            </label>
            
            {/* Tool Search and Categories */}
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Search tools..."
                value={toolSearchTerm}
                onChange={(e) => setToolSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#2d2d2d',
                  color: '#ffffff',
                  border: '1px solid #666',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              />
              
              {/* Category Filters */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['core', 'productivity', 'context7', 'playwright', 'notion', 'figma', 'other'].map(category => {
                  const toolCount = categorizeTools(availableTools)[category as keyof ReturnType<typeof categorizeTools>]?.length || 0;
                  return (
                    <label key={category} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      color: '#ccc',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      backgroundColor: selectedToolCategories.includes(category) ? '#4CAF50' : '#333',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedToolCategories.includes(category)}
                        onChange={(e) => {
                          const newCategories = e.target.checked
                            ? [...selectedToolCategories, category]
                            : selectedToolCategories.filter(c => c !== category);
                          setSelectedToolCategories(newCategories);
                        }}
                        style={{ margin: '0' }}
                      />
                      {category} ({toolCount})
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Selected Tools Display */}
            {formData.tools.length > 0 && (
              <div style={{ 
                marginBottom: '12px',
                padding: '10px',
                backgroundColor: '#2a5d3a',
                border: '1px solid #4CAF50',
                borderRadius: '4px'
              }}>
                <div style={{ color: '#4CAF50', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>
                  Selected Tools ({formData.tools.length}):
                </div>
                <div style={{ 
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px'
                }}>
                  {formData.tools.map((tool, index) => (
                    <span key={index} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      backgroundColor: '#1e1e1e',
                      color: '#4CAF50',
                      borderRadius: '3px',
                      fontSize: '12px'
                    }}>
                      {tool}
                      <button
                        type="button"
                        onClick={() => {
                          const newTools = formData.tools.filter(t => t !== tool);
                          handleInputChange('tools', newTools);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f44336',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '0',
                          marginLeft: '2px'
                        }}
                        title="Remove tool"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tool Selection Area */}
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto',
              padding: '10px',
              backgroundColor: '#1e1e1e',
              border: validationErrors.tools ? '2px solid #f44336' : '1px solid #666',
              borderRadius: '4px'
            }}>
              {getVisibleTools().length === 0 ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                  {formData.tools.length > 0 ? 
                    'All matching tools are already selected.' : 
                    'No tools found. Try adjusting your search or category filters.'
                  }
                </div>
              ) : (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '6px' 
                }}>
                  {getVisibleTools().map((tool, index) => (
                    <label key={index} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      color: '#ccc',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '3px',
                      backgroundColor: 'transparent',
                      fontSize: '13px'
                    }}>
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const newTools = [...formData.tools, tool];
                            handleInputChange('tools', newTools);
                          }
                        }}
                        style={{ margin: '0' }}
                      />
                      <span style={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {tool}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            
            {/* Tool Selection Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  const visibleTools = getVisibleTools();
                  handleInputChange('tools', Array.from(new Set([...formData.tools, ...visibleTools])));
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#4CAF50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                disabled={getVisibleTools().length === 0}
              >
                Select All Visible ({getVisibleTools().length})
              </button>
              <button
                type="button"
                onClick={() => {
                  const filteredTools = getFilteredTools();
                  handleInputChange('tools', formData.tools.filter(tool => !filteredTools.includes(tool)));
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                disabled={formData.tools.length === 0}
              >
                Deselect Matching
              </button>
              <button
                type="button"
                onClick={() => handleInputChange('tools', [])}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#666',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                disabled={formData.tools.length === 0}
              >
                Clear All
              </button>
            </div>
            
            {validationErrors.tools && (
              <div style={{ color: '#f44336', fontSize: '14px', marginTop: '4px' }}>
                {validationErrors.tools}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
              Selected: {formData.tools.length} | Available: {availableTools.length} | Visible: {getVisibleTools().length}
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

      {/* Error Modal */}
      {showErrorModal && (
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#2d2d2d',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
            border: '2px solid #f44336'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#f44336', margin: '0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} /> {errorModalContent.title}
              </h2>
              <button
                onClick={() => setShowErrorModal(false)}
                style={{
                  backgroundColor: '#666',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
            
            <div style={{ color: '#fff', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px' }}>
                {errorModalContent.message}
              </p>
              
              {errorModalContent.details && errorModalContent.details.length > 0 && (
                <>
                  <h3 style={{ color: '#f44336', margin: '20px 0 12px 0' }}>Details:</h3>
                  <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                    {errorModalContent.details.map((detail, index) => (
                      <li key={index} style={{ marginBottom: '4px' }}>{detail}</li>
                    ))}
                  </ul>
                </>
              )}
              
              {errorModalContent.troubleshooting && errorModalContent.troubleshooting.length > 0 && (
                <>
                  <h3 style={{ color: '#4CAF50', margin: '20px 0 12px 0' }}>How to Fix:</h3>
                  <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                    {errorModalContent.troubleshooting.map((step, index) => (
                      <li key={index} style={{ marginBottom: '4px' }}>{step}</li>
                    ))}
                  </ul>
                </>
              )}
              
              <div style={{ 
                backgroundColor: '#1e1e1e', 
                padding: '12px', 
                borderRadius: '4px', 
                marginTop: '20px',
                border: '1px solid #f44336'
              }}>
                <p style={{ margin: '0', fontWeight: 'bold', color: '#f44336' }}>
                  Fix the issue above and try creating the agent again.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#2d2d2d',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflowY: 'auto',
            border: '1px solid #666'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: '0' }}>Agent Creation Guide</h2>
              <button
                onClick={() => setShowHelpModal(false)}
                style={{
                  backgroundColor: '#666',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
            
            <div style={{ color: '#ccc', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '16px' }}>Based on research from Anthropic and community best practices, here's what you need to capture:</p>
              
              <h3 style={{ color: '#4CAF50', margin: '20px 0 12px 0' }}><Target size={16} style={{ marginRight: '8px' }} />Core Identity & Boundaries</h3>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li><strong>Specific role</strong> - "Python debugging specialist" not "helpful assistant"</li>
                <li><strong>Clear capabilities</strong> - what it CAN do with examples</li>
                <li><strong>Explicit limitations</strong> - what it CANNOT or should not do</li>
                <li><strong>Success criteria</strong> - how to measure if it's working well</li>
              </ul>
              
              <h3 style={{ color: '#4CAF50', margin: '20px 0 12px 0' }}><Wrench size={16} style={{ marginRight: '8px' }} />Tool Usage Protocol</h3>
              <p style={{ marginBottom: '8px' }}>For each tool the agent can use:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li><strong>When</strong> to use it (specific triggers)</li>
                <li><strong>Why</strong> to use it (expected outcome)</li>
                <li><strong>How</strong> to use it (validation steps)</li>
                <li><strong>Fallbacks</strong> when tools fail</li>
              </ul>
              
              <h3 style={{ color: '#4CAF50', margin: '20px 0 12px 0' }}>🧠 Context Management</h3>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li><strong>What to remember</strong> (goals, user preferences, key decisions)</li>
                <li><strong>What to summarize</strong> (long conversations into key points)</li>
                <li><strong>What to forget</strong> (completed tasks, irrelevant details)</li>
                <li><strong>Size limits</strong> (prevent context explosion)</li>
              </ul>
              
              <h3 style={{ color: '#4CAF50', margin: '20px 0 12px 0' }}><AlertTriangle size={16} style={{ marginRight: '8px' }} />Error Handling & Safety</h3>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li><strong>Primary approach</strong> for normal operations</li>
                <li><strong>Fallback strategies</strong> when things go wrong</li>
                <li><strong>Safety constraints</strong> (Constitutional AI principles)</li>
                <li><strong>Escalation rules</strong> (when to ask humans for help)</li>
              </ul>
              
              <h3 style={{ color: '#f44336', margin: '20px 0 12px 0' }}>🚫 Avoid These Anti-Patterns</h3>
              <div style={{ backgroundColor: '#1e1e1e', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px 0' }}>❌ <strong>"God Agent"</strong> - trying to do everything</p>
                <p style={{ margin: '0 0 8px 0', color: '#4CAF50' }}>✅ <strong>Specialist</strong> - focused on specific domain</p>
                <p style={{ margin: '0 0 8px 0' }}>❌ <strong>Vague helper</strong> - "assists with tasks"</p>
                <p style={{ margin: '0 0 8px 0', color: '#4CAF50' }}>✅ <strong>Specific role</strong> - "analyzes Python code for security vulnerabilities"</p>
                <p style={{ margin: '0 0 8px 0' }}>❌ <strong>No boundaries</strong> - unlimited capabilities</p>
                <p style={{ margin: '0', color: '#4CAF50' }}>✅ <strong>Clear limits</strong> - "cannot execute code, only analyze"</p>
              </div>
              
              <h3 style={{ color: '#4CAF50', margin: '20px 0 12px 0' }}><Lightbulb size={16} style={{ marginRight: '8px' }} />Pro Tips</h3>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li><strong>Start specific</strong> - narrow focus beats broad capabilities</li>
                <li><strong>Plan for failure</strong> - what happens when tools don't work?</li>
                <li><strong>Validate everything</strong> - input, processing, output</li>
                <li><strong>Think production</strong> - will this work reliably at scale?</li>
                <li><strong>Human oversight</strong> - when should humans review decisions?</li>
              </ul>
              
              <h3 style={{ color: '#4CAF50', margin: '20px 0 12px 0' }}><BookOpen size={16} style={{ marginRight: '8px' }} />Example of Good Agent Definition</h3>
              <div style={{ backgroundColor: '#1e1e1e', padding: '12px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' }}>
                <p style={{ margin: '0 0 8px 0', color: '#4CAF50' }}>Role:</p>
                <p style={{ margin: '0 0 12px 0' }}>Python security code reviewer specializing in web application vulnerabilities</p>
                
                <p style={{ margin: '0 0 8px 0', color: '#4CAF50' }}>Capabilities:</p>
                <p style={{ margin: '0 0 12px 0' }}>• Static analysis for SQL injection, XSS, and authentication flaws<br/>• OWASP compliance checking with remediation suggestions<br/>• Dependency vulnerability assessment</p>
                
                <p style={{ margin: '0 0 8px 0', color: '#4CAF50' }}>Tool Usage:</p>
                <p style={{ margin: '0 0 12px 0' }}>• Read files completely before analysis<br/>• Grep for vulnerability patterns<br/>• Bash for security scanners when available</p>
                
                <p style={{ margin: '0 0 8px 0', color: '#4CAF50' }}>Limitations:</p>
                <p style={{ margin: '0 0 12px 0' }}>• Cannot modify code, only analyze and suggest<br/>• Escalates critical findings to security team<br/>• Never executes untrusted code</p>
                
                <p style={{ margin: '0 0 8px 0', color: '#4CAF50' }}>Success Criteria:</p>
                <p style={{ margin: '0' }}>• &gt;95% accuracy on known vulnerability patterns<br/>• &lt;5% false positive rate<br/>• Complete analysis within 5 minutes</p>
              </div>
              
              <div style={{ 
                backgroundColor: '#2a4d3a', 
                padding: '12px', 
                borderRadius: '4px', 
                marginTop: '20px',
                border: '1px solid #4CAF50'
              }}>
                <p style={{ margin: '0', fontWeight: 'bold' }}>Remember: Specialized agents that do one thing well consistently outperform generalist agents that try to do everything.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentCreator;