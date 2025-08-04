const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

class ClaudeConfigReader {
  constructor() {
    this.claudeConfigPath = path.join(os.homedir(), '.claude');
  }

  async getActualMCPConfiguration() {
    try {
      // Get the raw MCP list from Claude (this shows only working MCPs)
      const { stdout } = await execAsync('claude mcp list');
      
      // Parse the actual MCPs from the output  
      const mcpLines = stdout.split('\n').filter(line => 
        line.trim() && 
        line.includes(':') && 
        (line.includes('npx') || line.includes('node')) &&
        !line.includes('Checking MCP server health')
      );

      const actualMCPs = {};
      const workingMCPNames = new Set();
      
      for (const line of mcpLines) {
        const mcp = this.parseMCPLine(line);
        if (mcp) {
          actualMCPs[mcp.name] = mcp;
          workingMCPNames.add(mcp.name);
        }
      }

      // Check config.json for additional MCPs but mark non-working ones as stale
      const configPath = path.join(this.claudeConfigPath, 'config.json');
      const staleMCPs = {};
      
      if (await fs.pathExists(configPath)) {
        const configData = await fs.readJson(configPath);
        if (configData.mcps) {
          Object.keys(configData.mcps).forEach(name => {
            const configMCP = configData.mcps[name];
            
            // Only add config.json MCPs that are NOT already in the working list
            if (!workingMCPNames.has(name)) {
              // This MCP exists in config but is not working - mark as stale
              staleMCPs[name] = {
                name,
                command: configMCP.command,
                args: configMCP.args || [],
                env: configMCP.env || {},
                cwd: configMCP.cwd,
                transport: 'stdio',
                status: 'stale',
                statusMessage: 'Found in config.json but not working in Claude CLI',
                source: 'config.json_stale'
              };
            }
          });
        }
      }

      return {
        success: true,
        mcps: actualMCPs,        // Only working MCPs
        staleMCPs: staleMCPs,    // MCPs that exist in config but aren't working
        totalCount: Object.keys(actualMCPs).length,
        staleCount: Object.keys(staleMCPs).length
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        mcps: {},
        staleMCPs: {},
        totalCount: 0,
        staleCount: 0
      };
    }
  }

  parseMCPLine(line) {
    // Parse lines like: "context7: npx -y @upstash/context7-mcp" or "context7: npx -y @upstash/context7-mcp - ✓ Connected"
    let match = line.match(/^([^:]+):\s*(.+?)\s*-\s*(✓|✗)\s*(Connected|Failed|.*)/);
    
    if (!match) {
      // Try simpler format without status (non-interactive mode)
      match = line.match(/^([^:]+):\s*(.+)$/);
      if (!match) return null;
      
      const [, name, commandPart] = match;
      const commandTokens = commandPart.trim().split(/\s+/);
      const command = commandTokens[0];
      const args = commandTokens.slice(1);
      
      return {
        name: name.trim(),
        command,
        args,
        env: this.guessEnvironmentVariables(name.trim(), args),
        transport: 'stdio',
        status: 'unknown',
        statusMessage: 'Status not available in non-interactive mode',
        source: 'claude_mcp_list'
      };
    }

    const [, name, commandPart, statusIcon, statusText] = match;
    
    // Parse the command part
    const commandTokens = commandPart.trim().split(/\s+/);
    const command = commandTokens[0];
    const args = commandTokens.slice(1);

    // Determine transport (Claude Code uses stdio by default)
    const transport = 'stdio';

    // Extract environment variables if possible (this is harder from the output)
    const env = this.guessEnvironmentVariables(name, args);

    return {
      name: name.trim(),
      command,
      args,
      env,
      transport,
      status: statusIcon === '✓' ? 'connected' : 'failed',
      statusMessage: statusText.trim(),
      source: 'claude_mcp_list'
    };
  }

  guessEnvironmentVariables(mcpName, args) {
    // Based on common MCP patterns, guess what env vars might be needed
    const envGuesses = {};

    switch (mcpName.toLowerCase()) {
      case 'context7':
        // Context7 typically needs these
        envGuesses.UPSTASH_REDIS_REST_URL = 'Required: Upstash Redis REST URL';
        envGuesses.UPSTASH_REDIS_REST_TOKEN = 'Required: Upstash Redis REST Token';
        break;
      
      case 'notion':
        envGuesses.NOTION_API_KEY = 'Required: Notion API Key';
        break;
      
      case 'figma':
        envGuesses.FIGMA_ACCESS_TOKEN = 'Required: Figma Access Token';
        break;
      
      case 'playwright':
        // Playwright typically doesn't need env vars
        break;
      
      case 'meta-agent':
        // Our custom MCP
        envGuesses.NODE_ENV = 'Optional: Node environment';
        break;
      
      default:
        // Try to guess from args
        if (args.some(arg => arg.includes('supabase'))) {
          envGuesses.SUPABASE_ACCESS_TOKEN = 'Required: Supabase Access Token';
          envGuesses.SUPABASE_PROJECT_REF = 'Required: Supabase Project Reference';
        }
        if (args.some(arg => arg.includes('neo4j'))) {
          envGuesses.NEO4J_URI = 'Required: Neo4j URI';
          envGuesses.NEO4J_USERNAME = 'Required: Neo4j Username';
          envGuesses.NEO4J_PASSWORD = 'Required: Neo4j Password';
        }
    }

    return envGuesses;
  }

  async testMCPConnection(mcpConfig) {
    try {
      // Try to spawn the MCP process briefly to test if it's configured correctly
      const testCommand = `timeout 5s ${mcpConfig.command} ${mcpConfig.args.join(' ')}`;
      await execAsync(testCommand);
      return { connected: true, error: null };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async syncWithClaudeManagerConfig() {
    // Get actual MCPs from Claude
    const actualMCPs = await this.getActualMCPConfiguration();
    
    if (!actualMCPs.success) {
      return actualMCPs;
    }

    // Load our Claude Manager MCP config
    const managerConfigPath = path.join(os.homedir(), '.claude-manager', 'mcp-config.json');
    let managerConfig = { userMCPs: { active: {}, disabled: {} }, projectMCPs: { active: {}, disabled: {} } };
    
    if (await fs.pathExists(managerConfigPath)) {
      managerConfig = await fs.readJson(managerConfigPath);
    }

    // Sync actual MCPs with our tracking
    const syncResults = {
      added: [],
      updated: [],
      removed: [],
      conflicts: [],
      movedToDisabled: []
    };

    // Add MCPs that exist in Claude but not in our config
    Object.keys(actualMCPs.mcps).forEach(name => {
      const actualMCP = actualMCPs.mcps[name];
      const existsInManager = managerConfig.userMCPs.active[name] || managerConfig.userMCPs.disabled[name];
      
      if (!existsInManager) {
        // Add to our config as active (since it's running in Claude)
        managerConfig.userMCPs.active[name] = {
          name: actualMCP.name,
          command: actualMCP.command,
          args: actualMCP.args,
          envVars: actualMCP.env || {},
          transport: actualMCP.transport,
          addedAt: Date.now(),
          source: 'auto_detected_from_claude',
          lastSeen: Date.now(),
          scope: 'user'
        };
        syncResults.added.push(name);
      } else {
        // Update existing entry with actual config
        const existing = managerConfig.userMCPs.active[name] || managerConfig.userMCPs.disabled[name];
        const location = managerConfig.userMCPs.active[name] ? 'active' : 'disabled';
        
        // Check for conflicts
        if (existing.command !== actualMCP.command || JSON.stringify(existing.args) !== JSON.stringify(actualMCP.args)) {
          syncResults.conflicts.push({
            name,
            manager: existing,
            claude: actualMCP
          });
        }
        
        // Update with actual values
        managerConfig.userMCPs[location][name] = {
          ...existing,
          command: actualMCP.command,
          args: actualMCP.args,
          envVars: { ...(existing.envVars || {}), ...(actualMCP.env || {}) },
          lastSeen: Date.now(),
          actualStatus: actualMCP.status
        };
        syncResults.updated.push(name);
      }
    });

    // Handle stale MCPs (exist in config.json but not working)
    Object.keys(actualMCPs.staleMCPs || {}).forEach(name => {
      const staleMCP = actualMCPs.staleMCPs[name];
      
      // If it's currently in active, move to disabled
      if (managerConfig.userMCPs.active[name]) {
        const existing = managerConfig.userMCPs.active[name];
        
        // Move to disabled
        managerConfig.userMCPs.disabled[name] = {
          ...existing,
          disabledAt: Date.now(),
          disabledReason: 'Stale - found in config.json but not working in Claude CLI',
          staleMCP: true,
          lastWorkingStatus: existing.actualStatus || 'unknown'
        };
        
        // Remove from active
        delete managerConfig.userMCPs.active[name];
        
        syncResults.movedToDisabled.push(name);
        syncResults.removed.push(name);
      } else if (!managerConfig.userMCPs.disabled[name]) {
        // Add as disabled if not tracked at all
        managerConfig.userMCPs.disabled[name] = {
          name: staleMCP.name,
          command: staleMCP.command,
          args: staleMCP.args,
          envVars: staleMCP.env || {},
          transport: staleMCP.transport,
          addedAt: Date.now(),
          disabledAt: Date.now(),
          disabledReason: 'Auto-detected as stale from config.json',
          source: 'auto_detected_stale',
          staleMCP: true,
          scope: 'user'
        };
        
        syncResults.movedToDisabled.push(name);
      }
    });

    // Mark remaining active MCPs as missing if they're not in working or stale lists
    Object.keys(managerConfig.userMCPs.active).forEach(name => {
      if (!actualMCPs.mcps[name] && !actualMCPs.staleMCPs[name]) {
        syncResults.removed.push(name);
        managerConfig.userMCPs.active[name].missing = true;
        managerConfig.userMCPs.active[name].lastMissing = Date.now();
      }
    });

    // Save updated config
    await fs.ensureDir(path.dirname(managerConfigPath));
    await fs.writeJson(managerConfigPath, managerConfig, { spaces: 2 });

    return {
      success: true,
      syncResults,
      totalMCPs: Object.keys(actualMCPs.mcps).length,
      totalStale: Object.keys(actualMCPs.staleMCPs || {}).length,
      managerConfig
    };
  }

  async generateMCPReport() {
    const syncResult = await this.syncWithClaudeManagerConfig();
    
    if (!syncResult.success) {
      return syncResult;
    }

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalMCPs: syncResult.totalMCPs,
        totalStale: syncResult.totalStale || 0,
        added: syncResult.syncResults.added.length,
        updated: syncResult.syncResults.updated.length,
        removed: syncResult.syncResults.removed.length,
        conflicts: syncResult.syncResults.conflicts.length,
        movedToDisabled: syncResult.syncResults.movedToDisabled?.length || 0
      },
      details: syncResult.syncResults,
      recommendations: []
    };

    // Add recommendations
    if (syncResult.syncResults.conflicts.length > 0) {
      report.recommendations.push('Review MCP conflicts - configuration differences detected between Claude and Claude Manager');
    }
    
    if (syncResult.syncResults.removed.length > 0) {
      report.recommendations.push('Some MCPs in Claude Manager config are no longer active in Claude - consider cleanup');
    }
    
    if (syncResult.syncResults.added.length > 0) {
      report.recommendations.push('New MCPs detected and added to Claude Manager - verify environment variables are captured correctly');
    }

    if (syncResult.syncResults.movedToDisabled?.length > 0) {
      report.recommendations.push(`${syncResult.syncResults.movedToDisabled.length} stale MCPs moved to disabled - these exist in config.json but are not working in Claude CLI`);
    }

    if (syncResult.totalStale > 0) {
      report.recommendations.push('Consider cleaning up stale MCP entries from ~/.claude/config.json using "claude mcp remove <name>"');
    }

    return {
      success: true,
      report
    };
  }
}

module.exports = ClaudeConfigReader;