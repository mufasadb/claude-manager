import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import './ClaudeMdEditor.css';
import { Edit3, Save, X, ChevronUp, Lightbulb } from 'lucide-react';

interface ClaudeMdEditorProps {
  projectPath: string;
  claudeMdContent: string;
  onRefresh: () => void;
}

const ClaudeMdEditor: React.FC<ClaudeMdEditorProps> = ({ 
  projectPath, 
  claudeMdContent, 
  onRefresh 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mdContent, setMdContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setMdContent(claudeMdContent || '# Claude Manager Project\n\nAdd your project documentation here...');
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
      await ApiService.saveClaudeMd(projectPath, mdContent);
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
    setMdContent(claudeMdContent || '# Claude Manager Project\n\nAdd your project documentation here...');
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
    <div className="claude-md-editor">
      <div className="config-file">
        <div className="config-header">
          <h4>CLAUDE.md</h4>
          {!isExpanded && (
            <button
              onClick={handleExpand}
              className="expand-btn"
              title="Edit CLAUDE.md"
            >
              <Edit3 size={14} />
            </button>
          )}
        </div>

        {!isExpanded ? (
          <div className="md-preview">
            <pre className="md-content">{getPreviewLines(mdContent)}</pre>
          </div>
        ) : (
          <div className="md-editor-container">
            <div className="editor-header">
              <span className="editor-title">Editing CLAUDE.md</span>
              <div className="editor-actions">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="save-btn"
                  title="Save changes"
                >
                  {isSaving ? <><Save size={14} />...</> : <><Save size={14} style={{ marginRight: '4px' }} />Save</>}
                </button>
                <button
                  onClick={handleCancel}
                  className="cancel-btn"
                  title="Cancel and close"
                >
                  <X size={14} style={{ marginRight: '4px' }} />Cancel
                </button>
                <button
                  onClick={handleCollapse}
                  className="collapse-btn"
                  title="Collapse editor"
                >
                  <ChevronUp size={14} />
                </button>
              </div>
            </div>
            
            {saveError && (
              <div className="save-error">
                <strong>Save Error:</strong> {saveError}
              </div>
            )}
            
            <div className="md-editor">
              <textarea
                value={mdContent}
                onChange={(e) => handleMdChange(e.target.value)}
                className="md-textarea"
                placeholder="# Project Documentation

Add your project documentation, architecture notes, and development guidelines here...

## Getting Started
- Installation instructions
- Development setup
- Usage examples

## Architecture
- System overview
- Key components
- Data flow"
                spellCheck={true}
              />
            </div>
            
            <div className="editor-footer">
              <div className="format-info">
                <Lightbulb size={16} style={{ marginRight: '6px' }} />Tip: Use Markdown syntax for headers (#), lists (-), code blocks (```), and links ([text](url))
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClaudeMdEditor;