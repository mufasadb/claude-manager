import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import './UserConfiguration.css';

interface UserClaudeMdEditorProps {
  claudeMdContent: string;
  onRefresh: () => void;
}

const UserClaudeMdEditor: React.FC<UserClaudeMdEditorProps> = ({ 
  claudeMdContent, 
  onRefresh 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mdContent, setMdContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setMdContent(claudeMdContent || '# Claude Manager - User Documentation\n\nAdd your personal Claude configuration notes here...');
  }, [claudeMdContent]);

  const getPreviewLines = (content: string): string => {
    const lines = content.split('\n');
    if (lines.length <= 3) {
      return content;
    }
    return lines.slice(0, 3).join('\n') + '\n  ...';
  };

  const handleMdChange = (value: string) => {
    setMdContent(value);
    setSaveError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await ApiService.saveUserClaudeMd(mdContent);
      setIsEditing(false);
      onRefresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save CLAUDE.md');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSaveError(null);
    // Reset to original content
    setMdContent(claudeMdContent || '# Claude Manager - User Documentation\n\nAdd your personal Claude configuration notes here...');
  };

  const handleExpand = () => {
    setIsExpanded(true);
    setIsEditing(true);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    setIsEditing(false);
    setSaveError(null);
  };

  return (
    <div className="config-file">
      <div className="config-header">
        <h4>CLAUDE.md</h4>
        {!isExpanded && (
          <button
            onClick={handleExpand}
            className="expand-btn"
            title="Edit CLAUDE.md"
          >
            ✏️
          </button>
        )}
      </div>

      {!isExpanded ? (
        <div className="json-preview">
          <pre className="json-content">{getPreviewLines(mdContent)}</pre>
        </div>
      ) : (
        <div className="json-editor-container">
          <div className="editor-header">
            <span className="editor-title">Editing CLAUDE.md</span>
            <div className="editor-actions">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="save-btn"
                title="Save changes"
              >
                {isSaving ? '💾...' : '💾 Save'}
              </button>
              <button
                onClick={handleCancel}
                className="cancel-btn"
                title="Cancel and close"
              >
                ✗ Cancel
              </button>
              <button
                onClick={handleCollapse}
                className="collapse-btn"
                title="Collapse editor"
              >
                ⬆️
              </button>
            </div>
          </div>
          
          {saveError && (
            <div className="validation-error">
              <strong>Save Error:</strong> {saveError}
            </div>
          )}
          
          <div className="json-editor">
            <textarea
              value={mdContent}
              onChange={(e) => handleMdChange(e.target.value)}
              className="json-textarea"
              placeholder="# Claude Manager - User Documentation

Add your personal Claude configuration notes, best practices, and project guidelines here...

## My Workflow
- Document your typical development process
- Note your preferred settings and configurations
- Track your project organization patterns

## Best Practices
- Share insights across projects
- Document lessons learned
- Keep track of useful hooks and MCP servers"
              spellCheck={true}
            />
          </div>
          
          <div className="editor-footer">
            <div className="format-info">
              💡 Tip: Use Markdown syntax for headers (#), lists (-), code blocks (```), and links ([text](url))
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserClaudeMdEditor;