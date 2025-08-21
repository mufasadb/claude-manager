import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import UserClaudeMdEditor from './UserClaudeMdEditor';
import './UserConfiguration.css';
import { Edit3, Save, X, ChevronUp, Lightbulb } from 'lucide-react';

interface UserConfigurationProps {
  userConfig: any;
  onRefresh: () => void;
}

const UserConfiguration: React.FC<UserConfigurationProps> = ({ userConfig, onRefresh }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (userConfig?.settings) {
      setJsonContent(JSON.stringify(userConfig.settings, null, 2));
    } else {
      setJsonContent('{}');
    }
  }, [userConfig]);

  const getPreviewLines = (content: string): string => {
    const lines = content.split('\n');
    if (lines.length <= 3) {
      return content;
    }
    return lines.slice(0, 3).join('\n') + '\n  ...';
  };

  const validateJson = (content: string): boolean => {
    try {
      JSON.parse(content);
      setValidationError(null);
      return true;
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid JSON format');
      return false;
    }
  };

  const handleJsonChange = (value: string) => {
    setJsonContent(value);
    if (value.trim()) {
      validateJson(value);
    } else {
      setValidationError(null);
    }
  };

  const handleSave = async () => {
    if (!validateJson(jsonContent)) {
      return;
    }

    setIsSaving(true);
    try {
      const parsedSettings = JSON.parse(jsonContent);
      await ApiService.updateUserSettings(parsedSettings);
      setIsEditing(false);
      onRefresh();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValidationError(null);
    // Reset to original content
    if (userConfig?.settings) {
      setJsonContent(JSON.stringify(userConfig.settings, null, 2));
    } else {
      setJsonContent('{}');
    }
  };

  const handleExpand = () => {
    setIsExpanded(true);
    setIsEditing(true);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    setIsEditing(false);
    setValidationError(null);
  };

  return (
    <div className="user-configuration">
      <UserClaudeMdEditor
        claudeMdContent={userConfig?.memory || ''}
        onRefresh={onRefresh}
      />
      
      <div className="config-file">
        <div className="config-header">
          <h4>settings.json</h4>
          {!isExpanded && (
            <button
              onClick={handleExpand}
              className="expand-btn"
              title="Edit settings.json"
            >
              <Edit3 size={14} />
            </button>
          )}
        </div>

        {!isExpanded ? (
          <div className="json-preview">
            <pre className="json-content">{getPreviewLines(jsonContent)}</pre>
          </div>
        ) : (
          <div className="json-editor-container">
            <div className="editor-header">
              <span className="editor-title">Editing settings.json</span>
              <div className="editor-actions">
                <button
                  onClick={handleSave}
                  disabled={!!validationError || isSaving}
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
            
            {validationError && (
              <div className="validation-error">
                <strong>JSON Error:</strong> {validationError}
              </div>
            )}
            
            <div className="json-editor">
              <textarea
                value={jsonContent}
                onChange={(e) => handleJsonChange(e.target.value)}
                className={`json-textarea ${validationError ? 'error' : ''}`}
                placeholder="Enter valid JSON configuration..."
                spellCheck={false}
              />
            </div>
            
            <div className="editor-footer">
              <div className="format-info">
                <Lightbulb size={16} style={{ marginRight: '6px' }} />Tip: Use proper JSON formatting with double quotes for keys and strings
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserConfiguration;