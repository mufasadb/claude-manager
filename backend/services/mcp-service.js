const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MCPService {
  constructor(claudeConfigReader = null) {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.mcpConfigFile = path.join(this.registryPath, 'mcp-config.json');
    this.claudeConfigReader = claudeConfigReader;
    
    // Initialize state
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
    
    // MCP Templates for popular servers
    this.templates = {
      // Templates will be populated by AI discovery
    };
  }

  async init() {
    await fs.ensureDir(this.registryPath);
    await this.loadMCPConfig();
  }

  // Configuration Management
  async loadMCPConfig() {
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

  async saveMCPConfig() {
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

  // Validation and Sync Methods
  async syncWithClaudeConfig() {
    if (!this.claudeConfigReader) {
      console.warn('ClaudeConfigReader not available for sync');
      return { success: false, reason: 'No config reader available' };
    }

    try {
      console.log('Syncing MCP state with Claude CLI configuration...');
      const syncResult = await this.claudeConfigReader.syncWithClaudeManagerConfig();
      
      // Reload our state after sync
      await this.loadMCPConfig();
      
      return syncResult;
    } catch (error) {
      console.error('Error syncing with Claude config:', error);
      return { success: false, error: error.message };
    }
  }

  async validateMCPExists(name, scope = 'user') {
    if (!this.claudeConfigReader) {
      // Fallback: check internal state only
      const mcpData = scope === 'user' ? this.state.userMCPs : this.state.projectMCPs;
      return !!mcpData.active[name] && !mcpData.active[name].missing;
    }

    try {
      const actualMCPs = await this.claudeConfigReader.parseMCPConfig();
      return !!actualMCPs.mcps[name];
    } catch (error) {
      console.error('Error validating MCP existence:', error);
      return false;
    }
  }

  async validateAndSyncIfNeeded(name, scope, operation) {
    // Check if MCP exists in Claude CLI before operation
    const exists = await this.validateMCPExists(name, scope);
    
    if (!exists && (operation === 'disable' || operation === 'enable')) {
      // Try to sync and check again
      console.log(`MCP ${name} not found in Claude CLI, attempting sync...`);
      const syncResult = await this.syncWithClaudeConfig();
      
      if (syncResult.success) {
        const existsAfterSync = await this.validateMCPExists(name, scope);
        if (!existsAfterSync) {
          throw new Error(`MCP '${name}' does not exist in Claude CLI. It may have been manually removed or be stale. Please refresh and try again.`);
        }
      }
    }
    
    return exists;
  }

  // MCP Management
  async addMCP(scope, mcpConfig) {
    const { name, command, transport = 'stdio', envVars = {}, args = [], projectPath } = mcpConfig;
    
    // Validate required fields
    if (!name || !command) {
      throw new Error('Name and command are required');
    }

    // Build Claude CLI command
    const cliCommand = this.buildClaudeCommand('add', {
      name,
      command,
      transport,
      envVars,
      args,
      scope: scope === 'user' ? 'user' : 'project',
      projectPath
    });

    try {
      // Execute Claude CLI command
      const { stdout, stderr } = await execAsync(cliCommand, {
        cwd: projectPath || process.cwd()
      });

      // Store in our state
      const mcpData = {
        name,
        command,
        transport,
        envVars,
        args,
        addedAt: Date.now(),
        scope
      };

      if (scope === 'user') {
        this.state.userMCPs.active[name] = mcpData;
      } else {
        this.state.projectMCPs.active[name] = mcpData;
      }

      await this.saveMCPConfig();
      
      return { success: true, output: stdout };
    } catch (error) {
      throw new Error(`Failed to add MCP: ${error.message}`);
    }
  }

  async removeMCP(scope, name, projectPath) {
    try {
      const cliCommand = this.buildClaudeCommand('remove', {
        name,
        projectPath
      });

      await execAsync(cliCommand, {
        cwd: projectPath || process.cwd()
      });

      // Remove from our state
      if (scope === 'user') {
        delete this.state.userMCPs.active[name];
        delete this.state.userMCPs.disabled[name];
      } else {
        delete this.state.projectMCPs.active[name];
        delete this.state.projectMCPs.disabled[name];
      }

      await this.saveMCPConfig();
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to remove MCP: ${error.message}`);
    }
  }

  async disableMCP(scope, name, projectPath) {
    try {
      // Validate MCP exists before attempting to disable
      await this.validateAndSyncIfNeeded(name, scope, 'disable');

      // Check if MCP is in our active state
      const mcpData = scope === 'user' ? this.state.userMCPs.active[name] : this.state.projectMCPs.active[name];
      if (!mcpData) {
        throw new Error(`MCP '${name}' is not in active state. It may already be disabled or doesn't exist.`);
      }

      // Remove from Claude but keep in our disabled storage
      const cliCommand = this.buildClaudeCommand('remove', {
        name,
        projectPath
      });

      await execAsync(cliCommand, {
        cwd: projectPath || process.cwd()
      });

      // Move from active to disabled
      if (scope === 'user') {
        delete this.state.userMCPs.active[name];
        this.state.userMCPs.disabled[name] = { ...mcpData, disabledAt: Date.now() };
      } else {
        delete this.state.projectMCPs.active[name];
        this.state.projectMCPs.disabled[name] = { ...mcpData, disabledAt: Date.now() };
      }

      await this.saveMCPConfig();
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to disable MCP: ${error.message}`);
    }
  }

  async enableMCP(scope, name, projectPath) {
    try {
      // Check if MCP is in our disabled state
      let mcpData;
      if (scope === 'user') {
        mcpData = this.state.userMCPs.disabled[name];
      } else {
        mcpData = this.state.projectMCPs.disabled[name];
      }

      if (!mcpData) {
        throw new Error(`MCP '${name}' is not in disabled state. It may already be enabled or doesn't exist.`);
      }

      // Check if MCP already exists in Claude CLI (shouldn't, but let's be safe)
      const alreadyExists = await this.validateMCPExists(name, scope);
      if (alreadyExists) {
        console.log(`MCP '${name}' already exists in Claude CLI, moving to active state without re-adding`);
      } else {
        // Re-add to Claude
        const cliCommand = this.buildClaudeCommand('add', {
          name: mcpData.name,
          command: mcpData.command,
          transport: mcpData.transport,
          envVars: mcpData.envVars,
          args: mcpData.args,
          scope: scope === 'user' ? 'user' : 'project',
          projectPath
        });

        await execAsync(cliCommand, {
          cwd: projectPath || process.cwd()
        });
      }

      // Move from disabled to active
      if (scope === 'user') {
        delete this.state.userMCPs.disabled[name];
        this.state.userMCPs.active[name] = { ...mcpData, enabledAt: Date.now() };
      } else {
        delete this.state.projectMCPs.disabled[name];
        this.state.projectMCPs.active[name] = { ...mcpData, enabledAt: Date.now() };
      }

      await this.saveMCPConfig();
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to enable MCP: ${error.message}`);
    }
  }

  // Build Claude CLI command
  buildClaudeCommand(action, options) {
    const { name, command, transport, envVars, args, scope, projectPath } = options;
    
    let cmd = `claude mcp ${action}`;
    
    if (action === 'add') {
      // Add scope if specified
      if (scope) {
        cmd += ` --scope ${scope}`;
      }
      
      // Add transport if not stdio
      if (transport && transport !== 'stdio') {
        cmd += ` --transport ${transport}`;
      }
      
      // Add environment variables before name
      if (envVars && Object.keys(envVars).length > 0) {
        for (const [key, value] of Object.entries(envVars)) {
          cmd += ` -e ${key}=${value}`;
        }
      }
      
      // Add name
      cmd += ` ${name}`;
      
      // Add command with proper separator for stdio transport
      if (transport === 'stdio' || !transport) {
        cmd += ` -- ${command}`;
        if (args && args.length > 0) {
          // For Docker commands, inject environment variable flags
          if (command === 'docker' && envVars && Object.keys(envVars).length > 0) {
            const dockerArgs = [...args];
            // Insert -e flags for each env var after 'run' arguments but before image name
            const imageIndex = dockerArgs.findIndex(arg => arg.includes('/') && arg.includes(':'));
            if (imageIndex !== -1) {
              // Insert env var flags before the image name
              for (const [key] of Object.entries(envVars)) {
                dockerArgs.splice(imageIndex, 0, '-e', key);
              }
            }
            cmd += ` ${dockerArgs.join(' ')}`;
          } else {
            cmd += ` ${args.join(' ')}`;
          }
        }
      } else {
        cmd += ` ${command}`;
      }
    } else if (action === 'remove') {
      cmd += ` ${name}`;
    }
    
    return cmd;
  }

  // List MCPs
  async listMCPs(scope, autoSync = true) {
    // Auto-sync with Claude CLI before returning state
    if (autoSync && this.claudeConfigReader) {
      try {
        await this.syncWithClaudeConfig();
      } catch (error) {
        console.warn('Auto-sync failed during listMCPs:', error.message);
        // Continue with cached state if sync fails
      }
    }

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

  // Get templates
  getTemplates() {
    return this.templates;
  }

  // Get template by key
  getTemplate(key) {
    return this.templates[key];
  }

  // Get state
  getState() {
    return this.state;
  }
}

module.exports = MCPService;