const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class MCPConfigManager {
  constructor() {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.mcpConfigFile = path.join(this.registryPath, 'mcp-config.json');
    
    this.state = {
      userMCPs: {
        active: {},
        disabled: {}
      },
      projectMCPs: {
        active: {},
        disabled: {}
      }
    };
  }

  async init() {
    await fs.ensureDir(this.registryPath);
    await this.load();
  }

  async load() {
    try {
      if (await fs.pathExists(this.mcpConfigFile)) {
        const data = await fs.readJson(this.mcpConfigFile);
        this.state = {
          userMCPs: data.userMCPs || { active: {}, disabled: {} },
          projectMCPs: data.projectMCPs || { active: {}, disabled: {} }
        };
      }
    } catch (error) {
      console.error('Error loading MCP config:', error);
    }
  }

  async save() {
    try {
      await fs.ensureDir(this.registryPath);
      const configData = {
        ...this.state,
        lastUpdate: Date.now()
      };
      await fs.writeJson(this.mcpConfigFile, configData, { spaces: 2 });
    } catch (error) {
      console.error('Error saving MCP config:', error);
      throw error;
    }
  }

  // State management methods
  addActiveMCP(scope, name, mcpData) {
    const data = {
      ...mcpData,
      addedAt: Date.now(),
      scope
    };

    if (scope === 'user') {
      this.state.userMCPs.active[name] = data;
    } else {
      this.state.projectMCPs.active[name] = data;
    }
  }

  removeActiveMCP(scope, name) {
    if (scope === 'user') {
      delete this.state.userMCPs.active[name];
    } else {
      delete this.state.projectMCPs.active[name];
    }
  }

  removeDisabledMCP(scope, name) {
    if (scope === 'user') {
      delete this.state.userMCPs.disabled[name];
    } else {
      delete this.state.projectMCPs.disabled[name];
    }
  }

  moveToDisabled(scope, name) {
    let mcpData;
    if (scope === 'user') {
      mcpData = this.state.userMCPs.active[name];
      delete this.state.userMCPs.active[name];
      this.state.userMCPs.disabled[name] = { ...mcpData, disabledAt: Date.now() };
    } else {
      mcpData = this.state.projectMCPs.active[name];
      delete this.state.projectMCPs.active[name];
      this.state.projectMCPs.disabled[name] = { ...mcpData, disabledAt: Date.now() };
    }
    return mcpData;
  }

  moveToActive(scope, name) {
    let mcpData;
    if (scope === 'user') {
      mcpData = this.state.userMCPs.disabled[name];
      delete this.state.userMCPs.disabled[name];
      this.state.userMCPs.active[name] = { ...mcpData, enabledAt: Date.now() };
    } else {
      mcpData = this.state.projectMCPs.disabled[name];
      delete this.state.projectMCPs.disabled[name];
      this.state.projectMCPs.active[name] = { ...mcpData, enabledAt: Date.now() };
    }
    return mcpData;
  }

  getDisabledMCP(scope, name) {
    if (scope === 'user') {
      return this.state.userMCPs.disabled[name];
    } else {
      return this.state.projectMCPs.disabled[name];
    }
  }

  getMCPs(scope) {
    if (scope === 'user') {
      return {
        active: this.state.userMCPs.active,
        disabled: this.state.userMCPs.disabled
      };
    } else {
      return {
        active: this.state.projectMCPs.active,
        disabled: this.state.projectMCPs.disabled
      };
    }
  }

  getState() {
    return this.state;
  }

  // Validation
  validateMCPData(mcpData) {
    const { name, command } = mcpData;
    if (!name || !command) {
      throw new Error('Name and command are required');
    }
    return true;
  }
}

module.exports = MCPConfigManager;