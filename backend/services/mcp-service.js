const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MCPService {
  constructor(claudeConfigReader = null) {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.savedMCPConfigsFile = path.join(this.registryPath, 'saved-mcp-configs.json');
    this.claudeConfigReader = claudeConfigReader;
    
    // Initialize state
    this.state = {
      userMCPs: {
        active: {},      // From claude mcp list (live)
        saved: {}        // From saved-mcp-configs.json (disabled/backup configs)
      },
      projectMCPs: {
        active: {},      // From claude mcp list (live)  
        saved: {}        // From saved-mcp-configs.json (disabled/backup configs)
      }
    };
    
    // MCP Templates for popular servers
    this.templates = {
      'supabase': {
        name: 'Supabase',
        description: 'Connect to Supabase database for queries and operations',
        command: 'npx',
        args: ['-y', '@supabase/mcp-server'],
        transport: 'stdio',
        envVars: [
          { key: 'SUPABASE_URL', description: 'Your Supabase project URL', required: true },
          { key: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Your Supabase service role key', required: true }
        ]
      },
      'neo4j': {
        name: 'Neo4j',
        description: 'Connect to Neo4j graph database with Cypher queries',
        command: 'npx',
        args: ['-y', '@jovanhsu/mcp-neo4j-memory-server'],
        transport: 'stdio',
        envVars: [
          { key: 'NEO4J_URI', description: 'Neo4j database URI (e.g., bolt://localhost:7687)', required: true },
          { key: 'NEO4J_USERNAME', description: 'Neo4j username', required: true },
          { key: 'NEO4J_PASSWORD', description: 'Neo4j password', required: true }
        ]
      },
      'playwright': {
        name: 'Playwright',
        description: 'Browser automation for testing and scraping',
        command: 'npx',
        args: ['-y', '@playwright/mcp'],
        transport: 'stdio',
        envVars: []
      },
      'puppeteer': {
        name: 'Puppeteer',
        description: 'Chrome browser automation and control',
        command: 'npx',
        args: ['-y', 'puppeteer-mcp-server'],
        transport: 'stdio',
        envVars: []
      },
      'github': {
        name: 'GitHub',
        description: 'GitHub repository and issue management',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        transport: 'stdio',
        envVars: [
          { key: 'GITHUB_TOKEN', description: 'GitHub personal access token', required: true }
        ]
      },
      'postgresql': {
        name: 'PostgreSQL',
        description: 'Connect to PostgreSQL databases',
        command: 'npx',
        args: ['-y', '@henkey/postgres-mcp-server'],
        transport: 'stdio',
        envVars: [
          { key: 'DATABASE_URL', description: 'PostgreSQL connection string (postgresql://user:pass@host:port/db)', required: true }
        ]
      },
      'notion': {
        name: 'Notion',
        description: 'Notion workspace integration',
        command: 'npx',
        args: ['-y', 'notion-mcp-server'],
        transport: 'stdio',
        envVars: [
          { key: 'NOTION_TOKEN', description: 'Notion integration token', required: true },
          { key: 'NOTION_PAGE_ID', description: 'Notion page ID to access', required: true }
        ]
      },
      'figma': {
        name: 'Figma',
        description: 'Figma design file access and manipulation',
        command: 'npx',
        args: ['-y', 'figma-developer-mcp'],
        transport: 'stdio',
        envVars: [
          { key: 'FIGMA_API_KEY', description: 'Figma personal access token', required: true }
        ]
      },
      'context7': {
        name: 'Context7',
        description: 'Up-to-date documentation and code examples for any library',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        transport: 'stdio',
        envVars: []
      },
      'mcp-atlassian': {
        name: 'MCP Server for Atlassian Products',
        description: 'MCP server for Jira, Confluence, and other Atlassian products',
        command: 'docker',
        args: ['run', '-i', '--rm', 'ghcr.io/sooperset/mcp-atlassian:latest'],
        transport: 'stdio',
        envVars: [
          { key: 'JIRA_URL', description: 'The URL of your Jira instance', required: true },
          { key: 'JIRA_USERNAME', description: 'The username to authenticate with Jira', required: true },
          { key: 'JIRA_API_TOKEN', description: 'The API token to authenticate with Jira', required: true }
        ]
      }
    };
  }

  async init() {
    await fs.ensureDir(this.registryPath);
    await this.loadMCPConfig();
  }

  // Configuration Management
  async loadMCPConfig() {
    try {
      // Always get live active MCPs from Claude CLI (source of truth)
      const activeMCPs = await this.getActiveMCPsFromClaude();
      
      // Load saved configs (disabled/backup MCPs) from our separate file
      const savedConfigs = await this.loadSavedMCPConfigs();

      this.state = {
        userMCPs: {
          active: activeMCPs,
          saved: savedConfigs.user || {}
        },
        projectMCPs: {
          active: {},  // TODO: Add project-scoped MCP support later
          saved: savedConfigs.project || {}
        }
      };
    } catch (error) {
      console.error('Error loading MCP config:', error);
    }
  }

  async loadSavedMCPConfigs() {
    try {
      if (await fs.pathExists(this.savedMCPConfigsFile)) {
        return await fs.readJson(this.savedMCPConfigsFile);
      }
      return { user: {}, project: {} };
    } catch (error) {
      console.error('Error loading saved MCP configs:', error);
      return { user: {}, project: {} };
    }
  }

  async getActiveMCPsFromClaude() {
    try {
      // Execute claude mcp list from user's Code directory to avoid project-specific context
      const { stdout } = await execAsync('claude mcp list', { 
        cwd: path.join(os.homedir(), 'Code')
      });
      
      return this.parseMCPListOutput(stdout);
    } catch (error) {
      console.error('Error getting MCPs from Claude CLI:', error);
      return {};
    }
  }

  parseMCPListOutput(output) {
    const mcps = {};
    
    if (!output || output.trim() === '') {
      return mcps;
    }

    // Parse the claude mcp list output
    // Expected format: "servername: command args"
    const lines = output.split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
      // Skip header lines or empty lines
      if (line.includes('MCP servers') || line.includes('====') || line.trim() === '') {
        continue;
      }
      
      // Parse server entries in format "servername: command args"
      const trimmedLine = line.trim();
      if (trimmedLine && trimmedLine.includes(':')) {
        const colonIndex = trimmedLine.indexOf(':');
        const serverName = trimmedLine.substring(0, colonIndex).trim();
        const commandPart = trimmedLine.substring(colonIndex + 1).trim();
        
        if (serverName) {
          // Parse command and args
          const commandParts = commandPart.split(/\s+/);
          const command = commandParts[0] || 'Unknown';
          const args = commandParts.slice(1);
          
          mcps[serverName] = {
            name: serverName,
            status: 'active',
            command: command,
            args: args,
            transport: 'stdio'
          };
        }
      }
    }
    
    return mcps;
  }

  async saveSavedMCPConfigs() {
    try {
      await fs.ensureDir(this.registryPath);
      const savedConfigs = {
        user: this.state.userMCPs.saved,
        project: this.state.projectMCPs.saved,
        lastUpdate: Date.now()
      };
      await fs.writeJson(this.savedMCPConfigsFile, savedConfigs, { spaces: 2 });
    } catch (error) {
      console.error('Error saving saved MCP configs:', error);
      throw error;
    }
  }

  // Sync Methods - simplified to just reload from Claude CLI
  async syncWithClaudeConfig() {
    try {
      console.log('Syncing MCP state with Claude CLI configuration...');
      
      // Simply reload from Claude CLI (source of truth)
      await this.loadMCPConfig();
      
      return { 
        success: true, 
        message: 'Synchronized with Claude CLI configuration',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error syncing with Claude config:', error);
      return { success: false, error: error.message };
    }
  }






  // MCP Management via Claude CLI
  async addMCP(scope, mcpConfig) {
    const { name, command, envVars = {}, args = [] } = mcpConfig;
    
    // Validate required fields
    if (!name || !command) {
      throw new Error('Name and command are required');
    }

    try {
      // Build Claude CLI command: claude mcp add -s user name -e KEY=value -- command args
      let cliCommand = `claude mcp add -s ${scope} "${name}"`;
      
      // Add environment variables
      if (envVars && Object.keys(envVars).length > 0) {
        for (const [key, value] of Object.entries(envVars)) {
          cliCommand += ` -e ${key}="${value}"`;
        }
      }
      
      // Add command and args
      cliCommand += ` -- ${command}`;
      if (args && args.length > 0) {
        cliCommand += ` ${args.join(' ')}`;
      }

      console.log(`Executing Claude CLI command: ${cliCommand}`);
      
      const { stdout, stderr } = await execAsync(cliCommand, {
        cwd: path.join(os.homedir(), 'Code')  // Execute from user level
      });

      if (stderr && !stderr.includes('Added MCP server')) {
        console.warn(`Claude CLI warning: ${stderr}`);
      }

      // Refresh active MCPs from Claude CLI (source of truth)
      await this.loadMCPConfig();
      
      return { success: true, output: stdout };
    } catch (error) {
      console.error(`Failed to add MCP '${name}':`, error.message);
      throw new Error(`Failed to add MCP: ${error.message}`);
    }
  }

  async removeMCP(scope, name) {
    try {
      // Direct Claude CLI command: claude mcp remove "name" -s user
      const cliCommand = `claude mcp remove "${name}" -s ${scope}`;

      console.log(`Executing Claude CLI command: ${cliCommand}`);
      
      const { stdout, stderr } = await execAsync(cliCommand, {
        cwd: path.join(os.homedir(), 'Code')  // Execute from user level
      });

      if (stderr && !stderr.includes('Removed MCP server')) {
        console.warn(`Claude CLI warning: ${stderr}`);
      }

      // Also remove from saved configs if it exists there
      if (scope === 'user') {
        delete this.state.userMCPs.saved[name];
      } else {
        delete this.state.projectMCPs.saved[name];
      }

      await this.saveSavedMCPConfigs();
      
      // Refresh active MCPs from Claude CLI (source of truth)
      await this.loadMCPConfig();
      
      return { success: true, output: stdout };
    } catch (error) {
      console.error(`Failed to remove MCP '${name}':`, error.message);
      throw new Error(`Failed to remove MCP: ${error.message}`);
    }
  }

  async disableMCP(scope, name) {
    // First check if MCP is currently active in Claude
    const activeMCPs = await this.getActiveMCPsFromClaude();
    const mcpData = activeMCPs[name];

    if (!mcpData) {
      throw new Error(`MCP '${name}' is not currently active in Claude CLI.`);
    }

    try {
      // Save the full config to our saved configs before removing from Claude
      const savedConfig = {
        name: mcpData.name,
        command: mcpData.command,
        args: mcpData.args,
        envVars: {}, // We'll need to get this from claude mcp get
        transport: mcpData.transport,
        disabledAt: Date.now(),
        source: 'disabled_from_active'
      };

      // Try to get environment variables from claude mcp get
      try {
        const { stdout: detailOutput } = await execAsync(`claude mcp get "${name}"`, {
          cwd: path.join(os.homedir(), 'Code')
        });
        const envVars = this.parseEnvVarsFromMcpGet(detailOutput);
        savedConfig.envVars = envVars;
      } catch (error) {
        console.warn(`Could not retrieve env vars for ${name}:`, error.message);
      }

      // Save to our backup configs
      if (scope === 'user') {
        this.state.userMCPs.saved[name] = savedConfig;
      } else {
        this.state.projectMCPs.saved[name] = savedConfig;
      }
      
      await this.saveSavedMCPConfigs();

      // Remove from Claude CLI
      const cliCommand = `claude mcp remove "${name}" -s ${scope}`;
      console.log(`Executing Claude CLI command: ${cliCommand}`);
      
      const { stdout, stderr } = await execAsync(cliCommand, {
        cwd: path.join(os.homedir(), 'Code')
      });

      if (stderr && !stderr.includes('Removed MCP server')) {
        console.warn(`Claude CLI warning: ${stderr}`);
      }

      // Refresh active MCPs from Claude CLI
      await this.loadMCPConfig();
      
      return { success: true, output: stdout };
    } catch (error) {
      console.error(`Failed to disable MCP '${name}':`, error.message);
      throw new Error(`Failed to disable MCP: ${error.message}`);
    }
  }

  parseEnvVarsFromMcpGet(output) {
    const envVars = {};
    const lines = output.split('\n');
    let inEnvSection = false;
    
    for (const line of lines) {
      if (line.includes('Environment:')) {
        inEnvSection = true;
        continue;
      }
      if (inEnvSection && line.trim() && !line.includes('To remove')) {
        const trimmed = line.trim();
        if (trimmed.includes('=')) {
          const [key, value] = trimmed.split('=');
          envVars[key] = value;
        }
      }
      if (line.includes('To remove')) {
        break;
      }
    }
    
    return envVars;
  }

  async enableMCP(scope, name) {
    try {
      // Check if MCP is in our saved configs
      let savedConfig;
      if (scope === 'user') {
        savedConfig = this.state.userMCPs.saved[name];
      } else {
        savedConfig = this.state.projectMCPs.saved[name];
      }

      if (!savedConfig) {
        throw new Error(`MCP '${name}' is not in saved configs. Cannot enable without saved configuration.`);
      }

      // Build Claude CLI command using saved config
      let cliCommand = `claude mcp add -s ${scope} "${name}"`;
      
      // Add environment variables from saved config
      if (savedConfig.envVars && Object.keys(savedConfig.envVars).length > 0) {
        for (const [key, value] of Object.entries(savedConfig.envVars)) {
          cliCommand += ` -e ${key}="${value}"`;
        }
      }
      
      // Add command and args from saved config
      cliCommand += ` -- ${savedConfig.command}`;
      if (savedConfig.args && savedConfig.args.length > 0) {
        cliCommand += ` ${savedConfig.args.join(' ')}`;
      }

      console.log(`Executing Claude CLI command: ${cliCommand}`);
      
      const { stdout, stderr } = await execAsync(cliCommand, {
        cwd: path.join(os.homedir(), 'Code')
      });

      if (stderr && !stderr.includes('Added MCP server')) {
        console.warn(`Claude CLI warning: ${stderr}`);
      }

      // Remove from saved configs (it's now active in Claude)
      if (scope === 'user') {
        delete this.state.userMCPs.saved[name];
      } else {
        delete this.state.projectMCPs.saved[name];
      }

      await this.saveSavedMCPConfigs();
      
      // Refresh active MCPs from Claude CLI
      await this.loadMCPConfig();
      
      return { success: true, output: stdout };
    } catch (error) {
      console.error(`Failed to enable MCP '${name}':`, error.message);
      throw new Error(`Failed to enable MCP: ${error.message}`);
    }
  }

  // List MCPs - always fresh from Claude CLI + saved configs
  async listMCPs(scope) {
    // Refresh from Claude CLI to get latest state
    await this.loadMCPConfig();

    if (scope === 'user') {
      return {
        active: this.state.userMCPs.active,   // From claude mcp list
        disabled: this.state.userMCPs.saved   // From saved-mcp-configs.json (frontend expects 'disabled')
      };
    } else {
      return {
        active: this.state.projectMCPs.active, // From claude mcp list
        disabled: this.state.projectMCPs.saved // From saved-mcp-configs.json (frontend expects 'disabled')
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
    // Return state with 'disabled' as empty for now (clean slate approach)
    return {
      userMCPs: {
        active: this.state.userMCPs.active,
        disabled: {}  // Empty - we'll build this up as we disable MCPs
      },
      projectMCPs: {
        active: this.state.projectMCPs.active,
        disabled: {}  // Empty - we'll build this up as we disable MCPs  
      }
    };
  }
}

module.exports = MCPService;