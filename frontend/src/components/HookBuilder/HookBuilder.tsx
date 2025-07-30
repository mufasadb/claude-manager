import React, { useState, useEffect } from 'react';
import './HookBuilder.css';

interface Hook {
  id: string;
  name: string;
  eventType: string;
  pattern: string;
  code: string;
  enabled: boolean;
  description?: string;
  createdAt: number;
  updatedAt: number;
  generatedBy?: string;
}

interface HookBuilderProps {
  scope: 'user' | 'project';
  projectName?: string;
  onHookCreated?: (hook: Hook) => void;
  onClose?: () => void;
}

const HookBuilder: React.FC<HookBuilderProps> = ({ 
  scope, 
  projectName, 
  onHookCreated, 
  onClose 
}) => {
  const [step, setStep] = useState<'setup' | 'generate' | 'review' | 'save'>('setup');
  const [hookConfig, setHookConfig] = useState({
    name: '',
    eventType: 'Notification',
    pattern: '*',
    description: ''
  });
  const [generatedCode, setGeneratedCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, any>>({});

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await fetch('/api/hooks/templates');
      if (response.ok) {
        const templatesData = await response.json();
        setTemplates(templatesData);
      }
    } catch (error) {
      console.error('Failed to load hook templates:', error);
    }
  };

  const handleGenerateHook = async () => {
    if (!hookConfig.description.trim()) {
      setError('Please provide a description of what you want the hook to do');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/hooks/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope,
          eventType: hookConfig.eventType,
          pattern: hookConfig.pattern,
          description: hookConfig.description,
          projectName: scope === 'project' ? projectName : undefined
        }),
      });

      const result = await response.json();

      if (result.success) {
        setGeneratedCode(result.code);
        setStep('review');
      } else {
        setError(result.error || 'Failed to generate hook');
      }
    } catch (error) {
      console.error('Hook generation failed:', error);
      setError('Failed to generate hook. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveHook = async () => {
    if (!hookConfig.name.trim()) {
      setError('Please provide a name for your hook');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/hooks/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope,
          projectName: scope === 'project' ? projectName : undefined,
          hookConfig: {
            name: hookConfig.name,
            eventType: hookConfig.eventType,
            pattern: hookConfig.pattern,
            code: generatedCode,
            description: hookConfig.description,
            enabled: true,
            generatedBy: 'claude-code'
          }
        }),
      });

      const result = await response.json();

      if (result.success) {
        onHookCreated?.(result.hook);
        setStep('save');
      } else {
        setError(result.error || 'Failed to save hook');
      }
    } catch (error) {
      console.error('Hook save failed:', error);
      setError('Failed to save hook. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateSelect = (templateKey: string) => {
    const template = templates[templateKey];
    if (template) {
      setHookConfig({
        name: template.name,
        eventType: template.eventType,
        pattern: template.pattern,
        description: template.description
      });
    }
  };

  const renderSetupStep = () => (
    <div className="hook-setup">
      <h3>Create New Hook</h3>
      
      <div className="template-section">
        <h4>Quick Start Templates</h4>
        <div className="template-grid">
          {Object.entries(templates).map(([key, template]) => (
            <div 
              key={key} 
              className="template-card"
              onClick={() => handleTemplateSelect(key)}
            >
              <h5>{template.name}</h5>
              <p>{template.description}</p>
              <span className="template-event-type">{template.eventType}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hook-config">
        <div className="form-group">
          <label htmlFor="hookName">Hook Name:</label>
          <input
            id="hookName"
            type="text"
            value={hookConfig.name}
            onChange={(e) => setHookConfig({ ...hookConfig, name: e.target.value })}
            placeholder="Enter a name for your hook"
          />
        </div>

        <div className="form-group">
          <label htmlFor="eventType">Event Type:</label>
          <select
            id="eventType"
            value={hookConfig.eventType}
            onChange={(e) => setHookConfig({ ...hookConfig, eventType: e.target.value })}
          >
            <option value="PreToolUse">Pre-Tool Use</option>
            <option value="PostToolUse">Post-Tool Use</option>
            <option value="Notification">Notification</option>
            <option value="Stop">Task Stop</option>
            <option value="SubagentStop">Subagent Stop</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="pattern">Pattern Match:</label>
          <input
            id="pattern"
            type="text"
            value={hookConfig.pattern}
            onChange={(e) => setHookConfig({ ...hookConfig, pattern: e.target.value })}
            placeholder="* (all) or specific tool names like 'Write|Edit'"
          />
          <small>Match specific tools or files. Use * for all events.</small>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description:</label>
          <textarea
            id="description"
            value={hookConfig.description}
            onChange={(e) => setHookConfig({ ...hookConfig, description: e.target.value })}
            placeholder="Describe what you want this hook to do..."
            rows={4}
          />
          <small>Be specific about the behavior you want. Example: "Play a success sound and speak the notification text using TTS when any tool completes"</small>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="button-group">
        <button 
          onClick={handleGenerateHook} 
          disabled={generating || !hookConfig.description.trim()}
          className="generate-button"
        >
          {generating ? 'Generating...' : 'Generate Hook'}
        </button>
        {onClose && (
          <button onClick={onClose} className="cancel-button">
            Cancel
          </button>
        )}
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="hook-review">
      <h3>Review Generated Hook</h3>
      
      <div className="hook-info">
        <h4>{hookConfig.name}</h4>
        <p><strong>Event Type:</strong> {hookConfig.eventType}</p>
        <p><strong>Pattern:</strong> {hookConfig.pattern}</p>
        <p><strong>Description:</strong> {hookConfig.description}</p>
      </div>

      <div className="code-editor">
        <h4>Generated Code:</h4>
        <textarea
          value={generatedCode}
          onChange={(e) => setGeneratedCode(e.target.value)}
          rows={20}
          className="code-textarea"
        />
        <small>You can edit the generated code if needed.</small>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="button-group">
        <button 
          onClick={handleSaveHook} 
          disabled={saving}
          className="save-button"
        >
          {saving ? 'Saving...' : 'Save Hook'}
        </button>
        <button 
          onClick={() => setStep('setup')} 
          className="back-button"
        >
          Back to Setup
        </button>
        <button 
          onClick={handleGenerateHook} 
          disabled={generating}
          className="regenerate-button"
        >
          {generating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
    </div>
  );

  const renderSaveStep = () => (
    <div className="hook-saved">
      <div className="success-message">
        <h3>✅ Hook Created Successfully!</h3>
        <p>Your hook "{hookConfig.name}" has been created and is now active.</p>
        <p>It will trigger on <strong>{hookConfig.eventType}</strong> events matching the pattern <strong>{hookConfig.pattern}</strong>.</p>
      </div>

      <div className="button-group">
        <button 
          onClick={() => {
            setStep('setup');
            setHookConfig({ name: '', eventType: 'Notification', pattern: '*', description: '' });
            setGeneratedCode('');
            setError(null);
          }} 
          className="create-another-button"
        >
          Create Another Hook
        </button>
        {onClose && (
          <button onClick={onClose} className="done-button">
            Done
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="hook-builder">
      <div className="hook-builder-content">
        {step === 'setup' && renderSetupStep()}
        {step === 'review' && renderReviewStep()}
        {step === 'save' && renderSaveStep()}
      </div>
    </div>
  );
};

export default HookBuilder;