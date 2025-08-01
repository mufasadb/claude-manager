import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { MCPTemplate, MCP, MCPState } from '../../types';
import './MCPManagement.css';

interface MCPManagementProps {
  scope: 'user' | 'project';
  projectPath?: string;
  onMCPUpdate?: (mcps: MCPState) => void;
}

interface MCPFormData {
  name: string;
  command: string;
  transport: 'stdio' | 'sse' | 'http';
  envVars: Record<string, string>;
  args: string[];
}

const MCPManagement: React.FC<MCPManagementProps> = ({ scope, projectPath, onMCPUpdate }) => {
  const [templates, setTemplates] = useState<Record<string, MCPTemplate>>({});
  const [mcps, setMcps] = useState<MCPState>({ active: {}, disabled: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setSelectedTemplate(templateKey);
      setFormData({
        name: templateKey,
        command: template.command,
        transport: template.transport,
        envVars: {},
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
      
      await ApiService.disableMCP(scope, name, projectPath);
      await loadMCPs();
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
      
      await ApiService.removeMCP(scope, name, projectPath);
      await loadMCPs();
    } catch (err) {
      setError(`Failed to remove MCP: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingMCP(null);
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
        {Object.keys(mcp.envVars).length > 0 ? (
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
          onClick={() => handleRemoveMCP(mcp.name)}
          disabled={loadingMCP === mcp.name}
          className="btn-delete"
        >
          {loadingMCP === mcp.name ? '...' : 'Delete'}
        </button>
      </td>
    </tr>
  );

  return (
    <div className="mcp-management">
      <div className="mcp-header">
        <h3>MCP Servers ({scope === 'user' ? 'User Level' : 'Project Level'})</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary"
          disabled={loading}
        >
          {showAddForm ? 'Cancel' : 'Add MCP Server'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="close-error">×</button>
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