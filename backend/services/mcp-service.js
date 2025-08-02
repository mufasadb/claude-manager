const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MCPService {
  constructor() {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.mcpConfigFile = path.join(this.registryPath, 'mcp-config.json');
    
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
      'supabase': {
        name: 'Supabase',
        description: 'Connect to Supabase database for queries and operations',
        command: 'npx',
        transport: 'stdio',
        envVars: [
          { key: 'SUPABASE_ACCESS_TOKEN', description: 'Your Supabase personal access token', required: true }
        ],
        args: ['-y', '@supabase/mcp-server-supabase@latest', '--read-only', '--project-ref=YOUR_PROJECT_REF']
      },
      'neo4j': {
        name: 'Neo4j',
        description: 'Connect to Neo4j graph database with Cypher queries',
        command: 'npx',
        transport: 'stdio',
        envVars: [
          { key: 'NEO4J_URI', description: 'Neo4j database URI (e.g., bolt://localhost:7687)', required: true },
          { key: 'NEO4J_USERNAME', description: 'Neo4j username', required: true },
          { key: 'NEO4J_PASSWORD', description: 'Neo4j password', required: true }
        ],
        args: ['@alanse/mcp-neo4j-server']
      },
      'playwright': {
        name: 'Playwright',
        description: 'Browser automation for testing and scraping',
        command: 'npx',
        transport: 'stdio',
        envVars: [],
        args: ['@playwright/mcp@latest']
      },
      'puppeteer': {
        name: 'Puppeteer',
        description: 'Chrome browser automation and control',
        command: 'npx',
        transport: 'stdio',
        envVars: [],
        args: ['-y', '@modelcontextprotocol/server-puppeteer']
      },
      'github': {
        name: 'GitHub',
        description: 'GitHub repository and issue management',
        command: 'npx',
        transport: 'stdio',
        envVars: [
          { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', description: 'GitHub personal access token', required: true }
        ],
        args: ['-y', '@modelcontextprotocol/server-github']
      },
      'postgresql': {
        name: 'PostgreSQL',
        description: 'Connect to PostgreSQL databases',
        command: 'npx',
        transport: 'stdio',
        envVars: [
          { key: 'DATABASE_URL', description: 'PostgreSQL connection string (postgresql://username:password@hostname:port/database)', required: true }
        ],
        args: ['-y', '@modelcontextprotocol/server-postgres']
      },
      'notion': {
        name: 'Notion',
        description: 'Notion workspace integration',
        command: 'npx',
        transport: 'stdio',
        envVars: [
          { key: 'NOTION_TOKEN', description: 'Notion integration token (starts with ntn_)', required: true }
        ],
        args: ['-y', '@notionhq/notion-mcp-server']
      },
      'figma': {
        name: 'Figma',
        description: 'Figma design file access and manipulation',
        command: 'npx',
        transport: 'stdio',
        envVars: [
          { key: 'FIGMA_API_KEY', description: 'Figma API key (get from figma.com settings)', required: true }
        ],
        args: ['figma-mcp']
      },
      'context7': {
        name: 'Context7',
        description: 'Up-to-date documentation and code examples for any library',
        command: 'npx -y @upstash/context7-mcp',
        transport: 'stdio',
        envVars: [],
        args: []
      },
      'meta-agent': {
        name: 'Meta-Agent',
        description: 'Generate effective agent system messages based on proven patterns from Anthropic and community best practices',
        command: 'node',
        transport: 'stdio',
        envVars: [],
        args: [path.join(__dirname, 'meta-agent-mcp-server.js')]
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
      // Remove from Claude but keep in our disabled storage
      const cliCommand = this.buildClaudeCommand('remove', {
        name,
        projectPath
      });

      await execAsync(cliCommand, {
        cwd: projectPath || process.cwd()
      });

      // Move from active to disabled
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

      await this.saveMCPConfig();
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to disable MCP: ${error.message}`);
    }
  }

  async enableMCP(scope, name, projectPath) {
    try {
      let mcpData;
      if (scope === 'user') {
        mcpData = this.state.userMCPs.disabled[name];
      } else {
        mcpData = this.state.projectMCPs.disabled[name];
      }

      if (!mcpData) {
        throw new Error('MCP not found in disabled storage');
      }

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
          cmd += ` ${args.join(' ')}`;
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
  async listMCPs(scope) {
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