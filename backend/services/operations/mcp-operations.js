const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MCPOperations {
  constructor() {
    // MCP Templates for popular servers
    this.templates = {
      'supabase': {
        name: 'Supabase',
        description: 'Connect to Supabase database for queries and operations',
        command: 'npx @supabase/mcp-server',
        transport: 'stdio',
        envVars: [
          { key: 'SUPABASE_URL', description: 'Your Supabase project URL', required: true },
          { key: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Your Supabase service role key', required: true }
        ],
        args: []
      },
      'neo4j': {
        name: 'Neo4j',
        description: 'Connect to Neo4j graph database with Cypher queries',
        command: 'npx @neo4j/mcp-server',
        transport: 'stdio',
        envVars: [
          { key: 'NEO4J_URI', description: 'Neo4j database URI (e.g., bolt://localhost:7687)', required: true },
          { key: 'NEO4J_USERNAME', description: 'Neo4j username', required: true },
          { key: 'NEO4J_PASSWORD', description: 'Neo4j password', required: true }
        ],
        args: []
      },
      'playwright': {
        name: 'Playwright',
        description: 'Browser automation for testing and scraping',
        command: 'npx @playwright/mcp-server',
        transport: 'stdio',
        envVars: [],
        args: []
      },
      'puppeteer': {
        name: 'Puppeteer',
        description: 'Chrome browser automation and control',
        command: 'npx @puppeteer/mcp-server',
        transport: 'stdio',
        envVars: [],
        args: []
      },
      'github': {
        name: 'GitHub',
        description: 'GitHub repository and issue management',
        command: 'npx @github/mcp-server',
        transport: 'stdio',
        envVars: [
          { key: 'GITHUB_TOKEN', description: 'GitHub personal access token', required: true }
        ],
        args: []
      },
      'postgresql': {
        name: 'PostgreSQL',
        description: 'Connect to PostgreSQL databases',
        command: 'npx @postgresql/mcp-server',
        transport: 'stdio',
        envVars: [
          { key: 'DATABASE_URL', description: 'PostgreSQL connection string', required: true }
        ],
        args: []
      },
      'notion': {
        name: 'Notion',
        description: 'Notion workspace integration',
        command: 'npx @notion/mcp-server',
        transport: 'stdio',
        envVars: [
          { key: 'NOTION_TOKEN', description: 'Notion integration token', required: true }
        ],
        args: []
      },
      'figma': {
        name: 'Figma',
        description: 'Figma design file access and manipulation',
        command: 'npx @figma/mcp-server',
        transport: 'stdio',
        envVars: [
          { key: 'FIGMA_TOKEN', description: 'Figma personal access token', required: true }
        ],
        args: []
      },
      'context7': {
        name: 'Context7',
        description: 'Up-to-date documentation and code examples for any library',
        command: 'npx -y @upstash/context7-mcp',
        transport: 'stdio',
        envVars: [],
        args: []
      }
    };
  }

  // CLI Command Operations
  async addMCP(mcpConfig, projectPath) {
    const { name, command, transport = 'stdio', envVars = {}, args = [], scope } = mcpConfig;
    
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
      const { stdout, stderr } = await execAsync(cliCommand, {
        cwd: projectPath || process.cwd()
      });

      return { success: true, output: stdout };
    } catch (error) {
      throw new Error(`Failed to add MCP: ${error.message}`);
    }
  }

  async removeMCP(name, projectPath) {
    try {
      const cliCommand = this.buildClaudeCommand('remove', {
        name,
        projectPath
      });

      await execAsync(cliCommand, {
        cwd: projectPath || process.cwd()
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to remove MCP: ${error.message}`);
    }
  }

  // Claude CLI command builder
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

  // Template operations
  getTemplates() {
    return this.templates;
  }

  getTemplate(key) {
    return this.templates[key];
  }

  createMCPFromTemplate(templateKey, customData = {}) {
    const template = this.templates[templateKey];
    if (!template) {
      throw new Error(`Template ${templateKey} not found`);
    }

    const mcpConfig = {
      name: customData.name || templateKey,
      command: template.command,
      transport: template.transport,
      envVars: customData.envVars || {},
      args: customData.args || template.args
    };

    return mcpConfig;
  }

  // Validation helpers
  validateMCPConfig(mcpConfig) {
    const { name, command } = mcpConfig;
    if (!name || !command) {
      throw new Error('Name and command are required');
    }
    return true;
  }

  validateTemplateEnvVars(templateKey, envVars) {
    const template = this.templates[templateKey];
    if (!template) {
      throw new Error(`Template ${templateKey} not found`);
    }

    const missingRequired = template.envVars
      .filter(envVar => envVar.required && !envVars[envVar.key])
      .map(envVar => envVar.key);

    if (missingRequired.length > 0) {
      throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
    }

    return true;
  }
}

module.exports = MCPOperations;