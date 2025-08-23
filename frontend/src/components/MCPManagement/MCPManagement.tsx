import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { MCPTemplate, MCP, MCPState } from '../../types';
import { Bot, ClipboardList, Folder, Plug, Trash2 } from 'lucide-react';
import InstallationInstructionModal from './InstallationInstructionModal';
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
  const [discoveredEnvVars, setDiscoveredEnvVars] = useState<Record<string, string>>({});
  const [showInstallationModal, setShowInstallationModal] = useState(false);
  const [installationInstructions, setInstallationInstructions] = useState<any>(null);

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
                <h1><ClipboardList size={16} style={{ marginRight: '8px' }} />MCP Server Logs: ${name}</h1>
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
                      ${logsData.searchedDirectories.map(dir => `<div class="debug-info"><Folder size={14} style="margin-right: 4px;" />${dir}</div>`).join('')}
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

  const renderMCPCard = (mcp: MCP, isActive: boolean) => (
    <div key={mcp.name} className={`mcp-card ${isActive ? 'active-mcp' : 'disabled-mcp'}`}>
      <div className="mcp-card-header">
        <div className="mcp-card-icon">
          <Plug size={16} />
        </div>
        <div className="mcp-card-info">
          <h4 className="mcp-card-name">{mcp.name}</h4>
          <p className="mcp-card-command">{mcp.command}</p>
          <div className={`mcp-status-badge ${isActive ? 'enabled' : 'disabled'}`}>
            {isActive ? 'Enabled' : 'Disabled'}
          </div>
        </div>
      </div>
      
      <div className="mcp-card-details">
        <div className="mcp-detail-item">
          <span className="mcp-detail-label">Transport</span>
          <span className="mcp-detail-value">{mcp.transport}</span>
        </div>
        <div className="mcp-detail-item">
          <span className="mcp-detail-label">Environment</span>
          <span className="mcp-detail-value">
            {mcp.envVars && Object.keys(mcp.envVars).length > 0 ? (
              <span className="env-count">{Object.keys(mcp.envVars).length} vars</span>
            ) : (
              <span className="no-env">None</span>
            )}
          </span>
        </div>
      </div>

      <div className="mcp-card-actions">
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
          <ClipboardList size={14} style={{ marginRight: '4px' }} /> Logs
        </button>
        <button
          onClick={() => handleRemoveMCP(mcp.name)}
          disabled={loadingMCP === mcp.name}
          className="btn-delete"
        >
          {loadingMCP === mcp.name ? '...' : 'Delete'}
        </button>
      </div>
    </div>
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

      const result = await ApiService.discoverMCP(aiDescription, 'openrouter', scope, projectPath);
      setDiscoveryResult(result);

      if (!result.success) {
        setError(result.error || 'Failed to discover MCP server');
        return;
      }

      // Check if this is a complex installation that requires manual steps
      if (result.data?.template?.installationType === 'complex') {
        setInstallationInstructions({
          mcpName: result.data.template.template.name,
          mcpDescription: result.data.template.template.description,
          installationSteps: result.data.template.template.installationSteps || [],
          environmentVars: result.data.template.template.envVars || [],
          finalCommand: result.data.template.template.finalCommand || {
            command: result.data.template.template.command || 'node',
            args: result.data.template.template.args || [],
            transport: result.data.template.template.transport || 'stdio'
          }
        });
        setShowInstallationModal(true);
      }
    } catch (err) {
      setError(`Discovery failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleCloseInstallationModal = () => {
    setShowInstallationModal(false);
    setInstallationInstructions(null);
  };

  const handleSaveAsTemplate = async (templateData: any) => {
    try {
      setError(null);
      const result = await ApiService.saveComplexTemplate(templateData);
      
      if (result.success) {
        setWarning(`Template "${result.templateName}" saved successfully! You can now find it in the MCP templates list.`);
        await loadTemplates(); // Reload templates to show the new one
        handleCloseInstallationModal();
      } else {
        setError(result.error || 'Failed to save template');
      }
    } catch (err) {
      setError(`Failed to save template: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDiscoveredEnvVarChange = (key: string, value: string) => {
    setDiscoveredEnvVars(prev => ({
      ...prev,
      [key]: value
    }));
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

      // Include environment variables in the template before sending
      const templateWithEnvVars = {
        ...discoveryResult.data.template,
        template: {
          ...discoveryResult.data.template.template,
          providedEnvVars: discoveredEnvVars
        }
      };

      const result = await ApiService.addDiscoveredMCP(scope, templateWithEnvVars, projectPath);
      
      if (result.success) {
        await loadMCPs();
        if (onMCPUpdate) {
          onMCPUpdate(mcps);
        }
        
        // Close the AI discovery form
        setShowAIDiscovery(false);
        setAiDescription('');
        setDiscoveryResult(null);
        setDiscoveredEnvVars({});
        
        if (result.mcpInstalled) {
          // MCP was successfully installed
          setError(null);
          setWarning(`✅ Success! MCP server "${result.templateName}" has been installed and is ready to use.`);
        } else if (result.requiresEnvVars) {
          // MCP template was added but needs environment variables
          setWarning(`⚠️ Template "${result.templateName}" added but requires environment variables. Please configure: ${result.envVars?.map((v: any) => v.key).join(', ')} then select it from the "Add MCP Server" dropdown.`);
        } else if (result.templateAdded) {
          // Template was added (fallback case)
          setWarning(`Template "${result.templateName}" has been created. You can now select it from the MCP templates dropdown.`);
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
            {showAIDiscovery ? 'Cancel AI' : (<><Bot size={16} style={{ marginRight: '4px' }} /> Add with AI</>)}
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
          <h4><Bot size={16} style={{ marginRight: '8px' }} />AI-Powered MCP Discovery</h4>
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
                setDiscoveredEnvVars({});
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
                      <div className="env-vars-inputs">
                        {discoveryResult.data.template.template.envVars.map((envVar: any, idx: number) => (
                          <div key={idx} className="form-group" style={{ marginBottom: '12px' }}>
                            <label htmlFor={`discovered-${envVar.key}`} style={{ color: '#fff', display: 'block', marginBottom: '4px' }}>
                              {envVar.key} {envVar.required && <span style={{ color: '#f44336' }}>*</span>}
                            </label>
                            <input
                              type={envVar.key.toLowerCase().includes('password') || 
                                    envVar.key.toLowerCase().includes('token') || 
                                    envVar.key.toLowerCase().includes('key') ? 'password' : 'text'}
                              id={`discovered-${envVar.key}`}
                              value={discoveredEnvVars[envVar.key] || ''}
                              onChange={(e) => handleDiscoveredEnvVarChange(envVar.key, e.target.value)}
                              placeholder={envVar.description}
                              required={envVar.required}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                backgroundColor: '#2a2a2a',
                                color: '#fff',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                fontSize: '14px'
                              }}
                            />
                            <small style={{ color: '#888', fontSize: '12px' }}>{envVar.description}</small>
                          </div>
                        ))}
                      </div>
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
          <>
            {Object.keys(mcps.active).length === 0 && Object.keys(mcps.disabled).length === 0 ? (
              <div className="no-mcps">
                <Plug size={16} style={{ marginRight: '8px' }} /> No MCP servers configured yet.
                <br />
                <br />
                Click "Add MCP Server" to get started or try "AI Discovery" to find relevant servers automatically.
              </div>
            ) : (
              <div className="mcp-cards-container">
                {Object.values(mcps.active).map((mcp) => renderMCPCard(mcp, true))}
                {Object.values(mcps.disabled).map((mcp) => renderMCPCard(mcp, false))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Installation Instructions Modal */}
      {installationInstructions && (
        <InstallationInstructionModal
          isOpen={showInstallationModal}
          onClose={handleCloseInstallationModal}
          onSaveAsTemplate={handleSaveAsTemplate}
          mcpName={installationInstructions.mcpName}
          mcpDescription={installationInstructions.mcpDescription}
          installationSteps={installationInstructions.installationSteps}
          environmentVars={installationInstructions.environmentVars}
          finalCommand={installationInstructions.finalCommand}
        />
      )}
    </div>
  );
};

export default MCPManagement;