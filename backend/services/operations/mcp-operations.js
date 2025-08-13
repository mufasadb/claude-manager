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
          { key: 'DATABASE_URL', description: 'PostgreSQL connection string', required: true }
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
      
      // Add name first
      cmd += ` ${name}`;
      
      // Add environment variables after name
      if (envVars && Object.keys(envVars).length > 0) {
        for (const [key, value] of Object.entries(envVars)) {
          // Properly quote environment variable values to handle special characters
          const quotedValue = `"${value.replace(/"/g, '\\"')}"`;
          cmd += ` -e ${key}=${quotedValue}`;
        }
      }
      
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