import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { ApiService } from '../../services/ApiService';
import { SlashCommandFormData, SlashCommand } from '../../types';
import { Clock, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

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
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [commandContent, setCommandContent] = useState<Record<string, string>>({});
  const [loadingContent, setLoadingContent] = useState<Record<string, boolean>>({});

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

  const handleToggleContent = async (command: SlashCommand) => {
    const commandKey = command.relativePath;
    
    if (expandedCommand === commandKey) {
      // Collapse if already expanded
      setExpandedCommand(null);
      return;
    }
    
    // Expand and load content if not already loaded
    setExpandedCommand(commandKey);
    
    if (!commandContent[commandKey]) {
      setLoadingContent(prev => ({ ...prev, [commandKey]: true }));
      
      try {
        const result = await ApiService.getSlashCommandContent(
          formData.scope,
          command.relativePath,
          formData.scope === 'project' ? formData.projectName : undefined
        );
        
        if (result.success && result.content) {
          setCommandContent(prev => ({ ...prev, [commandKey]: result.content || '' }));
        } else {
          setCommandContent(prev => ({ ...prev, [commandKey]: 'Error: Could not load command content' }));
        }
      } catch (error) {
        setCommandContent(prev => ({ 
          ...prev, 
          [commandKey]: `Error: ${error instanceof Error ? error.message : 'Failed to load content'}` 
        }));
      } finally {
        setLoadingContent(prev => ({ ...prev, [commandKey]: false }));
      }
    }
  };

  const processMarkdownContent = (rawContent: string) => {
    // Remove YAML frontmatter if present
    const yamlFrontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
    const contentWithoutFrontmatter = rawContent.replace(yamlFrontmatterRegex, '');
    return contentWithoutFrontmatter.trim();
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
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {existingCommands.map((cmd, index) => {
                const isExpanded = expandedCommand === cmd.relativePath;
                const isLoadingContent = loadingContent[cmd.relativePath];
                const content = commandContent[cmd.relativePath];
                
                return (
                  <div key={index} style={{ 
                    marginBottom: '8px', 
                    backgroundColor: '#333', 
                    borderRadius: '4px'
                  }}>
                    {/* Command header */}
                    <div style={{
                      padding: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start'
                    }}>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => handleToggleContent(cmd)}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          marginBottom: '4px'
                        }}>
                          {isExpanded ? <ChevronDown size={16} color="#888" /> : <ChevronRight size={16} color="#888" />}
                          <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                            /{cmd.category ? `${cmd.category}:${cmd.name}` : cmd.name}
                          </div>
                        </div>
                        <div style={{ color: '#ccc', fontSize: '14px', marginLeft: '24px' }}>
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
                        {deletingCommand === cmd.relativePath ? <Clock size={14} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                    
                    {/* Command content */}
                    {isExpanded && (
                      <div style={{
                        borderTop: '1px solid #444',
                        padding: '12px',
                        backgroundColor: '#2a2a2a'
                      }}>
                        {isLoadingContent ? (
                          <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                            Loading command content...
                          </div>
                        ) : content ? (
                          <div style={{
                            overflow: 'auto',
                            maxHeight: '400px',
                            padding: '12px',
                            backgroundColor: '#1e1e1e',
                            borderRadius: '4px',
                            border: '1px solid #444'
                          }}>
                            <ReactMarkdown
                              components={{
                                h1: ({children}) => <h1 style={{color: '#fff', fontSize: '24px', marginTop: '0', marginBottom: '16px', borderBottom: '2px solid #4CAF50', paddingBottom: '8px'}}>{children}</h1>,
                                h2: ({children}) => <h2 style={{color: '#fff', fontSize: '20px', marginTop: '24px', marginBottom: '12px', borderBottom: '1px solid #666', paddingBottom: '6px'}}>{children}</h2>,
                                h3: ({children}) => <h3 style={{color: '#fff', fontSize: '18px', marginTop: '20px', marginBottom: '10px'}}>{children}</h3>,
                                h4: ({children}) => <h4 style={{color: '#fff', fontSize: '16px', marginTop: '16px', marginBottom: '8px'}}>{children}</h4>,
                                h5: ({children}) => <h5 style={{color: '#fff', fontSize: '14px', marginTop: '14px', marginBottom: '6px'}}>{children}</h5>,
                                h6: ({children}) => <h6 style={{color: '#fff', fontSize: '13px', marginTop: '12px', marginBottom: '4px'}}>{children}</h6>,
                                p: ({children}) => <p style={{color: '#ddd', lineHeight: '1.6', marginBottom: '12px'}}>{children}</p>,
                                code: ({children}) => <code style={{backgroundColor: '#333', color: '#f8f8f2', padding: '2px 4px', borderRadius: '3px', fontSize: '13px', fontFamily: 'Monaco, "Courier New", monospace'}}>{children}</code>,
                                pre: ({children}) => <pre style={{backgroundColor: '#2a2a2a', color: '#f8f8f2', padding: '12px', borderRadius: '4px', overflow: 'auto', border: '1px solid #444', fontSize: '13px', lineHeight: '1.4', fontFamily: 'Monaco, "Courier New", monospace'}}>{children}</pre>,
                                ul: ({children}) => <ul style={{color: '#ddd', marginLeft: '20px', marginBottom: '12px'}}>{children}</ul>,
                                ol: ({children}) => <ol style={{color: '#ddd', marginLeft: '20px', marginBottom: '12px'}}>{children}</ol>,
                                li: ({children}) => <li style={{marginBottom: '4px'}}>{children}</li>,
                                blockquote: ({children}) => <blockquote style={{borderLeft: '4px solid #4CAF50', paddingLeft: '16px', margin: '16px 0', fontStyle: 'italic', color: '#ccc'}}>{children}</blockquote>,
                                a: ({children, href}) => <a href={href} style={{color: '#4CAF50', textDecoration: 'underline'}} target="_blank" rel="noopener noreferrer">{children}</a>,
                                strong: ({children}) => <strong style={{color: '#fff', fontWeight: 'bold'}}>{children}</strong>,
                                em: ({children}) => <em style={{color: '#ccc', fontStyle: 'italic'}}>{children}</em>,
                                hr: () => <hr style={{border: 'none', borderTop: '1px solid #666', margin: '20px 0'}} />,
                                table: ({children}) => <table style={{borderCollapse: 'collapse', width: '100%', marginBottom: '16px', border: '1px solid #666'}}>{children}</table>,
                                thead: ({children}) => <thead style={{backgroundColor: '#333'}}>{children}</thead>,
                                tbody: ({children}) => <tbody>{children}</tbody>,
                                tr: ({children}) => <tr style={{borderBottom: '1px solid #666'}}>{children}</tr>,
                                th: ({children}) => <th style={{color: '#fff', padding: '8px', textAlign: 'left', borderRight: '1px solid #666'}}>{children}</th>,
                                td: ({children}) => <td style={{color: '#ddd', padding: '8px', borderRight: '1px solid #666'}}>{children}</td>
                              }}
                            >
                              {processMarkdownContent(content)}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div style={{ color: '#888', fontStyle: 'italic' }}>
                            Click to load content...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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