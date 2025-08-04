import React, { useState, useEffect } from 'react';
import HookBuilder from '../HookBuilder/HookBuilder';
import './HookManagement.css';

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

interface HookManagementProps {
  scope: 'user' | 'project';
  projectName?: string;
}

const HookManagement: React.FC<HookManagementProps> = ({ scope, projectName }) => {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedHook, setSelectedHook] = useState<Hook | null>(null);
  const [showCode, setShowCode] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadHooks();
    loadStats();
  }, [scope, projectName]);

  const loadHooks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (projectName) {
        params.append('projectName', projectName);
      }
      
      const response = await fetch(`/api/hooks/list/${scope}?${params}`);
      if (response.ok) {
        const data = await response.json();
        setHooks(data.hooks || []);
      } else {
        setError('Failed to load hooks');
      }
    } catch (error) {
      console.error('Error loading hooks:', error);
      setError('Failed to load hooks');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/hooks/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading hook stats:', error);
    }
  };


  const handleToggleHook = async (hook: Hook) => {
    try {
      const response = await fetch(`/api/hooks/update/${scope}/${hook.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: scope === 'project' ? projectName : undefined,
          updates: { enabled: !hook.enabled }
        }),
      });

      if (response.ok) {
        setHooks(hooks.map(h => 
          h.id === hook.id ? { ...h, enabled: !h.enabled } : h
        ));
      } else {
        setError('Failed to update hook');
      }
    } catch (error) {
      console.error('Error updating hook:', error);
      setError('Failed to update hook');
    }
  };

  const handleDeleteHook = async (hook: Hook) => {
    if (!window.confirm(`Are you sure you want to delete the hook "${hook.name}"?`)) {
      return;
    }

    try {
      const params = new URLSearchParams();
      if (projectName) {
        params.append('projectName', projectName);
      }

      const response = await fetch(`/api/hooks/delete/${scope}/${hook.id}?${params}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setHooks(hooks.filter(h => h.id !== hook.id));
      } else {
        setError('Failed to delete hook');
      }
    } catch (error) {
      console.error('Error deleting hook:', error);
      setError('Failed to delete hook');
    }
  };

  const handleTestHook = async (hook: Hook) => {
    try {
      const response = await fetch('/api/hooks/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hookId: hook.id,
          scope,
          projectName: scope === 'project' ? projectName : undefined,
          mockEventData: {
            eventType: hook.eventType,
            toolName: 'test-tool',
            filePaths: ['/test/file.js']
          }
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`Hook test successful!\n\nResult: ${result.result}\nExecution time: ${result.executionTime}ms`);
      } else {
        alert(`Hook test failed!\n\nError: ${result.error}`);
      }
    } catch (error) {
      console.error('Error testing hook:', error);
      alert('Failed to test hook');
    }
  };

  const handleHookCreated = (newHook: Hook) => {
    setHooks([...hooks, newHook]);
    setShowBuilder(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString() + ' ' + 
           new Date(timestamp).toLocaleTimeString();
  };

  const getEventTypeColor = (eventType: string) => {
    const colors: Record<string, string> = {
      'PreToolUse': '#ff9800',
      'PostToolUse': '#4caf50',
      'Notification': '#2196f3',
      'Stop': '#9c27b0',
      'SubagentStop': '#607d8b'
    };
    return colors[eventType] || '#666';
  };

  if (showBuilder) {
    return (
      <HookBuilder
        scope={scope}
        projectName={projectName}
        onHookCreated={handleHookCreated}
        onClose={() => setShowBuilder(false)}
      />
    );
  }

  return (
    <div className="hook-management">
      <div className="hook-management-header">
        <div className="header-info">
          <h2>Hook Management - {scope === 'user' ? 'User Level' : `Project: ${projectName}`}</h2>
          {stats && (
            <div className="stats-summary">
              <span>Total Hooks: {stats.registry?.totalHooks || 0}</span>
              <span>Enabled: {stats.registry?.enabledHooks || 0}</span>
              {stats.eventService && (
                <span>Events Processed: {stats.eventService.eventsProcessed || 0}</span>
              )}
            </div>
          )}
        </div>
        
        <button 
          onClick={() => setShowBuilder(true)}
          className="create-hook-button"
        >
          + Create New Hook
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading hooks...</div>
      ) : hooks.length === 0 ? (
        <div className="empty-state">
          <h3>No hooks found</h3>
          <p>Create your first hook to start automating your Claude Code workflow!</p>
          <button 
            onClick={() => setShowBuilder(true)}
            className="create-first-hook-button"
          >
            Create Your First Hook
          </button>
        </div>
      ) : (
        <div className="hooks-list">
          {hooks.map((hook) => (
            <div key={hook.id} className={`hook-card ${!hook.enabled ? 'disabled' : ''}`}>
              <div className="hook-header">
                <div className="hook-title">
                  <h3>{hook.name}</h3>
                  <div className="hook-meta">
                    <span 
                      className="event-type"
                      style={{ backgroundColor: getEventTypeColor(hook.eventType) }}
                    >
                      {hook.eventType}
                    </span>
                    <span className="pattern">Pattern: {hook.pattern}</span>
                  </div>
                </div>
                
                <div className="hook-actions">
                  <button
                    onClick={() => handleToggleHook(hook)}
                    className={`toggle-button ${hook.enabled ? 'enabled' : 'disabled'}`}
                    title={hook.enabled ? 'Disable hook' : 'Enable hook'}
                  >
                    {hook.enabled ? '●' : '○'}
                  </button>
                  
                  <button
                    onClick={() => handleTestHook(hook)}
                    className="test-button"
                    title="Test hook"
                  >
                    ▷
                  </button>
                  
                  <button
                    onClick={() => setShowCode(showCode === hook.id ? null : hook.id)}
                    className="code-button"
                    title="View code"
                  >
                    {'</>'}
                  </button>
                  
                  <button
                    onClick={() => handleDeleteHook(hook)}
                    className="delete-button"
                    title="Delete hook"
                  >
                    ×
                  </button>
                </div>
              </div>

              {hook.description && (
                <div className="hook-description">
                  {hook.description}
                </div>
              )}

              <div className="hook-details">
                <span>Created: {formatDate(hook.createdAt)}</span>
                {hook.updatedAt !== hook.createdAt && (
                  <span>Updated: {formatDate(hook.updatedAt)}</span>
                )}
                <span>Generated by: {hook.generatedBy}</span>
              </div>

              {showCode === hook.id && (
                <div className="hook-code">
                  <div className="code-header">
                    <h4>Hook Code</h4>
                    <button 
                      onClick={() => setShowCode(null)}
                      className="close-code"
                    >
                      ×
                    </button>
                  </div>
                  <pre className="code-content">
                    {hook.code}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HookManagement;