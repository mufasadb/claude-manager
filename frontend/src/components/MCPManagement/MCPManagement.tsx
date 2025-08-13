import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { MCPTemplate, MCP, MCPState } from '../../types';
import './MCPManagement.css';

interface MCPManagementProps {
  scope: 'user' | 'project';
  projectPath?: string;
  onMCPUpdate?: (mcps: MCPState) => void;
  envVars?: Record<string, string>;
}

interface MCPFormData {
  name: string;
  command: string;
  transport: 'stdio' | 'sse' | 'http';
  envVars: Record<string, string>;
  args: string[];
}

const MCPManagement: React.FC<MCPManagementProps> = ({ scope, projectPath, onMCPUpdate, envVars = {} }) => {
  const [templates, setTemplates] = useState<Record<string, MCPTemplate>>({});
  const [mcps, setMcps] = useState<MCPState>({ active: {}, disabled: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [formData, setFormData] = useState<MCPFormData>({
    name: '',
    command: '',
    transport: 'stdio',
    envVars: {},
    args: []
  });
  const [loadingMCP, setLoadingMCP] = useState<string | null>(null);
  const [showAIDiscovery, setShowAIDiscovery] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [discoveryResult, setDiscoveryResult] = useState<any>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
    loadMCPs();
  }, [scope]);

  const loadTemplates = async () => {
    try {
      const templatesData = await ApiService.getMCPTemplates();
      setTemplates(templatesData);
    } catch (err) {
      setError(`Failed to load MCP templates: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const loadMCPs = async () => {
    try {
      setLoading(true);
      const mcpsData = await ApiService.listMCPs(scope);
      setMcps(mcpsData);
      if (onMCPUpdate) {
        onMCPUpdate(mcpsData);
      }
    } catch (err) {
      setError(`Failed to load MCPs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (templateKey: string) => {
    const template = templates[templateKey];
    if (template) {
      // Pre-fill environment variables that exist in the current scope
      const prefilledEnvVars: Record<string, string> = {};
      if (template.envVars) {
        template.envVars.forEach(envVar => {
          if (envVars[envVar.key]) {
            prefilledEnvVars[envVar.key] = envVars[envVar.key];
          }
        });
      }

      setSelectedTemplate(templateKey);
      setFormData({
        name: templateKey,
        command: template.command,
        transport: template.transport,
        envVars: prefilledEnvVars,
        args: [...template.args]
      });
    }
  };

  const handleFormChange = (field: keyof MCPFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEnvVarChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      envVars: {
        ...prev.envVars,
        [key]: value
      }
    }));
  };

  const handleAddMCP = async () => {
    if (!formData.name || !formData.command) {
      setError('Name and command are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setWarning(null);
      
      await ApiService.addMCP(scope, formData, projectPath);
      
      // Reset form
      setFormData({
        name: '',
        command: '',
        transport: 'stdio',
        envVars: {},
        args: []
      });
      setSelectedTemplate('');
      setShowAddForm(false);
      
      // Reload MCPs
      await loadMCPs();
    } catch (err) {
      setError(`Failed to add MCP: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableMCP = async (name: string) => {
    try {
      setLoadingMCP(name);
      setError(null);
      setWarning(null);
      
      await ApiService.enableMCP(scope, name, projectPath);
      await loadMCPs();
    } catch (err) {
      setError(`Failed to enable MCP: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingMCP(null);
    }
  };

  const handleDisableMCP = async (name: string) => {
    try {
      setLoadingMCP(name);
      setError(null);
      setWarning(null);
      
      const result = await ApiService.disableMCP(scope, name, projectPath);
      await loadMCPs();
      
      if (result.warning) {
        setWarning(result.warning);
      }
    } catch (err) {
      setError(`Failed to disable MCP: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingMCP(null);
    }
  };

  const handleRemoveMCP = async (name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the MCP "${name}"?`)) {
      return;
    }

    try {
      setLoadingMCP(name);
      setError(null);
      setWarning(null);
      
      const result = await ApiService.removeMCP(scope, name, projectPath);
      await loadMCPs();
      
      if (result.warning) {
        setWarning(result.warning);
      }
    } catch (err) {
      setError(`Failed to remove MCP: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingMCP(null);
    }
  };

  const handleViewLogs = async (name: string) => {
    try {
      setError(null);
      const logsData = await ApiService.getMCPLogs(scope, name, projectPath);
      
      if (logsData.success) {
        // Create a new window/tab to display logs
        const logWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
        if (logWindow) {
          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>MCP Logs: ${name}</title>
              <style>
                body { font-family: 'Monaco', 'Consolas', monospace; padding: 20px; background: #1a1a1a; color: #e0e0e0; }
                .header { background: #333; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .header h1 { margin: 0; color: #4CAF50; }
                .stats { color: #888; margin-top: 5px; }
                .debug-section { background: #2a2a2a; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .debug-title { color: #FF9800; font-weight: bold; margin-bottom: 10px; }
                .debug-info { color: #ccc; font-size: 0.9em; margin-bottom: 5px; }
                .log-entry { background: #2d2d2d; border-left: 4px solid #4CAF50; padding: 15px; margin-bottom: 15px; border-radius: 4px; }
                .log-header { color: #4CAF50; font-weight: bold; margin-bottom: 8px; }
                .log-content { color: #e0e0e0; }
                .timestamp { color: #888; font-size: 0.9em; }
                .session-id { color: #66B3FF; font-size: 0.9em; }
                .no-logs { text-align: center; color: #888; padding: 40px; }
                .no-logs-debug { background: #332a2a; color: #ff9999; padding: 20px; border-radius: 8px; margin: 20px 0; }
                pre { background: #1a1a1a; padding: 10px; border-radius: 4px; overflow-x: auto; }
                .json { white-space: pre-wrap; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>📋 MCP Server Logs: ${name}</h1>
                <div class="stats">
                  <strong>Scope:</strong> ${logsData.scope} | 
                  <strong>Project:</strong> ${logsData.projectPath} | 
                  <strong>Total Logs:</strong> ${logsData.totalFound}
                </div>
              </div>
              
              ${logsData.debugInfo && logsData.debugInfo.length > 0 ? `
                <div class="debug-section">
                  <div class="debug-title">🔍 Debug Information</div>
                  ${logsData.debugInfo.map(info => `<div class="debug-info">${info}</div>`).join('')}
                  
                  ${logsData.searchedDirectories && logsData.searchedDirectories.length > 0 ? `
                    <div style="margin-top: 10px;">
                      <strong>Searched Directories:</strong><br>
                      ${logsData.searchedDirectories.map(dir => `<div class="debug-info">📁 ${dir}</div>`).join('')}
                    </div>
                  ` : ''}
                  
                  ${logsData.availableMCPs && logsData.availableMCPs.length > 0 ? `
                    <div style="margin-top: 10px;">
                      <strong>Available User MCPs:</strong> ${logsData.availableMCPs.join(', ')}
                    </div>
                  ` : ''}
                  
                  ${logsData.projectMCPs && logsData.projectMCPs.length > 0 ? `
                    <div style="margin-top: 10px;">
                      <strong>Project MCPs:</strong> ${logsData.projectMCPs.join(', ')}
                    </div>
                  ` : ''}
                </div>
              ` : ''}
              
              ${logsData.logs.length > 0 ? 
                logsData.logs.map(log => `
                  <div class="log-entry">
                    <div class="log-header">
                      <span class="timestamp">${new Date(log.timestamp).toLocaleString()}</span> | 
                      <span class="session-id">Session: ${log.sessionId}</span> | 
                      <span>Type: ${log.type}</span> |
                      <span>Source: ${log.source || 'unknown'}</span>
                    </div>
                    <div class="log-content">
                      <pre class="json">${JSON.stringify(log.content, null, 2)}</pre>
                    </div>
                  </div>
                `).join('')
                : 
                `<div class="no-logs-debug">
                   <h3>No logs found for MCP server: ${name}</h3>
                   <p>This might be because:</p>
                   <ul>
                     <li>The MCP server hasn't been used in Claude Code sessions yet</li>
                     <li>Claude Code is storing logs in a different location than expected</li>
                     <li>The MCP server name doesn't match what's in the logs</li>
                     <li>Logs are stored in a different format</li>
                   </ul>
                   <p>Check the debug information above for more details.</p>
                 </div>`
              }
              
              <div style="margin-top: 40px; text-align: center; color: #666;">
                <p>Primary Log Directory: ${logsData.logDirectory}</p>
              </div>
            </body>
            </html>
          `;
          
          logWindow.document.write(html);
          logWindow.document.close();
        } else {
          setError('Unable to open log window. Please check popup blockers.');
        }
      } else {
        setError('Failed to fetch logs for this MCP server');
      }
    } catch (err) {
      setError(`Failed to view logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const renderEnvVarInputs = () => {
    if (!selectedTemplate) return null;
    
    const template = templates[selectedTemplate];
    if (!template.envVars || template.envVars.length === 0) return null;

    return (
      <div className="env-vars-section">
        <h4>Environment Variables</h4>
        {template.envVars.map((envVar) => (
          <div key={envVar.key} className="form-group">
            <label htmlFor={envVar.key}>
              {envVar.key} {envVar.required && <span className="required">*</span>}
            </label>
            <input
              type={envVar.key.toLowerCase().includes('password') || 
                    envVar.key.toLowerCase().includes('token') || 
                    envVar.key.toLowerCase().includes('key') ? 'password' : 'text'}
              id={envVar.key}
              value={formData.envVars[envVar.key] || ''}
              onChange={(e) => handleEnvVarChange(envVar.key, e.target.value)}
              placeholder={envVar.description}
              required={envVar.required}
            />
            <small>{envVar.description}</small>
          </div>
        ))}
      </div>
    );
  };

  const renderMCPRow = (mcp: MCP, isActive: boolean) => (
    <tr key={mcp.name} className={isActive ? 'active-mcp' : 'disabled-mcp'}>
      <td>{mcp.name}</td>
      <td>{mcp.command}</td>
      <td>{mcp.transport}</td>
      <td>
        {mcp.envVars && Object.keys(mcp.envVars).length > 0 ? (
          <span className="env-count">{Object.keys(mcp.envVars).length} vars</span>
        ) : (
          <span className="no-env">None</span>
        )}
      </td>
      <td>
        <span className={`status ${isActive ? 'enabled' : 'disabled'}`}>
          {isActive ? 'Enabled' : 'Disabled'}
        </span>
      </td>
      <td className="actions">
        {isActive ? (
          <button
            onClick={() => handleDisableMCP(mcp.name)}
            disabled={loadingMCP === mcp.name}
            className="btn-disable"
          >
            {loadingMCP === mcp.name ? '...' : 'Disable'}
          </button>
        ) : (
          <button
            onClick={() => handleEnableMCP(mcp.name)}
            disabled={loadingMCP === mcp.name}
            className="btn-enable"
          >
            {loadingMCP === mcp.name ? '...' : 'Enable'}
          </button>
        )}
        <button
          onClick={() => handleViewLogs(mcp.name)}
          className="btn-logs"
          title={`View logs for ${mcp.name}`}
        >
          📋 Logs
        </button>
        <button
          onClick={() => handleRemoveMCP(mcp.name)}
          disabled={loadingMCP === mcp.name}
          className="btn-delete"
        >
          {loadingMCP === mcp.name ? '...' : 'Delete'}
        </button>
      </td>
    </tr>
  );

  const handleAIDiscovery = async () => {
    if (!aiDescription.trim()) {
      setError('Please describe what kind of MCP server you need');
      return;
    }

    try {
      setDiscoveryLoading(true);
      setError(null);
      setDiscoveryResult(null);

      const result = await ApiService.discoverMCP(aiDescription, 'openrouter');
      setDiscoveryResult(result);

      if (!result.success) {
        setError(result.error || 'Failed to discover MCP server');
      }
    } catch (err) {
      setError(`Discovery failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleAddDiscoveredMCP = async () => {
    if (!discoveryResult?.data?.template) {
      setError('No template to add');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setWarning(null);

      const result = await ApiService.addDiscoveredMCP(scope, discoveryResult.data.template, projectPath);
      
      if (result.success) {
        await loadMCPs();
        if (onMCPUpdate) {
          onMCPUpdate(mcps);
        }
        
        // Close the AI discovery form
        setShowAIDiscovery(false);
        setAiDescription('');
        setDiscoveryResult(null);
        
        if (result.requiresEnvVars) {
          setError(`MCP server added but requires environment variables. Please configure: ${result.template.envVars?.map((v: any) => v.key).join(', ')}`);
        }
      } else {
        setError(result.error || 'Failed to add discovered MCP server');
      }
    } catch (err) {
      setError(`Failed to add MCP: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mcp-management">
      <div className="mcp-header">
        <h3>MCP Servers ({scope === 'user' ? 'User Level' : 'Project Level'})</h3>
        <div className="header-buttons">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary"
            disabled={loading}
          >
            {showAddForm ? 'Cancel' : 'Add MCP Server'}
          </button>
          <button
            onClick={() => setShowAIDiscovery(!showAIDiscovery)}
            className="btn-secondary"
            disabled={loading || discoveryLoading}
          >
            {showAIDiscovery ? 'Cancel AI' : 'Add with AI 🤖'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="close-error">×</button>
        </div>
      )}

      {warning && (
        <div className="warning-message">
          {warning}
          <button onClick={() => setWarning(null)} className="close-warning">×</button>
        </div>
      )}

      {showAIDiscovery && (
        <div className="ai-discovery-form">
          <h4>AI-Powered MCP Discovery 🤖</h4>
          <p>Describe what kind of MCP server you need, and our AI will find and configure it for you!</p>
          
          <div className="form-group">
            <label htmlFor="ai-description">What do you need?</label>
            <textarea
              id="ai-description"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder="e.g., 'I need an MCP server to connect to my PostgreSQL database' or 'I want to integrate with Notion workspace' or 'I need browser automation for testing'"
              rows={3}
              disabled={discoveryLoading}
            />
          </div>

          <div className="form-actions">
            <button
              onClick={handleAIDiscovery}
              disabled={discoveryLoading || !aiDescription.trim()}
              className="btn-primary"
            >
              {discoveryLoading ? 'Searching...' : 'Find MCP Server'}
            </button>
            <button
              onClick={() => {
                setShowAIDiscovery(false);
                setAiDescription('');
                setDiscoveryResult(null);
              }}
              className="btn-secondary"
              disabled={discoveryLoading}
            >
              Cancel
            </button>
          </div>

          {discoveryResult && (
            <div className="discovery-result">
              {discoveryResult.success ? (
                <div className="success-result">
                  <h5>✅ Found: {discoveryResult.data.template.template.name}</h5>
                  <p><strong>Description:</strong> {discoveryResult.data.template.template.description}</p>
                  <p><strong>Command:</strong> {discoveryResult.data.template.template.command} {discoveryResult.data.template.template.args?.join(' ')}</p>
                  
                  {discoveryResult.data.template.template.envVars && discoveryResult.data.template.template.envVars.length > 0 && (
                    <div className="env-vars-needed">
                      <p><strong>Environment Variables Required:</strong></p>
                      <ul>
                        {discoveryResult.data.template.template.envVars.map((envVar: any, idx: number) => (
                          <li key={idx}>
                            <strong>{envVar.key}</strong>: {envVar.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <p><small>Attempts: {discoveryResult.data.attempts}, Search History: {discoveryResult.data.searchHistory?.join(', ')}</small></p>
                  
                  <button
                    onClick={handleAddDiscoveredMCP}
                    disabled={loading}
                    className="btn-success"
                  >
                    {loading ? 'Adding...' : 'Add This MCP Server'}
                  </button>
                </div>
              ) : (
                <div className="error-result">
                  <h5>❌ Discovery Failed</h5>
                  <p>{discoveryResult.error}</p>
                  {discoveryResult.searchHistory && discoveryResult.searchHistory.length > 0 && (
                    <p><small>Tried: {discoveryResult.searchHistory.join(', ')}</small></p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="add-mcp-form">
          <h4>Add MCP Server</h4>
          
          <div className="template-selector">
            <label htmlFor="template-select">Quick Template:</label>
            <select
              id="template-select"
              value={selectedTemplate}
              onChange={(e) => handleTemplateSelect(e.target.value)}
            >
              <option value="">Custom MCP Server</option>
              {Object.entries(templates).map(([key, template]) => (
                <option key={key} value={key}>
                  {template.name} - {template.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="mcp-name">Name *</label>
            <input
              type="text"
              id="mcp-name"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              placeholder="e.g., my-database"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="mcp-command">Command *</label>
            <input
              type="text"
              id="mcp-command"
              value={formData.command}
              onChange={(e) => handleFormChange('command', e.target.value)}
              placeholder="e.g., npx @supabase/mcp-server"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="mcp-transport">Transport</label>
            <select
              id="mcp-transport"
              value={formData.transport}
              onChange={(e) => handleFormChange('transport', e.target.value as 'stdio' | 'sse' | 'http')}
            >
              <option value="stdio">STDIO</option>
              <option value="sse">SSE</option>
              <option value="http">HTTP</option>
            </select>
          </div>

          {renderEnvVarInputs()}

          <div className="form-actions">
            <button
              onClick={handleAddMCP}
              disabled={loading || !formData.name || !formData.command}
              className="btn-primary"
            >
              {loading ? 'Adding...' : 'Add MCP Server'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setSelectedTemplate('');
                setFormData({
                  name: '',
                  command: '',
                  transport: 'stdio',
                  envVars: {},
                  args: []
                });
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mcp-list">
        {loading && !showAddForm ? (
          <div className="loading">Loading MCPs...</div>
        ) : (
          <table className="mcp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Command</th>
                <th>Transport</th>
                <th>Env Vars</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(mcps.active).map((mcp) => renderMCPRow(mcp, true))}
              {Object.values(mcps.disabled).map((mcp) => renderMCPRow(mcp, false))}
              {Object.keys(mcps.active).length === 0 && Object.keys(mcps.disabled).length === 0 && (
                <tr>
                  <td colSpan={6} className="no-mcps">
                    No MCP servers configured. Click "Add MCP Server" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MCPManagement;