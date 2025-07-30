import { AppState, Hook, MCPTemplate, MCPState, MCP, SessionCountdown, SlashCommandFormData, SlashCommandCreationResult, SlashCommand, AgentFormData, AgentCreationResult, Agent, AgentTemplate } from '../types';

const API_BASE = '';

export class ApiService {
  static async getStatus(): Promise<AppState> {
    const response = await fetch(`${API_BASE}/api/status`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async registerProject(name: string, path: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/register-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, path }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async unregisterProject(name: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/unregister-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }


  static async saveFile(
    filePath: string,
    content: string,
    projectName?: string
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/api/save-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filePath,
        content,
        projectName,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async addHook(hook: Hook, projectName?: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/add-hook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...hook,
        projectName,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async getCommonHooks(): Promise<Record<string, Hook[]>> {
    const response = await fetch(`${API_BASE}/api/common-hooks`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async toggleSessionTracking(): Promise<void> {
    const response = await fetch(`${API_BASE}/api/toggle-session-tracking`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async addUserEnv(key: string, value: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/add-user-env`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, value }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async deleteUserEnv(key: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/delete-user-env`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async updateUserEnv(key: string, value: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/update-user-env`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, value }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async addEnvToProject(
    projectName: string,
    key: string,
    value: string
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/api/add-env-to-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectName, key, value }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async copyEnvToUser(
    projectName: string,
    key: string
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/api/copy-env-to-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectName, key }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  static async checkGlobalCommands(): Promise<{ hasGlobalCommands: boolean }> {
    const response = await fetch(`${API_BASE}/api/check-global-commands`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async healthCheck(): Promise<{ status: string; timestamp: number }> {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async updateUserSettings(settings: any): Promise<void> {
    const response = await fetch(`${API_BASE}/api/update-user-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ settings }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
  }

  static async saveClaudeMd(projectPath: string, content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/save-claude-md`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectPath, content }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
  }

  static async saveUserClaudeMd(content: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/save-user-claude-md`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
  }

  // MCP Management
  static async getMCPTemplates(): Promise<Record<string, MCPTemplate>> {
    const response = await fetch(`${API_BASE}/api/mcp/templates`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async listMCPs(scope: 'user' | 'project'): Promise<MCPState> {
    const response = await fetch(`${API_BASE}/api/mcp/list/${scope}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async addMCP(
    scope: 'user' | 'project',
    mcpConfig: {
      name: string;
      command: string;
      transport?: 'stdio' | 'sse' | 'http';
      envVars?: Record<string, string>;
      args?: string[];
    },
    projectPath?: string
  ): Promise<{ success: boolean; output?: string }> {
    const response = await fetch(`${API_BASE}/api/mcp/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope, mcpConfig, projectPath }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async removeMCP(
    scope: 'user' | 'project',
    name: string,
    projectPath?: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/mcp/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope, name, projectPath }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async disableMCP(
    scope: 'user' | 'project',
    name: string,
    projectPath?: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/mcp/disable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope, name, projectPath }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async enableMCP(
    scope: 'user' | 'project',
    name: string,
    projectPath?: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/mcp/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope, name, projectPath }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async getSessionCountdown(): Promise<SessionCountdown> {
    const response = await fetch(`${API_BASE}/api/countdown`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async pushEnvToProject(
    projectName: string,
    key: string,
    value: string
  ): Promise<{ success: boolean; message?: string; conflict?: boolean }> {
    const response = await fetch(`${API_BASE}/api/push-env-to-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectName, key, value }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  // Slash Command Management
  static async createSlashCommand(commandData: SlashCommandFormData): Promise<SlashCommandCreationResult> {
    const response = await fetch(`${API_BASE}/api/create-slash-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commandData),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async listSlashCommands(scope: 'user' | 'project', projectName?: string): Promise<SlashCommand[]> {
    const params = new URLSearchParams({ scope });
    if (projectName) {
      params.append('projectName', projectName);
    }
    
    const response = await fetch(`${API_BASE}/api/list-slash-commands?${params}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.commands;
  }

  // Agent management methods
  static async getAgentTemplates(): Promise<AgentTemplate> {
    const response = await fetch(`${API_BASE}/api/agents/templates`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async getAvailableTools(): Promise<{ tools: string[] }> {
    const response = await fetch(`${API_BASE}/api/agents/available-tools`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async listAgents(scope: 'user' | 'project', projectName?: string): Promise<Agent[]> {
    const params = new URLSearchParams();
    if (projectName) {
      params.append('projectName', projectName);
    }
    
    const response = await fetch(`${API_BASE}/api/agents/list/${scope}?${params}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.agents;
  }

  static async createAgent(formData: AgentFormData): Promise<AgentCreationResult> {
    const response = await fetch(`${API_BASE}/api/agents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  static async deleteAgent(params: { agentName: string; scope: 'user' | 'project'; projectName?: string }): Promise<{ success: boolean; error?: string; message?: string }> {
    const response = await fetch(`${API_BASE}/api/agents/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}