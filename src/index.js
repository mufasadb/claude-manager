const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const { exec } = require('child_process');
const os = require('os');

// Common Hook Presets
const COMMON_HOOKS = {
  PreToolUse: [
    {
      name: 'Prevent Dangerous Commands',
      pattern: 'Bash',
      command: 'echo "Validating command safety..." && if echo "$CLAUDE_TOOL_INPUT" | grep -E "(rm -rf|sudo rm|chmod 777|> /etc/)" > /dev/null; then echo "Dangerous command blocked!" && exit 1; fi'
    },
    {
      name: 'Git Commit Validation',
      pattern: 'git_commit',
      command: 'echo "Running pre-commit validation..." && if [ -f .pre-commit-config.yaml ]; then pre-commit run --all-files; fi'
    },
    {
      name: 'API Key Check',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Checking for API keys..." && if grep -r "sk-[a-zA-Z0-9]\\{48\\}" $CLAUDE_FILE_PATHS > /dev/null 2>&1; then echo "API key detected - review before commit!" && exit 1; fi'
    },
    {
      name: 'File Permission Check',
      pattern: 'Write',
      command: 'echo "Checking file permissions..." && if [ ! -w "$CLAUDE_FILE_PATHS" ]; then echo "No write permission!" && exit 1; fi'
    },
    {
      name: 'Backup Important Files',
      pattern: 'Edit|MultiEdit',
      command: 'echo "Creating backup..." && for file in $CLAUDE_FILE_PATHS; do cp "$file" "$file.backup.$(date +%Y%m%d_%H%M%S)"; done'
    }
  ],
  PostToolUse: [
    {
      name: 'Auto Format Code',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Auto-formatting code..." && for file in $CLAUDE_FILE_PATHS; do if [[ "$file" == *.py ]]; then black "$file" && isort "$file"; elif [[ "$file" == *.js || "$file" == *.ts ]]; then npx prettier --write "$file"; elif [[ "$file" == *.go ]]; then gofmt -w "$file"; fi; done'
    },
    {
      name: 'Run Tests',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Running tests..." && if [ -f package.json ]; then npm test; elif [ -f requirements.txt ]; then python -m pytest; elif [ -f go.mod ]; then go test ./...; fi'
    },
    {
      name: 'Git Auto-Add',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Auto-adding to git..." && git add $CLAUDE_FILE_PATHS && echo "Files staged for commit"'
    },
    {
      name: 'Lint Code',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Linting code..." && for file in $CLAUDE_FILE_PATHS; do if [[ "$file" == *.py ]]; then ruff check --fix "$file"; elif [[ "$file" == *.js || "$file" == *.ts ]]; then npx eslint --fix "$file"; fi; done'
    },
    {
      name: 'Log Changes',
      pattern: '*',
      command: 'echo "$(date): Tool $CLAUDE_TOOL_NAME executed on $CLAUDE_FILE_PATHS" >> ~/.claude-activity.log'
    }
  ],
  Notification: [
    {
      name: 'Desktop Notification',
      pattern: '*',
      command: 'osascript -e "display notification \\"$CLAUDE_NOTIFICATION\\" with title \\"Claude Code\\" sound name \\"Glass\\""'
    },
    {
      name: 'TTS Alert',
      pattern: '*',
      command: 'TEMP_FILE=$(mktemp).wav && curl -s -X POST "http://100.83.40.11:8080/v1/tts" -H "Content-Type: application/json" -d "{\\"text\\": \\"$CLAUDE_NOTIFICATION\\"}" -o "$TEMP_FILE" && afplay "$TEMP_FILE" && rm "$TEMP_FILE"'
    },
    {
      name: 'Slack Notification',
      pattern: '*',
      command: 'curl -X POST -H "Content-Type: application/json" -d "{\\"text\\": \\"Claude Code: $CLAUDE_NOTIFICATION\\"}" $SLACK_WEBHOOK_URL'
    },
    {
      name: 'Email Alert',
      pattern: '*',
      command: 'echo "Claude Code Alert: $CLAUDE_NOTIFICATION" | mail -s "Claude Code Notification" $EMAIL_ADDRESS'
    },
    {
      name: 'Log Notification',
      pattern: '*',
      command: 'echo "$(date): $CLAUDE_NOTIFICATION" >> ~/.claude-notifications.log'
    }
  ],
  Stop: [
    {
      name: 'Success Notification',
      pattern: '*',
      command: 'osascript -e "display notification \\"Claude has completed the task!\\" with title \\"Claude Code\\" sound name \\"Purr\\""'
    },
    {
      name: 'Generate Summary',
      pattern: '*',
      command: 'echo "Task completed at $(date)" >> ~/.claude-session-summary.log'
    },
    {
      name: 'Cleanup Temp Files',
      pattern: '*',
      command: 'echo "Cleaning up..." && find /tmp -name "claude-*" -type f -mtime +1 -delete'
    },
    {
      name: 'Backup Project',
      pattern: '*',
      command: 'echo "Creating project backup..." && tar -czf "backup-$(date +%Y%m%d_%H%M%S).tar.gz" . --exclude="node_modules" --exclude=".git" --exclude="backup-*"'
    },
    {
      name: 'Push to Git',
      pattern: '*',
      command: 'echo "Pushing to git..." && git add -A && git commit -m "Auto-commit: Claude session completed" && git push'
    }
  ],
  SubagentStop: [
    {
      name: 'Subagent Complete Notification',
      pattern: '*',
      command: 'osascript -e "display notification \\"Subagent task completed!\\" with title \\"Claude Code\\" sound name \\"Tink\\""'
    },
    {
      name: 'Log Subagent Activity',
      pattern: '*',
      command: 'echo "$(date): Subagent completed task" >> ~/.claude-subagent.log'
    },
    {
      name: 'Validate Subagent Output',
      pattern: '*',
      command: 'echo "Validating subagent output..." && if [ -f "subagent-output.json" ]; then python -m json.tool subagent-output.json > /dev/null; fi'
    },
    {
      name: 'Merge Subagent Results',
      pattern: '*',
      command: 'echo "Processing subagent results..." && if [ -f "merge-results.sh" ]; then bash merge-results.sh; fi'
    },
    {
      name: 'Archive Subagent Data',
      pattern: '*',
      command: 'echo "Archiving subagent data..." && mkdir -p ~/.claude/subagent-archive && cp -r subagent-* ~/.claude/subagent-archive/ 2>/dev/null || true'
    }
  ]
};

// MCP Server Templates
const MCP_TEMPLATES = {
  // Browser Automation
  playwright: {
    name: 'Playwright',
    description: 'Browser automation and testing',
    command: 'npx @executeautomation/playwright-mcp-server',
    installCommand: 'npm install -D @executeautomation/playwright-mcp-server playwright',
    requiresInstall: true
  },
  puppeteer: {
    name: 'Puppeteer',
    description: 'Browser automation',
    command: 'npx @modelcontextprotocol/server-puppeteer',
    installCommand: 'npm install -D @modelcontextprotocol/server-puppeteer',
    requiresInstall: true
  },
  
  // File System & Git
  filesystem: {
    name: 'Filesystem',
    description: 'File system operations',
    command: 'npx @modelcontextprotocol/server-filesystem {directory_path}',
    installCommand: 'npm install -D @modelcontextprotocol/server-filesystem',
    requiresInstall: true,
    parameters: [
      {
        name: 'directory_path',
        label: 'Directory Path',
        description: 'Path to the directory to allow filesystem access',
        required: true,
        default: '/path/to/allowed/directory'
      }
    ]
  },
  git: {
    name: 'Git',
    description: 'Git repository operations',
    command: 'npx @modelcontextprotocol/server-git',
    installCommand: 'npm install -D @modelcontextprotocol/server-git',
    requiresInstall: true
  },
  
  // Web & HTTP
  fetch: {
    name: 'Web Fetch',
    description: 'HTTP requests and web scraping',
    command: 'npx @modelcontextprotocol/server-fetch',
    installCommand: 'npm install -D @modelcontextprotocol/server-fetch',
    requiresInstall: true
  },
  brave: {
    name: 'Brave Search',
    description: 'Web search via Brave API',
    command: 'npx @modelcontextprotocol/server-brave-search',
    installCommand: 'npm install -D @modelcontextprotocol/server-brave-search',
    requiresInstall: true,
    envVars: [
      {
        name: 'BRAVE_API_KEY',
        label: 'Brave Search API Key',
        description: 'Brave Search API key for web search',
        required: true,
        envHints: ['brave_api_key', 'brave_search_key', 'brave_key']
      }
    ]
  },
  
  // Version Control & Cloud
  github: {
    name: 'GitHub',
    description: 'GitHub repository access',
    command: 'npx github-mcp-server',
    installCommand: 'npm install -D github-mcp-server',
    requiresInstall: true,
    envVars: [
      {
        name: 'GITHUB_TOKEN',
        label: 'GitHub Personal Access Token',
        description: 'GitHub PAT for repository access',
        required: true,
        envHints: ['github_token', 'gh_token', 'github_pat']
      }
    ]
  },
  gitlab: {
    name: 'GitLab',
    description: 'GitLab repository management',
    command: 'npx @gitlab/mcp-server',
    installCommand: 'npm install -D @gitlab/mcp-server',
    requiresInstall: true,
    envVars: [
      {
        name: 'GITLAB_TOKEN',
        label: 'GitLab Personal Access Token',
        description: 'GitLab PAT for repository access',
        required: true,
        envHints: ['gitlab_token', 'gitlab_pat', 'gl_token']
      },
      {
        name: 'GITLAB_URL',
        label: 'GitLab URL',
        description: 'GitLab instance URL (optional for gitlab.com)',
        required: false,
        default: 'https://gitlab.com',
        envHints: ['gitlab_url', 'gitlab_host']
      }
    ]
  },
  
  // Databases
  postgresql: {
    name: 'PostgreSQL',
    description: 'PostgreSQL database operations',
    command: 'npx @henkey/postgres-mcp-server --connection-string "{connection_string}"',
    installCommand: 'npm install -D @henkey/postgres-mcp-server',
    requiresInstall: true,
    parameters: [
      {
        name: 'connection_string',
        label: 'Connection String',
        description: 'PostgreSQL connection string',
        required: true,
        default: 'postgresql://user:pass@localhost:5432/db',
        envHints: ['database_url', 'postgresql_url', 'postgres_url']
      }
    ]
  },
  mysql: {
    name: 'MySQL',
    description: 'MySQL database operations',
    command: 'npx @benborla29/mcp-server-mysql',
    installCommand: 'npm install -D @benborla29/mcp-server-mysql',
    requiresInstall: true
  },
  sqlite: {
    name: 'SQLite',
    description: 'SQLite database operations',
    command: 'npx -y mcp-server-sqlite-npx {database_path}',
    installCommand: 'npm install -D mcp-server-sqlite-npx',
    requiresInstall: true,
    parameters: [
      {
        name: 'database_path',
        label: 'Database Path',
        description: 'Path to the SQLite database file',
        required: true,
        default: '/path/to/database.db'
      }
    ]
  },
  
  // Cloud Services
  supabase: {
    name: 'Supabase',
    description: 'Supabase database and API access',
    command: 'npx @supabase/mcp-server-supabase@latest',
    installCommand: 'npm install -D @supabase/mcp-server-supabase',
    requiresInstall: true,
    parameters: [
      {
        name: 'project_ref',
        label: 'Project Reference',
        description: 'Supabase project reference ID',
        required: true,
        envHints: ['supabase_project_ref', 'supabase_ref', 'project_ref']
      }
    ],
    envVars: [
      {
        name: 'SUPABASE_ACCESS_TOKEN',
        label: 'Supabase Access Token',
        description: 'Supabase access token for database access',
        required: true,
        envHints: ['supabase_access_token', 'supabase_token', 'supabase_key']
      }
    ]
  },
  vercel: {
    name: 'Vercel',
    description: 'Vercel deployment and project management',
    command: 'npx @vercel/mcp-server',
    installCommand: 'npm install -D @vercel/mcp-server',
    requiresInstall: true
  },
  
  // Container & Infrastructure
  docker: {
    name: 'Docker',
    description: 'Docker container management',
    command: 'npx @quantgeekdev/docker-mcp',
    installCommand: 'npm install -D @quantgeekdev/docker-mcp',
    requiresInstall: true
  },
  dockerhub: {
    name: 'DockerHub',
    description: 'DockerHub registry access',
    command: 'npx @dockerhub/mcp-server',
    installCommand: 'npm install -D @dockerhub/mcp-server',
    requiresInstall: true
  },
  
  // Graph Databases
  neo4j: {
    name: 'Neo4j',
    description: 'Neo4j graph database operations',
    command: 'npx @neo4j/mcp-server',
    installCommand: 'npm install -D @neo4j/mcp-server',
    requiresInstall: true
  },
  
  // AI & Memory
  memory: {
    name: 'Memory',
    description: 'Persistent memory using knowledge graphs',
    command: 'npx @modelcontextprotocol/server-memory',
    installCommand: 'npm install -D @modelcontextprotocol/server-memory',
    requiresInstall: true
  },
  sequential: {
    name: 'Sequential Thinking',
    description: 'Dynamic problem-solving with persistent state',
    command: 'npx @modelcontextprotocol/server-sequential-thinking',
    installCommand: 'npm install -D @modelcontextprotocol/server-sequential-thinking',
    requiresInstall: true
  },
  
  // Communication
  slack: {
    name: 'Slack',
    description: 'Slack workspace integration',
    command: 'npx @slack/mcp-server',
    installCommand: 'npm install -D @slack/mcp-server',
    requiresInstall: true,
    envVars: [
      {
        name: 'SLACK_BOT_TOKEN',
        label: 'Slack Bot Token',
        description: 'Slack bot token (starts with xoxb-)',
        required: true,
        envHints: ['slack_bot_token', 'slack_token', 'bot_token']
      }
    ]
  },
  
  // Productivity
  notion: {
    name: 'Notion',
    description: 'Notion workspace access',
    command: 'npx @notion/mcp-server',
    installCommand: 'npm install -D @notion/mcp-server',
    requiresInstall: true,
    envVars: [
      {
        name: 'NOTION_API_KEY',
        label: 'Notion Integration Token',
        description: 'Notion integration token from your workspace',
        required: true,
        envHints: ['notion_api_key', 'notion_token', 'notion_key']
      }
    ]
  },
  
  // Search & Analytics
  googlesheets: {
    name: 'Google Sheets',
    description: 'Google Sheets integration',
    command: 'npx @google/sheets-mcp-server',
    installCommand: 'npm install -D @google/sheets-mcp-server',
    requiresInstall: true
  },
  
  // Package Management
  npm: {
    name: 'NPM Search',
    description: 'Search and explore NPM packages',
    command: 'npx npm-search-mcp-server',
    installCommand: 'npm install -D npm-search-mcp-server',
    requiresInstall: true
  },
  
  // Multi-AI Integration
  zen: {
    name: 'Zen MCP',
    description: 'Multi-AI integration (Gemini, OpenAI, OpenRouter, Ollama)',
    command: 'npx zen-mcp-server-199bio',
    installCommand: 'npm install -D zen-mcp-server-199bio',
    requiresInstall: true,
    envVars: [
      {
        name: 'OPENAI_API_KEY',
        label: 'OpenAI API Key',
        description: 'OpenAI API key for GPT models',
        required: false,
        envHints: ['openai_api_key', 'openai_key']
      },
      {
        name: 'GEMINI_API_KEY',
        label: 'Google Gemini API Key',
        description: 'Google Gemini API key',
        required: false,
        envHints: ['gemini_api_key', 'google_ai_key', 'gemini_key']
      },
      {
        name: 'OPENROUTER_API_KEY',
        label: 'OpenRouter API Key',
        description: 'OpenRouter API key for model access',
        required: false,
        envHints: ['openrouter_api_key', 'openrouter_key']
      }
    ]
  },
  
  // Web Scraping & Data
  brightdata: {
    name: 'Bright Data',
    description: 'Web scraping and data extraction',
    command: 'npx @brightdata/mcp',
    installCommand: 'npm install -D @brightdata/mcp',
    requiresInstall: true,
    envVars: [
      {
        name: 'BRIGHTDATA_API_TOKEN',
        label: 'Bright Data API Token',
        description: 'Bright Data API token for web scraping',
        required: true,
        envHints: ['brightdata_api_token', 'brightdata_token', 'bright_data_key']
      }
    ]
  },
  firecrawl: {
    name: 'Fire Crawl',
    description: 'Web crawling and scraping',
    command: 'npx -y firecrawl-mcp',
    installCommand: 'npm install -D firecrawl-mcp',
    requiresInstall: true
  },
  
  // AI Services
  elevenlabs: {
    name: '11 Labs (ElevenLabs)',
    description: 'Text-to-speech and audio processing',
    command: 'uvx elevenlabs-mcp',
    installCommand: 'pip install uv',
    requiresInstall: true,
    envVars: [
      {
        name: 'ELEVENLABS_API_KEY',
        label: 'ElevenLabs API Key',
        description: 'ElevenLabs API key for text-to-speech',
        required: true,
        envHints: ['elevenlabs_api_key', 'eleven_labs_key', 'elevenlabs_key']
      }
    ]
  },
  
  // Documentation & Context
  context7: {
    name: 'Context7',
    description: 'Up-to-date code documentation for LLMs',
    command: 'npx @upstash/context7-mcp',
    installCommand: 'npm install -D @upstash/context7-mcp',
    requiresInstall: true
  },
  
  // Video & Media
  youtube: {
    name: 'YouTube Transcript',
    description: 'Download YouTube video transcripts',
    command: 'npx @kimtaeyoon83/mcp-server-youtube-transcript',
    installCommand: 'npm install -D @kimtaeyoon83/mcp-server-youtube-transcript',
    requiresInstall: true
  },
  
  // Task Management
  taskmaster: {
    name: 'Task Master',
    description: 'Task management and automation',
    command: 'npx @milkosten/task-master-mcp',
    installCommand: 'npm install -D @milkosten/task-master-mcp',
    requiresInstall: true
  },
  
  // Monitoring & Observability
  opik: {
    name: 'Opik',
    description: 'LLM observability and evaluation platform',
    command: 'npx @comet-ml/opik-mcp',
    installCommand: 'npm install -D @comet-ml/opik-mcp',
    requiresInstall: true
  },
  
  // Cloud Services
  aws: {
    name: 'AWS Core',
    description: 'AWS services integration',
    command: 'uvx awslabs.core-mcp-server@latest',
    installCommand: 'pip install uv',
    requiresInstall: true
  },

  // Code Analysis & Graph
  'code-grapher': {
    name: 'Code Grapher',
    description: 'Code analysis and visualization with Neo4j and Ollama',
    command: 'python /Users/danielbeach/Code/code-grapher/mcp_server.py',
    installCommand: 'pip install neo4j-driver ollama',
    requiresInstall: false,
    envVars: [
      {
        name: 'NEO4J_URL',
        label: 'Neo4j Database URL',
        description: 'Neo4j database connection URL',
        required: true,
        default: 'bolt://localhost:7687',
        envHints: ['neo4j_url', 'neo4j_uri', 'database_url']
      },
      {
        name: 'NEO4J_USERNAME',
        label: 'Neo4j Username',
        description: 'Neo4j database username',
        required: true,
        default: 'neo4j',
        envHints: ['neo4j_username', 'neo4j_user', 'db_username']
      },
      {
        name: 'NEO4J_PASSWORD',
        label: 'Neo4j Password',
        description: 'Neo4j database password',
        required: false,
        envHints: ['neo4j_password', 'neo4j_pass', 'db_password']
      },
      {
        name: 'OLLAMA_URL',
        label: 'Ollama Server URL',
        description: 'Ollama server endpoint for AI processing',
        required: true,
        default: 'http://localhost:11434',
        envHints: ['ollama_url', 'ollama_endpoint', 'ollama_host']
      }
    ]
  }
};

class ClaudeManager {
  constructor() {
    this.app = express();
    this.server = null;
    this.wss = null;
    this.watchers = [];
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.registryFile = path.join(this.registryPath, 'registry.json');
    this.cachePath = path.join(this.registryPath, 'cache');
    this.userEnvFile = path.join(this.registryPath, 'user.env');
    this.settingsFile = path.join(this.registryPath, 'settings.json');
    this.sessionTrackingFile = path.join(this.registryPath, 'session-tracking.json');
    this.mcpServersFile = path.join(this.registryPath, 'mcp-servers.json');
    this.claudeDesktopConfigPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    this.claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
    this.state = {
      userConfig: {},
      projects: {},
      mcpServers: {},
      projectMcpServers: {}, // Project-scoped MCP servers: { projectName: { serverName: config } }
      claudeDesktopMcpServers: {},
      managedMcpServers: {}, // Our separate MCP server configurations with enable/disable
      userEnvVars: {},
      projectEnvVars: {},
      settings: {},
      sessionTracking: {
        enabled: false,
        currentSessionStart: null,
        billingDate: 1, // Default to 1st of the month
        monthlySessions: 0,
        lastScannedTimestamp: null,
        sessionHistory: []
      },
      lastUpdate: Date.now()
    };
    this.sessionCountdownInterval = null;
  }

  async init() {
    await this.ensureDirectories();
    await this.loadRegistry();
    this.setupFileWatchers();
    await this.setupSessionWatcher();
    this.setupWebServer();
    await this.refreshAllData();
    console.log('🚀 Claude Manager started on http://localhost:3456');
  }

  async ensureDirectories() {
    await fs.ensureDir(this.registryPath);
    await fs.ensureDir(this.cachePath);
  }

  async loadRegistry() {
    try {
      if (await fs.pathExists(this.registryFile)) {
        const data = await fs.readJson(this.registryFile);
        this.state.projects = data.projects || {};
      }
      
      // Load persistent settings
      if (await fs.pathExists(this.settingsFile)) {
        const settings = await fs.readJson(this.settingsFile);
        this.state.settings = { ...this.state.settings, ...settings };
      }

      // Load session tracking data
      if (await fs.pathExists(this.sessionTrackingFile)) {
        const sessionData = await fs.readJson(this.sessionTrackingFile);
        this.state.sessionTracking = { ...this.state.sessionTracking, ...sessionData };
        
        // Start countdown interval if tracking is enabled and we have an active session
        if (this.state.sessionTracking.enabled && this.state.sessionTracking.currentSessionStart) {
          this.startSessionCountdown();
        }
      }

      // Load managed MCP servers
      await this.loadManagedMcpServers();
    } catch (error) {
      console.error('Error loading registry:', error.message);
      this.state.projects = {};
    }
  }

  async saveRegistry() {
    await fs.writeJson(this.registryFile, {
      projects: this.state.projects,
      lastUpdate: Date.now()
    }, { spaces: 2 });
  }


  async saveSettings() {
    await fs.writeJson(this.settingsFile, this.state.settings, { spaces: 2 });
  }

  async saveSessionTracking() {
    await fs.writeJson(this.sessionTrackingFile, this.state.sessionTracking, { spaces: 2 });
  }

  async loadManagedMcpServers() {
    try {
      if (await fs.pathExists(this.mcpServersFile)) {
        const data = await fs.readJson(this.mcpServersFile);
        this.state.managedMcpServers = data || {};
      } else {
        this.state.managedMcpServers = {};
      }
    } catch (error) {
      console.error('Error loading managed MCP servers:', error.message);
      this.state.managedMcpServers = {};
    }
  }

  async saveManagedMcpServers() {
    try {
      await fs.writeJson(this.mcpServersFile, this.state.managedMcpServers, { spaces: 2 });
    } catch (error) {
      console.error('Error saving managed MCP servers:', error.message);
      throw error;
    }
  }

  getUserConfigPaths() {
    return {
      settings: path.join(os.homedir(), '.claude', 'settings.json'),
      settingsLocal: path.join(os.homedir(), '.claude', 'settings.local.json'),
      memory: path.join(os.homedir(), '.claude', 'CLAUDE.md'),
      commands: path.join(os.homedir(), '.claude', 'commands')
    };
  }

  getProjectConfigPaths(projectPath) {
    return {
      settings: path.join(projectPath, '.claude', 'settings.json'),
      settingsLocal: path.join(projectPath, '.claude', 'settings.local.json'),
      mcp: path.join(projectPath, '.mcp.json'),
      memory: path.join(projectPath, 'CLAUDE.md'),
      commands: path.join(projectPath, '.claude', 'commands')
    };
  }

  setupFileWatchers() {
    const userPaths = this.getUserConfigPaths();
    
    // Watch user-level configs
    Object.values(userPaths).forEach(filePath => {
      if (fs.existsSync(filePath)) {
        const watcher = chokidar.watch(filePath);
        watcher.on('change', () => this.onFileChange('user', filePath));
        this.watchers.push(watcher);
      }
    });

    // Watch project configs
    Object.entries(this.state.projects).forEach(([name, config]) => {
      const projectPaths = this.getProjectConfigPaths(config.path);
      Object.values(projectPaths).forEach(filePath => {
        if (fs.existsSync(filePath)) {
          const watcher = chokidar.watch(filePath);
          watcher.on('change', () => this.onFileChange('project', filePath, name));
          this.watchers.push(watcher);
        }
      });
    });
  }

  async onFileChange(scope, filePath, projectName = null) {
    console.log(`📁 File changed: ${filePath}`);
    
    try {
      if (scope === 'user') {
        await this.refreshUserConfig();
      } else if (scope === 'project' && projectName) {
        await this.refreshProjectConfig(projectName);
      }
      
      this.broadcast({ type: 'fileChange', scope, filePath, projectName });
    } catch (error) {
      console.error('Error handling file change:', error.message);
    }
  }

  async refreshUserConfig() {
    const paths = this.getUserConfigPaths();
    const config = {};

    // Load settings
    if (await fs.pathExists(paths.settings)) {
      try {
        config.settings = await fs.readJson(paths.settings);
      } catch (error) {
        config.settings = { error: error.message };
      }
    }

    // Load memory
    if (await fs.pathExists(paths.memory)) {
      try {
        config.memory = await fs.readFile(paths.memory, 'utf8');
      } catch (error) {
        config.memory = { error: error.message };
      }
    }

    // Load commands
    if (await fs.pathExists(paths.commands)) {
      try {
        config.commands = await this.loadCommands(paths.commands);
      } catch (error) {
        config.commands = { error: error.message };
      }
    }

    this.state.userConfig = config;
  }

  async refreshProjectConfig(projectName) {
    const project = this.state.projects[projectName];
    if (!project) return;

    const paths = this.getProjectConfigPaths(project.path);
    const config = {};

    // Load all project config files
    for (const [key, filePath] of Object.entries(paths)) {
      if (await fs.pathExists(filePath)) {
        try {
          if (key === 'memory') {
            config[key] = await fs.readFile(filePath, 'utf8');
          } else if (key === 'commands') {
            config[key] = await this.loadCommands(filePath);
          } else {
            config[key] = await fs.readJson(filePath);
          }
        } catch (error) {
          config[key] = { error: error.message };
        }
      }
    }

    if (!this.state.projects[projectName]) {
      this.state.projects[projectName] = project;
    }
    this.state.projects[projectName].config = config;
  }

  async loadCommands(commandsPath) {
    const commands = {};
    
    if (!await fs.pathExists(commandsPath)) {
      return commands;
    }

    const entries = await fs.readdir(commandsPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const commandName = entry.name.replace('.md', '');
        const commandPath = path.join(commandsPath, entry.name);
        try {
          const content = await fs.readFile(commandPath, 'utf8');
          commands[commandName] = {
            content,
            path: commandPath,
            name: commandName
          };
        } catch (error) {
          commands[commandName] = { error: error.message };
        }
      } else if (entry.isDirectory()) {
        // Support namespaced commands in subdirectories
        const subCommands = await this.loadCommands(path.join(commandsPath, entry.name));
        for (const [subCommandName, subCommand] of Object.entries(subCommands)) {
          commands[`${entry.name}/${subCommandName}`] = subCommand;
        }
      }
    }
    
    return commands;
  }

  async refreshMcpServers() {
    return new Promise((resolve) => {
      exec('claude mcp list', (error, stdout, stderr) => {
        if (error) {
          this.state.mcpServers = { error: error.message };
          resolve();
          return;
        }

        try {
          // Try to parse as JSON first
          this.state.mcpServers = JSON.parse(stdout);
          resolve();
          return;
        } catch (parseError) {
          // Parse text output manually and filter by scope
          const lines = stdout.split('\n').filter(line => line.trim());
          const serverNames = [];
          
          // Extract server names from the list
          lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('No MCP') && !trimmed.startsWith('---')) {
              const colonIndex = trimmed.indexOf(':');
              if (colonIndex > 0) {
                const name = trimmed.substring(0, colonIndex).trim();
                if (name) {
                  serverNames.push(name);
                }
              }
            }
          });

          if (serverNames.length === 0) {
            this.state.mcpServers = { info: 'No MCP servers found' };
            resolve();
            return;
          }

          // Get details for each server to check scope
          const serverDetailsPromises = serverNames.map(name => {
            return new Promise((resolveServer) => {
              exec(`claude mcp get "${name}"`, (error, stdout, stderr) => {
                if (error) {
                  // Server no longer exists, skip it
                  console.log(`Server ${name} no longer exists, skipping`);
                  resolveServer(null);
                  return;
                }

                const lines = stdout.split('\n');
                let scope = 'Unknown';
                let command = '';
                let args = [];

                lines.forEach(line => {
                  const trimmed = line.trim();
                  if (trimmed.startsWith('Scope:')) {
                    scope = trimmed.replace('Scope:', '').trim();
                  } else if (trimmed.startsWith('Command:')) {
                    command = trimmed.replace('Command:', '').trim();
                  } else if (trimmed.startsWith('Args:')) {
                    const argsStr = trimmed.replace('Args:', '').trim();
                    if (argsStr) {
                      args = [argsStr];
                    }
                  }
                });

                resolveServer({
                  name,
                  scope,
                  command,
                  args
                });
              });
            });
          });

          Promise.all(serverDetailsPromises).then(serverDetails => {
            const servers = {};
            
            // Filter to only include User scope servers and exclude null results
            serverDetails.forEach(server => {
              if (server && server.scope && server.scope.includes('User')) {
                servers[server.name] = {
                  command: server.command + (server.args.length > 0 ? ' ' + server.args.join(' ') : ''),
                  args: server.args,
                  scope: server.scope
                };
              }
            });

            this.state.mcpServers = Object.keys(servers).length > 0 ? servers : { 
              info: 'No user-scoped MCP servers found' 
            };
            resolve();
          }).catch(error => {
            console.error('Error refreshing MCP servers:', error);
            this.state.mcpServers = { error: error.message };
            resolve();
          });
        }
      });
    });
  }

  async refreshProjectMcpServers() {
    try {
      this.state.projectMcpServers = {};
      
      for (const [projectName, projectInfo] of Object.entries(this.state.projects)) {
        const projectPath = projectInfo.path;
        const settingsPath = path.join(projectPath, '.claude', 'settings.json');
        
        try {
          if (await fs.pathExists(settingsPath)) {
            const content = await fs.readFile(settingsPath, 'utf8');
            const settings = JSON.parse(content);
            
            if (settings.mcpServers && Object.keys(settings.mcpServers).length > 0) {
              this.state.projectMcpServers[projectName] = settings.mcpServers;
            }
          }
        } catch (error) {
          console.error(`Error loading MCP servers for project ${projectName}:`, error.message);
          // Don't fail completely, just skip this project
        }
      }
    } catch (error) {
      console.error('Error refreshing project MCP servers:', error.message);
      this.state.projectMcpServers = { error: error.message };
    }
  }

  async refreshAllData() {
    await this.refreshUserConfig();
    await this.refreshMcpServers();
    await this.refreshProjectMcpServers();
    await this.refreshClaudeDesktopMcpServers();
    await this.refreshUserEnvVars();
    
    for (const projectName of Object.keys(this.state.projects)) {
      await this.refreshProjectConfig(projectName);
      await this.refreshProjectEnvVars(projectName);
    }
    
    this.state.lastUpdate = Date.now();
  }

  // Claude Desktop MCP Management
  async refreshClaudeDesktopMcpServers() {
    try {
      if (await fs.pathExists(this.claudeDesktopConfigPath)) {
        const config = await fs.readJson(this.claudeDesktopConfigPath);
        this.state.claudeDesktopMcpServers = config.mcpServers || {};
      } else {
        this.state.claudeDesktopMcpServers = {};
      }
    } catch (error) {
      console.error('Error loading Claude Desktop MCP servers:', error.message);
      this.state.claudeDesktopMcpServers = { error: error.message };
    }
  }

  async saveClaudeDesktopConfig() {
    try {
      let config = {};
      if (await fs.pathExists(this.claudeDesktopConfigPath)) {
        config = await fs.readJson(this.claudeDesktopConfigPath);
      }
      
      config.mcpServers = this.state.claudeDesktopMcpServers;
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.claudeDesktopConfigPath));
      await fs.writeJson(this.claudeDesktopConfigPath, config, { spaces: 2 });
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to save Claude Desktop config: ${error.message}`);
    }
  }

  convertMcpTemplateToDesktopFormat(template, parameters = {}, envVars = {}) {
    const desktopConfig = {
      command: 'npx',
      args: []
    };

    // Parse the original command
    if (template.command.startsWith('npx ')) {
      const parts = template.command.split(' ');
      desktopConfig.args = parts.slice(1); // Remove 'npx'
    } else if (template.command.startsWith('uvx ')) {
      desktopConfig.command = 'uvx';
      const parts = template.command.split(' ');
      desktopConfig.args = parts.slice(1); // Remove 'uvx'
    } else {
      // For other commands, split and use first as command
      const parts = template.command.split(' ');
      desktopConfig.command = parts[0];
      desktopConfig.args = parts.slice(1);
    }

    // Substitute parameters in args
    if (parameters && template.parameters) {
      template.parameters.forEach(param => {
        if (parameters[param.name]) {
          desktopConfig.args = desktopConfig.args.map(arg => 
            arg.replace(`{${param.name}}`, parameters[param.name])
          );
        }
      });
    }

    // Add environment variables directly to args if needed
    if (envVars && template.envVars) {
      template.envVars.forEach(envVar => {
        if (envVars[envVar.name]) {
          // Some templates like Supabase need access tokens in args
          if (envVar.name === 'SUPABASE_ACCESS_TOKEN' || template.name === 'Supabase') {
            desktopConfig.args.push('--access-token', envVars[envVar.name]);
          }
          // Add other patterns as needed
        }
      });
    }

    return desktopConfig;
  }

  async addClaudeDesktopMcpServer(name, template, parameters = {}, envVars = {}) {
    try {
      if (!MCP_TEMPLATES[template]) {
        throw new Error(`Template ${template} not found`);
      }

      const templateConfig = MCP_TEMPLATES[template];
      const desktopConfig = this.convertMcpTemplateToDesktopFormat(templateConfig, parameters, envVars);
      
      // Load current config
      await this.refreshClaudeDesktopMcpServers();
      
      // Add new server
      if (this.state.claudeDesktopMcpServers.error) {
        this.state.claudeDesktopMcpServers = {};
      }
      
      this.state.claudeDesktopMcpServers[name] = desktopConfig;
      
      // Save config
      await this.saveClaudeDesktopConfig();
      
      return { success: true, message: `${name} MCP server added to Claude Desktop` };
    } catch (error) {
      throw new Error(`Failed to add Claude Desktop MCP server: ${error.message}`);
    }
  }

  async removeClaudeDesktopMcpServer(name) {
    try {
      await this.refreshClaudeDesktopMcpServers();
      
      if (this.state.claudeDesktopMcpServers[name]) {
        delete this.state.claudeDesktopMcpServers[name];
        await this.saveClaudeDesktopConfig();
        return { success: true, message: `${name} MCP server removed from Claude Desktop` };
      } else {
        throw new Error(`MCP server ${name} not found in Claude Desktop config`);
      }
    } catch (error) {
      throw new Error(`Failed to remove Claude Desktop MCP server: ${error.message}`);
    }
  }

  async removeMcpServer(name, scope = 'user', projectPath = null) {
    try {
      // Validate and sanitize server name
      if (!name || typeof name !== 'string') {
        throw new Error('Invalid server name provided');
      }
      
      // Sanitize server name to prevent command injection
      const sanitizedName = name.replace(/[;&|`$(){}[\]\\'"]/g, '');
      if (sanitizedName !== name) {
        throw new Error('Server name contains invalid characters');
      }
      
      // Determine the scope and execution context
      const scopeFlag = scope === 'project' ? '--scope project' : '--scope user';
      const execOptions = scope === 'project' && projectPath ? { cwd: projectPath } : {};
      
      console.log(`Removing MCP server: ${sanitizedName} with scope: ${scope}`);
      
      // Use Claude CLI to remove the MCP server with proper escaping
      const result = await new Promise((resolve, reject) => {
        // Use shell escape to properly quote the server name
        const { spawn } = require('child_process');
        const args = ['mcp', 'remove', sanitizedName];
        if (scopeFlag) {
          args.push('--scope', scope === 'project' ? 'project' : 'user');
        }
        
        const child = spawn('claude', args, execOptions);
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
          }
        });
        
        child.on('error', (error) => {
          reject(new Error(`Failed to execute command: ${error.message}`));
        });
      });

      // Refresh the MCP servers data
      await this.refreshMcpServers();
      
      return { success: true, message: `${sanitizedName} MCP server removed from ${scope} scope successfully` };
    } catch (error) {
      console.error(`Error removing MCP server ${name}:`, error);
      throw new Error(`Failed to remove MCP server: ${error.message}`);
    }
  }

  // Managed MCP Server Methods
  async addManagedMcpServer(name, template, parameters = {}, envVars = {}, scope = 'user', projectPath = null) {
    try {
      if (!MCP_TEMPLATES[template]) {
        throw new Error(`Template ${template} not found`);
      }

      const templateConfig = MCP_TEMPLATES[template];
      let finalCommand = templateConfig.command;

      // Substitute parameters in command
      if (parameters && templateConfig.parameters) {
        templateConfig.parameters.forEach(param => {
          if (parameters[param.name]) {
            const placeholder = `{${param.name}}`;
            finalCommand = finalCommand.replace(placeholder, parameters[param.name]);
          }
        });
      }

      // Store configuration in our managed storage
      this.state.managedMcpServers[name] = {
        name,
        template,
        templateConfig,
        command: finalCommand,
        parameters,
        envVars,
        scope,
        projectPath,
        enabled: false, // Start disabled so user can enable when ready
        createdAt: Date.now(),
        lastModified: Date.now()
      };

      await this.saveManagedMcpServers();
      return { success: true, message: `${name} MCP server configuration saved successfully` };
    } catch (error) {
      throw new Error(`Failed to add managed MCP server: ${error.message}`);
    }
  }

  async enableManagedMcpServer(name) {
    try {
      const server = this.state.managedMcpServers[name];
      if (!server) {
        throw new Error(`Managed MCP server ${name} not found`);
      }

      // Validate and sanitize server name
      if (!name || typeof name !== 'string') {
        throw new Error('Invalid server name provided');
      }
      
      // Sanitize server name to prevent command injection
      const sanitizedName = name.replace(/[;&|`$(){}[\]\\'"]/g, '');
      if (sanitizedName !== name) {
        throw new Error('Server name contains invalid characters');
      }

      // Add environment variables to the appropriate .env file
      if (server.envVars && Object.keys(server.envVars).length > 0) {
        if (server.scope === 'project' && server.projectPath) {
          // Add to project .env
          const projectName = Object.keys(this.state.projects).find(
            pName => this.state.projects[pName].path === server.projectPath
          );
          if (projectName) {
            for (const [key, value] of Object.entries(server.envVars)) {
              await this.addEnvToProject(projectName, key, value);
            }
          }
        } else {
          // Add to user .env
          for (const [key, value] of Object.entries(server.envVars)) {
            await this.saveUserEnvVar(key, value);
          }
        }
      }

      // Install dependencies if needed
      if (server.templateConfig.requiresInstall && server.templateConfig.installCommand) {
        if (server.scope === 'project' && server.projectPath) {
          console.log(`Installing dependencies for ${server.templateConfig.name}...`);
          
          await new Promise((resolve, reject) => {
            exec(server.templateConfig.installCommand, { cwd: server.projectPath }, (error, stdout, stderr) => {
              if (error) {
                console.error(`Install failed: ${error.message}`);
                reject(error);
              } else {
                console.log(`Successfully installed ${server.templateConfig.name}`);
                resolve();
              }
            });
          });
        }
      }

      // Add the MCP server to Claude's configuration using secure spawn
      const execOptions = server.scope === 'project' && server.projectPath ? { cwd: server.projectPath } : {};
      
      console.log(`Enabling MCP server: ${sanitizedName} with scope: ${server.scope}`);
      
      // Clean the command to remove flags that Claude CLI doesn't understand
      const cleanCommand = server.command.replace(/\s+-y\s+/, ' ').trim();
      
      // Parse the command into arguments
      const commandParts = cleanCommand.split(/\s+/).filter(part => part.length > 0);
      
      // Build the arguments array safely
      const args = ['mcp', 'add', '--scope', server.scope, sanitizedName, ...commandParts];
      
      await new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const child = spawn('claude', args, execOptions);
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
          }
        });
        
        child.on('error', (error) => {
          reject(new Error(`Failed to execute command: ${error.message}`));
        });
      });

      // Update enabled status
      server.enabled = true;
      server.lastModified = Date.now();
      server.lastEnabled = Date.now();

      await this.saveManagedMcpServers();
      await this.refreshMcpServers();

      return { success: true, message: `${sanitizedName} MCP server enabled successfully` };
    } catch (error) {
      console.error(`Error enabling MCP server ${name}:`, error);
      throw new Error(`Failed to enable MCP server: ${error.message}`);
    }
  }

  async disableManagedMcpServer(name) {
    try {
      const server = this.state.managedMcpServers[name];
      if (!server) {
        throw new Error(`Managed MCP server ${name} not found`);
      }

      // Validate and sanitize server name
      if (!name || typeof name !== 'string') {
        throw new Error('Invalid server name provided');
      }
      
      // Sanitize server name to prevent command injection
      const sanitizedName = name.replace(/[;&|`$(){}[\]\\'"]/g, '');
      if (sanitizedName !== name) {
        throw new Error('Server name contains invalid characters');
      }

      // Remove the MCP server from Claude's configuration
      const scopeFlag = server.scope === 'project' ? '--scope project' : '--scope user';
      const execOptions = server.scope === 'project' && server.projectPath ? { cwd: server.projectPath } : {};
      
      console.log(`Disabling MCP server: ${sanitizedName} with scope: ${server.scope}`);
      
      try {
        await new Promise((resolve, reject) => {
          // Use spawn instead of exec for better control
          const { spawn } = require('child_process');
          const args = ['mcp', 'remove', sanitizedName];
          if (scopeFlag) {
            args.push('--scope', server.scope === 'project' ? 'project' : 'user');
          }
          
          const child = spawn('claude', args, execOptions);
          let stdout = '';
          let stderr = '';
          
          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          child.on('close', (code) => {
            if (code === 0) {
              resolve(stdout);
            } else {
              // Don't fail if server is already removed, just warn
              console.warn(`Warning: Command failed with code ${code}: ${stderr || stdout}`);
              resolve(stdout);
            }
          });
          
          child.on('error', (error) => {
            console.warn(`Warning: Failed to execute command: ${error.message}`);
            resolve(''); // Don't fail the operation
          });
        });
      } catch (cmdError) {
        // Log the error but don't fail the disable operation
        console.warn(`Warning removing MCP server from Claude config: ${cmdError.message}`);
      }

      // Update enabled status but keep configuration
      server.enabled = false;
      server.lastModified = Date.now();
      server.lastDisabled = Date.now();

      await this.saveManagedMcpServers();
      await this.refreshMcpServers();

      return { success: true, message: `${sanitizedName} MCP server disabled successfully` };
    } catch (error) {
      console.error(`Error disabling MCP server ${name}:`, error);
      throw new Error(`Failed to disable MCP server: ${error.message}`);
    }
  }

  async deleteManagedMcpServer(name) {
    try {
      const server = this.state.managedMcpServers[name];
      if (!server) {
        throw new Error(`Managed MCP server ${name} not found`);
      }

      // Disable first if enabled
      if (server.enabled) {
        await this.disableManagedMcpServer(name);
      }

      // Remove from our managed storage
      delete this.state.managedMcpServers[name];
      await this.saveManagedMcpServers();

      return { success: true, message: `${name} MCP server deleted successfully` };
    } catch (error) {
      throw new Error(`Failed to delete MCP server: ${error.message}`);
    }
  }

  getMcpServerLogsPath(serverName) {
    // Claude Code logs are typically stored in ~/.claude/logs/
    const logsDir = path.join(os.homedir(), '.claude', 'logs');
    
    // Different possible log file patterns
    const possibleLogFiles = [
      path.join(logsDir, `${serverName}.log`),
      path.join(logsDir, `mcp-${serverName}.log`),
      path.join(logsDir, `server-${serverName}.log`),
      path.join(logsDir, 'claude.log'), // General Claude log
      path.join(logsDir, 'mcp.log'), // General MCP log
    ];

    // Return the first existing log file, or the general Claude log as default
    for (const logFile of possibleLogFiles) {
      if (fs.existsSync(logFile)) {
        return logFile;
      }
    }

    // If no specific logs found, return the general Claude log path
    return path.join(logsDir, 'claude.log');
  }

  // Migration function to import existing MCP servers
  async migrateExistingMcpServers() {
    try {
      const migrationResults = {
        success: true,
        migrated: [],
        skipped: [],
        errors: []
      };

      // Get current MCP servers from Claude CLI
      const mcpList = await new Promise((resolve, reject) => {
        exec('claude mcp list', (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout);
          }
        });
      });

      // Parse the MCP list output
      const lines = mcpList.split('\n').filter(line => line.trim());
      const existingServers = {};
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && trimmed.includes(':')) {
          const colonIndex = trimmed.indexOf(':');
          const name = trimmed.substring(0, colonIndex).trim();
          const command = trimmed.substring(colonIndex + 1).trim();
          if (name && command) {
            existingServers[name] = command;
          }
        }
      });

      // For each existing server, try to match it to a template and migrate
      for (const [serverName, serverCommand] of Object.entries(existingServers)) {
        try {
          // Skip if already in managed servers
          if (this.state.managedMcpServers[serverName]) {
            migrationResults.skipped.push({
              name: serverName,
              reason: 'Already in managed servers'
            });
            continue;
          }

          // Try to match command to a template
          const matchedTemplate = this.findTemplateForCommand(serverCommand);
          
          if (matchedTemplate) {
            // Create managed server entry
            this.state.managedMcpServers[serverName] = {
              name: serverName,
              template: matchedTemplate.key,
              templateConfig: matchedTemplate.config,
              command: serverCommand,
              parameters: {},
              envVars: {},
              scope: 'user', // Assume user scope for existing servers
              projectPath: null,
              enabled: true, // Mark as enabled since it's currently active
              createdAt: Date.now(),
              lastModified: Date.now(),
              migratedAt: Date.now(),
              originalCommand: serverCommand
            };

            migrationResults.migrated.push({
              name: serverName,
              template: matchedTemplate.key,
              command: serverCommand
            });
          } else {
            // Create as custom/unknown template
            this.state.managedMcpServers[serverName] = {
              name: serverName,
              template: 'custom',
              templateConfig: {
                name: 'Custom Server',
                description: 'Migrated from existing installation',
                command: serverCommand,
                requiresInstall: false
              },
              command: serverCommand,
              parameters: {},
              envVars: {},
              scope: 'user',
              projectPath: null,
              enabled: true,
              createdAt: Date.now(),
              lastModified: Date.now(),
              migratedAt: Date.now(),
              originalCommand: serverCommand
            };

            migrationResults.migrated.push({
              name: serverName,
              template: 'custom',
              command: serverCommand
            });
          }
        } catch (error) {
          migrationResults.errors.push({
            name: serverName,
            error: error.message
          });
        }
      }

      // Save the updated managed servers
      await this.saveManagedMcpServers();

      return migrationResults;
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}`);
    }
  }

  findTemplateForCommand(command) {
    // Try to match the command to one of our templates
    for (const [key, template] of Object.entries(MCP_TEMPLATES)) {
      // Clean commands for comparison
      const cleanCommand = command.replace(/^npx\s+(-y\s+)?/, '').split(' ')[0];
      const cleanTemplateCommand = template.command.replace(/^npx\s+(-y\s+)?/, '').split(' ')[0];
      
      if (cleanCommand === cleanTemplateCommand) {
        return { key, config: template };
      }
      
      // Also check for partial matches
      if (cleanCommand.includes(cleanTemplateCommand) || cleanTemplateCommand.includes(cleanCommand)) {
        return { key, config: template };
      }
    }
    
    return null;
  }

  // Environment Variables Management
  async refreshUserEnvVars() {
    try {
      if (await fs.pathExists(this.userEnvFile)) {
        const content = await fs.readFile(this.userEnvFile, 'utf8');
        this.state.userEnvVars = this.parseEnvFile(content);
      } else {
        this.state.userEnvVars = {};
      }
    } catch (error) {
      console.error('Error loading user env vars:', error.message);
      this.state.userEnvVars = { error: error.message };
    }
  }

  async refreshProjectEnvVars(projectName) {
    const project = this.state.projects[projectName];
    if (!project) return;

    const envPath = path.join(project.path, '.env');
    try {
      if (await fs.pathExists(envPath)) {
        const content = await fs.readFile(envPath, 'utf8');
        if (!this.state.projectEnvVars[projectName]) {
          this.state.projectEnvVars[projectName] = {};
        }
        this.state.projectEnvVars[projectName] = this.parseEnvFile(content);
      } else {
        if (!this.state.projectEnvVars[projectName]) {
          this.state.projectEnvVars[projectName] = {};
        }
      }
    } catch (error) {
      console.error(`Error loading project env vars for ${projectName}:`, error.message);
      this.state.projectEnvVars[projectName] = { error: error.message };
    }
  }

  parseEnvFile(content) {
    const vars = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          const value = trimmed.substring(equalIndex + 1).trim();
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, '');
          vars[key] = cleanValue;
        }
      }
    }
    
    return vars;
  }

  maskEnvValue(value) {
    if (!value) return '';
    
    // Truncate long values to keep display clean
    const maxDisplayLength = 20;
    
    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }
    
    if (value.length <= maxDisplayLength) {
      const firstTwo = value.substring(0, 2);
      const lastTwo = value.substring(value.length - 2);
      const middle = '*'.repeat(Math.max(0, value.length - 4));
      return firstTwo + middle + lastTwo;
    }
    
    // For very long values, just show first 2 chars + asterisks + last 2 chars
    const firstTwo = value.substring(0, 2);
    const lastTwo = value.substring(value.length - 2);
    const middleLength = Math.min(12, maxDisplayLength - 4); // Cap at reasonable length
    return firstTwo + '*'.repeat(middleLength) + lastTwo;
  }

  async saveUserEnvVar(key, value) {
    try {
      // Load existing vars
      let existingVars = {};
      if (await fs.pathExists(this.userEnvFile)) {
        const content = await fs.readFile(this.userEnvFile, 'utf8');
        existingVars = this.parseEnvFile(content);
      }

      // Add/update the variable
      existingVars[key] = value;

      // Write back to file
      const envContent = Object.entries(existingVars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      
      await fs.writeFile(this.userEnvFile, envContent, 'utf8');
      await this.refreshUserEnvVars();
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to save user env var: ${error.message}`);
    }
  }

  async deleteUserEnvVar(key) {
    try {
      if (await fs.pathExists(this.userEnvFile)) {
        const content = await fs.readFile(this.userEnvFile, 'utf8');
        const existingVars = this.parseEnvFile(content);
        
        if (key in existingVars) {
          delete existingVars[key];
          
          const envContent = Object.entries(existingVars)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
          
          await fs.writeFile(this.userEnvFile, envContent, 'utf8');
          await this.refreshUserEnvVars();
        }
      }
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete user env var: ${error.message}`);
    }
  }

  async addEnvToProject(projectName, key, value) {
    try {
      const project = this.state.projects[projectName];
      if (!project) {
        throw new Error('Project not found');
      }

      const envPath = path.join(project.path, '.env');
      let existingVars = {};
      
      // Load existing .env if it exists
      if (await fs.pathExists(envPath)) {
        const content = await fs.readFile(envPath, 'utf8');
        existingVars = this.parseEnvFile(content);
      }

      // Add/update the variable
      existingVars[key] = value;

      // Write to project .env
      const envContent = Object.entries(existingVars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      
      await fs.writeFile(envPath, envContent, 'utf8');
      await this.refreshProjectEnvVars(projectName);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to add env var to project: ${error.message}`);
    }
  }

  async deleteEnvFromProject(projectName, key) {
    try {
      const project = this.state.projects[projectName];
      if (!project) {
        throw new Error('Project not found');
      }

      const envPath = path.join(project.path, '.env');
      
      if (await fs.pathExists(envPath)) {
        const content = await fs.readFile(envPath, 'utf8');
        const existingVars = this.parseEnvFile(content);
        
        if (key in existingVars) {
          delete existingVars[key];
          
          // Write updated content back to .env
          const envContent = Object.entries(existingVars)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
          
          await fs.writeFile(envPath, envContent, 'utf8');
          await this.refreshProjectEnvVars(projectName);
          
          return { success: true };
        } else {
          throw new Error(`Environment variable "${key}" not found in project`);
        }
      } else {
        throw new Error('Project .env file not found');
      }
    } catch (error) {
      throw new Error(`Failed to delete env var from project: ${error.message}`);
    }
  }

  async copyEnvToUser(projectName, key) {
    try {
      const project = this.state.projects[projectName];
      if (!project) {
        throw new Error('Project not found');
      }

      const envPath = path.join(project.path, '.env');
      
      if (await fs.pathExists(envPath)) {
        const content = await fs.readFile(envPath, 'utf8');
        const existingVars = this.parseEnvFile(content);
        
        if (key in existingVars) {
          // Copy the variable to user-level .env
          await this.saveUserEnvVar(key, existingVars[key]);
          return { success: true };
        } else {
          throw new Error(`Environment variable "${key}" not found in project`);
        }
      } else {
        throw new Error('Project .env file not found');
      }
    } catch (error) {
      throw new Error(`Failed to copy env var to user level: ${error.message}`);
    }
  }

  setupWebServer() {
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json());

    this.app.get('/api/status', (req, res) => {
      res.json(this.state);
    });

    this.app.get('/api/mcp-templates', (req, res) => {
      res.json(MCP_TEMPLATES);
    });

    this.app.get('/api/common-hooks', (req, res) => {
      res.json(COMMON_HOOKS);
    });

    this.app.post('/api/save-file', async (req, res) => {
      let { filePath, content, type } = req.body;
      
      if (!filePath || content === undefined) {
        return res.status(400).json({ error: 'File path and content required' });
      }

      try {
        // Expand tilde paths
        if (filePath.startsWith('~')) {
          filePath = path.join(os.homedir(), filePath.slice(1));
        }

        // Validate file path is safe
        const allowedPaths = [
          path.join(os.homedir(), '.claude', 'CLAUDE.md'),
          path.join(os.homedir(), '.claude', 'settings.json')
        ];

        // Add project paths
        Object.values(this.state.projects).forEach(project => {
          allowedPaths.push(path.join(project.path, 'CLAUDE.md'));
          allowedPaths.push(path.join(project.path, '.claude', 'settings.json'));
          allowedPaths.push(path.join(project.path, '.claude', 'settings.local.json'));
        });

        const isAllowed = allowedPaths.some(allowed => path.resolve(filePath) === path.resolve(allowed));
        
        if (!isAllowed) {
          return res.status(403).json({ error: 'File path not allowed' });
        }

        // Ensure directory exists
        await fs.ensureDir(path.dirname(filePath));

        // Validate JSON if it's a JSON file
        if (type === 'json') {
          try {
            JSON.parse(content);
          } catch (parseError) {
            return res.status(400).json({ error: 'Invalid JSON format' });
          }
        }

        // Write the file
        await fs.writeFile(filePath, content, 'utf8');
        
        // Refresh relevant config
        if (filePath.includes(os.homedir())) {
          await this.refreshUserConfig();
        } else {
          // Find which project this belongs to
          for (const [projectName, project] of Object.entries(this.state.projects)) {
            if (filePath.startsWith(project.path)) {
              await this.refreshProjectConfig(projectName);
              break;
            }
          }
        }

        res.json({ success: true, message: 'File saved successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Commands API endpoints
    this.app.post('/api/save-command', async (req, res) => {
      const { scope, projectName, commandName, content } = req.body;
      
      if (!scope || !commandName || content === undefined) {
        return res.status(400).json({ error: 'Scope, command name, and content required' });
      }

      try {
        let commandsPath;
        if (scope === 'user') {
          commandsPath = path.join(os.homedir(), '.claude', 'commands');
        } else if (scope === 'project' && projectName) {
          const project = this.state.projects[projectName];
          if (!project) {
            return res.status(404).json({ error: 'Project not found' });
          }
          commandsPath = path.join(project.path, '.claude', 'commands');
        } else {
          return res.status(400).json({ error: 'Invalid scope or missing project name' });
        }

        // Ensure commands directory exists
        await fs.ensureDir(commandsPath);
        
        const filePath = path.join(commandsPath, `${commandName}.md`);
        await fs.writeFile(filePath, content, 'utf8');

        // Refresh config to pick up the new command
        if (scope === 'user') {
          await this.refreshUserConfig();
        } else {
          await this.refreshProjectConfig(projectName);
        }

        res.json({ success: true, message: 'Command saved successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/delete-command', async (req, res) => {
      const { scope, projectName, commandName } = req.body;
      
      if (!scope || !commandName) {
        return res.status(400).json({ error: 'Scope and command name required' });
      }

      try {
        let commandsPath;
        if (scope === 'user') {
          commandsPath = path.join(os.homedir(), '.claude', 'commands');
        } else if (scope === 'project' && projectName) {
          const project = this.state.projects[projectName];
          if (!project) {
            return res.status(404).json({ error: 'Project not found' });
          }
          commandsPath = path.join(project.path, '.claude', 'commands');
        } else {
          return res.status(400).json({ error: 'Invalid scope or missing project name' });
        }

        const filePath = path.join(commandsPath, `${commandName}.md`);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }

        // Refresh config to remove the command
        if (scope === 'user') {
          await this.refreshUserConfig();
        } else {
          await this.refreshProjectConfig(projectName);
        }

        res.json({ success: true, message: 'Command deleted successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/register-project', async (req, res) => {
      const { name, path: projectPath } = req.body;
      
      if (!name || !projectPath) {
        return res.status(400).json({ error: 'Name and path required' });
      }

      this.state.projects[name] = {
        path: projectPath,
        registeredAt: Date.now()
      };

      await this.saveRegistry();
      await this.refreshProjectConfig(name);
      
      res.json({ success: true });
    });

    this.app.post('/api/unregister-project', async (req, res) => {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Project name required' });
      }

      if (!this.state.projects[name]) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Remove project from registry
      delete this.state.projects[name];
      
      // Clean up project environment variables
      if (this.state.projectEnvVars[name]) {
        delete this.state.projectEnvVars[name];
      }

      await this.saveRegistry();
      
      res.json({ success: true, message: `Project "${name}" unregistered successfully` });
    });

    this.app.post('/api/add-mcp-server', async (req, res) => {
      const { name, command, scope, template, projectPath, parameters, envVars, target } = req.body;
      
      if (!name || (!command && !template)) {
        return res.status(400).json({ error: 'Name and command/template required' });
      }

      try {
        // Handle Claude Desktop target
        if (target === 'claude-desktop') {
          const result = await this.addClaudeDesktopMcpServer(name, template, parameters, envVars);
          return res.json(result);
        }

        // Handle Claude Code target (existing logic)
        let finalCommand = command;
        let installNeeded = false;

        // Handle template
        if (template && MCP_TEMPLATES[template]) {
          const templateConfig = MCP_TEMPLATES[template];
          finalCommand = templateConfig.command;
          installNeeded = templateConfig.requiresInstall;

          // Substitute parameters in command
          if (parameters && templateConfig.parameters) {
            templateConfig.parameters.forEach(param => {
              if (parameters[param.name]) {
                const placeholder = `{${param.name}}`;
                finalCommand = finalCommand.replace(placeholder, parameters[param.name]);
              }
            });
          }

          // Add environment variables to the appropriate .env file
          if (envVars && Object.keys(envVars).length > 0) {
            if (scope === 'project' && projectPath) {
              // Add to project .env
              const projectName = Object.keys(this.state.projects).find(
                pName => this.state.projects[pName].path === projectPath
              );
              if (projectName) {
                for (const [key, value] of Object.entries(envVars)) {
                  await this.addEnvToProject(projectName, key, value);
                }
              }
            } else {
              // Add to user .env
              for (const [key, value] of Object.entries(envVars)) {
                await this.saveUserEnvVar(key, value);
              }
            }
          }

          // For project scope, install dependencies first
          if (scope === 'project' && installNeeded && projectPath) {
            console.log(`Installing dependencies for ${templateConfig.name}...`);
            
            await new Promise((resolve, reject) => {
              exec(templateConfig.installCommand, { cwd: projectPath }, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Install failed: ${error.message}`);
                  reject(error);
                } else {
                  console.log(`Successfully installed ${templateConfig.name}`);
                  resolve();
                }
              });
            });
          }
        }

        // Add the MCP server
        const scopeFlag = `--scope ${scope}`;
        const addCommand = `claude mcp add ${scopeFlag} ${name} ${finalCommand}`;
        
        const execOptions = scope === 'project' && projectPath ? { cwd: projectPath } : {};
        
        exec(addCommand, execOptions, (error, stdout, stderr) => {
          if (error) {
            res.status(500).json({ error: error.message });
          } else {
            this.refreshMcpServers();
            res.json({ success: true, message: `${name} MCP server added successfully` });
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/add-hook', async (req, res) => {
      const { event, pattern, command } = req.body;
      
      if (!event || !command) {
        return res.status(400).json({ error: 'Event and command required' });
      }

      try {
        const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
        
        // Read existing settings or create new
        let settings = {};
        if (await fs.pathExists(userSettingsPath)) {
          settings = await fs.readJson(userSettingsPath);
        }

        // Initialize hooks structure
        if (!settings.hooks) {
          settings.hooks = {};
        }
        if (!settings.hooks[event]) {
          settings.hooks[event] = [];
        }

        // Add new hook
        const newHook = {
          matcher: pattern,
          hooks: [{
            type: 'command',
            command: command
          }]
        };

        settings.hooks[event].push(newHook);

        // Ensure directory exists
        await fs.ensureDir(path.dirname(userSettingsPath));
        
        // Write back to file
        await fs.writeJson(userSettingsPath, settings, { spaces: 2 });
        
        await this.refreshUserConfig();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Environment Variables API endpoints
    this.app.post('/api/add-user-env', async (req, res) => {
      const { key, value } = req.body;
      
      if (!key || value === undefined) {
        return res.status(400).json({ error: 'Key and value required' });
      }

      try {
        await this.saveUserEnvVar(key, value);
        res.json({ success: true, message: 'Environment variable saved' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/delete-user-env', async (req, res) => {
      const { key } = req.body;
      
      if (!key) {
        return res.status(400).json({ error: 'Key required' });
      }

      try {
        await this.deleteUserEnvVar(key);
        res.json({ success: true, message: 'Environment variable deleted' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/add-env-to-project', async (req, res) => {
      const { projectName, key, value } = req.body;
      
      if (!projectName || !key || value === undefined) {
        return res.status(400).json({ error: 'Project name, key, and value required' });
      }

      try {
        await this.addEnvToProject(projectName, key, value);
        res.json({ success: true, message: 'Environment variable added to project' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/delete-env-from-project', async (req, res) => {
      const { projectName, key } = req.body;
      
      if (!projectName || !key) {
        return res.status(400).json({ error: 'Project name and key required' });
      }

      try {
        await this.deleteEnvFromProject(projectName, key);
        res.json({ success: true, message: 'Environment variable removed from project' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/copy-env-to-user', async (req, res) => {
      const { projectName, key } = req.body;
      
      if (!projectName || !key) {
        return res.status(400).json({ error: 'Project name and key required' });
      }

      try {
        await this.copyEnvToUser(projectName, key);
        res.json({ success: true, message: 'Environment variable copied to user level' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Claude Desktop MCP API endpoints
    this.app.get('/api/claude-desktop-mcp-servers', async (req, res) => {
      try {
        await this.refreshClaudeDesktopMcpServers();
        res.json(this.state.claudeDesktopMcpServers);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/remove-claude-desktop-mcp-server', async (req, res) => {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Server name required' });
      }

      try {
        const result = await this.removeClaudeDesktopMcpServer(name);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/remove-mcp-server', async (req, res) => {
      const { name, scope, projectPath } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Server name required' });
      }

      try {
        const result = await this.removeMcpServer(name, scope, projectPath);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Managed MCP Server API endpoints
    this.app.get('/api/managed-mcp-servers', (req, res) => {
      res.json(this.state.managedMcpServers);
    });

    this.app.post('/api/add-managed-mcp-server', async (req, res) => {
      const { name, template, parameters, envVars, scope, projectPath } = req.body;
      
      if (!name || !template) {
        return res.status(400).json({ error: 'Name and template required' });
      }

      try {
        const result = await this.addManagedMcpServer(name, template, parameters, envVars, scope, projectPath);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/enable-managed-mcp-server', async (req, res) => {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Server name required' });
      }

      try {
        const result = await this.enableManagedMcpServer(name);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/disable-managed-mcp-server', async (req, res) => {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Server name required' });
      }

      try {
        const result = await this.disableManagedMcpServer(name);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/delete-managed-mcp-server', async (req, res) => {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Server name required' });
      }

      try {
        const result = await this.deleteManagedMcpServer(name);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mcp-server-logs/:serverName', (req, res) => {
      const { serverName } = req.params;
      
      try {
        const logsPath = this.getMcpServerLogsPath(serverName);
        res.json({ 
          success: true, 
          logsPath,
          exists: fs.existsSync(logsPath)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/migrate-existing-mcp-servers', async (req, res) => {
      try {
        const result = await this.migrateExistingMcpServers();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/claude-desktop-config-path', (req, res) => {
      res.json({ 
        path: this.claudeDesktopConfigPath,
        exists: fs.existsSync(this.claudeDesktopConfigPath)
      });
    });

    // Session Tracking API endpoints
    this.app.post('/api/toggle-session-tracking', async (req, res) => {
      const { enabled } = req.body;
      
      try {
        this.state.sessionTracking.enabled = enabled;
        
        if (enabled) {
          // Initial scan when enabling
          await this.updateSessionTracking();
        } else {
          // Clear countdown when disabling
          if (this.sessionCountdownInterval) {
            clearInterval(this.sessionCountdownInterval);
            this.sessionCountdownInterval = null;
          }
        }
        
        await this.saveSessionTracking();
        this.broadcast({ type: 'sessionTracking', data: this.getSessionStats() });
        
        res.json({ success: true, enabled });
      } catch (error) {
        console.error('Error toggling session tracking:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/session-stats', (req, res) => {
      res.json(this.getSessionStats());
    });

    this.app.get('/api/countdown', (req, res) => {
      const stats = this.getSessionStats();
      res.json({
        isActive: stats.isActive,
        timeRemaining: stats.timeRemaining
      });
    });

    this.app.post('/api/set-billing-date', async (req, res) => {
      const { billingDate } = req.body;
      
      try {
        if (billingDate < 1 || billingDate > 28) {
          return res.status(400).json({ error: 'Billing date must be between 1 and 28' });
        }
        
        this.state.sessionTracking.billingDate = billingDate;
        
        // Rescan with new billing date
        if (this.state.sessionTracking.enabled) {
          await this.updateSessionTracking();
        }
        
        await this.saveSessionTracking();
        res.json({ success: true, billingDate });
      } catch (error) {
        console.error('Error setting billing date:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // TTS Notification API
    this.app.post('/api/tts-notification', async (req, res) => {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text required for TTS' });
      }

      try {
        // Call Fish Speech S1 server
        const ttsResponse = await fetch('http://100.83.40.11:8080/v1/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });

        if (!ttsResponse.ok) {
          throw new Error(`TTS server responded with status: ${ttsResponse.status}`);
        }

        // Get the audio data
        const audioBuffer = await ttsResponse.arrayBuffer();
        
        // Convert to base64 for easy transmission
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');
        
        res.json({ 
          success: true, 
          audio: audioBase64,
          format: 'wav'
        });
      } catch (error) {
        console.error('TTS Error:', error.message);
        res.status(500).json({ error: `TTS failed: ${error.message}` });
      }
    });

    this.app.get('/api/session-status', (req, res) => {
      const tracking = this.state.sessionTracking;
      res.json({
        enabled: tracking.enabled,
        sessions: tracking.sessionHistory || [],
        monthlySessions: tracking.monthlySessions,
        currentSessionStart: tracking.currentSessionStart,
        billingDate: tracking.billingDate
      });
    });

    this.server = this.app.listen(3456);
    
    // WebSocket server for real-time updates
    this.wss = new WebSocket.Server({ server: this.server });
    this.wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'init', data: this.state }));
    });
  }

  broadcast(message) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  // Session Tracking Methods
  async parseJSONLFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      const messages = [];
      const sessions = new Map(); // Track sessions and their metrics
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // Initialize session tracking if not exists
          if (!sessions.has(entry.sessionId)) {
            sessions.set(entry.sessionId, {
              sessionId: entry.sessionId,
              userPrompts: 0,
              assistantResponses: 0,
              totalTokensUsed: 0,
              inputTokens: 0,
              outputTokens: 0,
              startTimestamp: null,
              lastActivity: null
            });
          }
          
          const sessionData = sessions.get(entry.sessionId);
          const timestamp = new Date(entry.timestamp).getTime();
          
          // Update session activity time
          if (!sessionData.startTimestamp) {
            sessionData.startTimestamp = timestamp;
          }
          sessionData.lastActivity = timestamp;
          
          // Track user messages (prompts)
          if (entry.type === 'user' && entry.message?.role === 'user') {
            sessionData.userPrompts++;
            
            // Add message entry for session calculation
            messages.push({
              timestamp: timestamp,
              sessionId: entry.sessionId,
              sessionData: sessionData
            });
          }
          
          // Track assistant responses and token usage
          if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
            sessionData.assistantResponses++;
          }
          
          // Extract token usage from usage objects
          if (entry.message && entry.message.usage) {
            const usage = entry.message.usage;
            if (usage.input_tokens) {
              sessionData.inputTokens += usage.input_tokens;
            }
            if (usage.output_tokens) {
              sessionData.outputTokens += usage.output_tokens;
            }
            // Calculate total tokens
            sessionData.totalTokensUsed += (usage.input_tokens || 0) + (usage.output_tokens || 0);
            
            // Also include cache tokens if available
            if (usage.cache_creation_input_tokens) {
              sessionData.inputTokens += usage.cache_creation_input_tokens;
              sessionData.totalTokensUsed += usage.cache_creation_input_tokens;
            }
            if (usage.cache_read_input_tokens) {
              sessionData.inputTokens += usage.cache_read_input_tokens;
              sessionData.totalTokensUsed += usage.cache_read_input_tokens;
            }
          }
          
        } catch (e) {
          // Skip malformed lines
        }
      }
      
      return messages;
    } catch (error) {
      return [];
    }
  }

  async scanAllJSONLFiles() {
    try {
      const projectsDir = this.claudeProjectsPath;
      if (!await fs.pathExists(projectsDir)) {
        return [];
      }

      const allMessages = [];
      
      // Recursively find all .jsonl files
      const findJSONLFiles = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = [];
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...await findJSONLFiles(fullPath));
          } else if (entry.name.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        }
        
        return files;
      };

      const jsonlFiles = await findJSONLFiles(projectsDir);
      
      // Parse all files
      for (const file of jsonlFiles) {
        const messages = await this.parseJSONLFile(file);
        allMessages.push(...messages);
      }
      
      // Sort by timestamp
      allMessages.sort((a, b) => a.timestamp - b.timestamp);
      
      return allMessages;
    } catch (error) {
      console.error('Error scanning JSONL files:', error);
      return [];
    }
  }

  calculateSessions(messages, billingDate) {
    if (!messages.length) return { sessions: [], count: 0 };
    
    const sessions = [];
    let currentSessionStart = null;
    let currentSessionData = null;
    const sessionMetrics = new Map(); // Track cumulative metrics per session window
    
    // Calculate billing period start
    const now = new Date();
    let billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), billingDate);
    if (billingPeriodStart > now) {
      billingPeriodStart.setMonth(billingPeriodStart.getMonth() - 1);
    }
    
    const billingPeriodStartTime = billingPeriodStart.getTime();
    const fiveHoursMs = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
    
    for (const message of messages) {
      // Skip messages before current billing period
      if (message.timestamp < billingPeriodStartTime) continue;
      
      if (!currentSessionStart || message.timestamp - currentSessionStart > fiveHoursMs) {
        // New session window
        currentSessionStart = message.timestamp;
        currentSessionData = {
          start: currentSessionStart,
          end: Math.min(currentSessionStart + fiveHoursMs, Date.now()),
          userPrompts: 0,
          assistantResponses: 0,
          totalTokensUsed: 0,
          inputTokens: 0,
          outputTokens: 0,
          sessionIds: new Set()
        };
        sessions.push(currentSessionData);
      }
      
      // Aggregate metrics from the session data
      if (message.sessionData && currentSessionData) {
        const sessionId = message.sessionData.sessionId;
        
        // Only count each session ID once per 5-hour window
        if (!currentSessionData.sessionIds.has(sessionId)) {
          currentSessionData.sessionIds.add(sessionId);
          currentSessionData.userPrompts += message.sessionData.userPrompts;
          currentSessionData.assistantResponses += message.sessionData.assistantResponses;
          currentSessionData.totalTokensUsed += message.sessionData.totalTokensUsed;
          currentSessionData.inputTokens += message.sessionData.inputTokens;
          currentSessionData.outputTokens += message.sessionData.outputTokens;
        }
      }
    }
    
    // Update last session end time if it's current and add current session info
    if (sessions.length > 0) {
      const lastSession = sessions[sessions.length - 1];
      const now = Date.now();
      if (now - lastSession.start < fiveHoursMs) {
        lastSession.end = now;
        lastSession.isActive = true;
      }
      
      // Convert sessionIds Set to count for serialization
      sessions.forEach(session => {
        session.uniqueSessionsCount = session.sessionIds.size;
        delete session.sessionIds; // Remove Set for clean JSON
      });
    }
    
    return { sessions, count: sessions.length };
  }

  async updateSessionTracking() {
    if (!this.state.sessionTracking.enabled) return;
    
    try {
      const messages = await this.scanAllJSONLFiles();
      const { sessions, count } = this.calculateSessions(messages, this.state.sessionTracking.billingDate);
      
      // Update state
      this.state.sessionTracking.monthlySessions = count;
      this.state.sessionTracking.sessionHistory = sessions;
      
      // Update current session
      if (sessions.length > 0 && sessions[sessions.length - 1].isActive) {
        this.state.sessionTracking.currentSessionStart = sessions[sessions.length - 1].start;
      } else {
        this.state.sessionTracking.currentSessionStart = null;
      }
      
      this.state.sessionTracking.lastScannedTimestamp = Date.now();
      
      await this.saveSessionTracking();
      this.broadcast({ type: 'sessionTracking', data: this.getSessionStats() });
    } catch (error) {
      console.error('Error updating session tracking:', error);
    }
  }

  getSessionStats() {
    const tracking = this.state.sessionTracking;
    if (!tracking.enabled) {
      return { enabled: false };
    }
    
    const now = Date.now();
    const fiveHoursMs = 5 * 60 * 60 * 1000;
    let timeRemaining = null;
    let isActive = false;
    
    if (tracking.currentSessionStart) {
      const elapsed = now - tracking.currentSessionStart;
      if (elapsed < fiveHoursMs) {
        isActive = true;
        timeRemaining = fiveHoursMs - elapsed;
      }
    }
    
    // Get current and previous session metrics
    const sessions = tracking.sessionHistory || [];
    const currentSession = sessions.find(s => s.isActive) || null;
    const previousSession = sessions.length > 1 ? sessions[sessions.length - 2] : null;
    
    // Cost calculation helper
    const calculateCosts = (inputTokens, outputTokens) => {
      // Sonnet 4 pricing: $3/MTok input, $15/MTok output
      const sonnet4InputCost = (inputTokens / 1000000) * 3;
      const sonnet4OutputCost = (outputTokens / 1000000) * 15;
      const sonnet4Total = sonnet4InputCost + sonnet4OutputCost;
      
      // Opus 4 pricing (estimated): $15/MTok input, $75/MTok output
      const opus4InputCost = (inputTokens / 1000000) * 15;
      const opus4OutputCost = (outputTokens / 1000000) * 75;
      const opus4Total = opus4InputCost + opus4OutputCost;
      
      return {
        sonnet4: sonnet4Total,
        opus4: opus4Total
      };
    };
    
    return {
      enabled: tracking.enabled,
      isActive,
      currentSessionStart: tracking.currentSessionStart,
      timeRemaining,
      monthlySessions: tracking.monthlySessions,
      billingDate: tracking.billingDate,
      lastScanned: tracking.lastScannedTimestamp,
      currentSession: currentSession ? {
        userPrompts: currentSession.userPrompts,
        assistantResponses: currentSession.assistantResponses,
        totalTokensUsed: currentSession.totalTokensUsed,
        inputTokens: currentSession.inputTokens,
        outputTokens: currentSession.outputTokens,
        uniqueSessionsCount: currentSession.uniqueSessionsCount,
        start: currentSession.start,
        end: currentSession.end,
        costs: calculateCosts(currentSession.inputTokens, currentSession.outputTokens)
      } : null,
      previousSession: previousSession ? {
        userPrompts: previousSession.userPrompts,
        assistantResponses: previousSession.assistantResponses,
        totalTokensUsed: previousSession.totalTokensUsed,
        inputTokens: previousSession.inputTokens,
        outputTokens: previousSession.outputTokens,
        uniqueSessionsCount: previousSession.uniqueSessionsCount,
        start: previousSession.start,
        end: previousSession.end,
        duration: previousSession.end - previousSession.start,
        costs: calculateCosts(previousSession.inputTokens, previousSession.outputTokens)
      } : null
    };
  }

  startSessionCountdown() {
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
    }
    
    this.sessionCountdownInterval = setInterval(() => {
      const stats = this.getSessionStats();
      if (stats.isActive) {
        this.broadcast({ type: 'sessionCountdown', data: stats });
      } else {
        // Session ended, do a full rescan
        this.updateSessionTracking();
        clearInterval(this.sessionCountdownInterval);
        this.sessionCountdownInterval = null;
      }
    }, 1000); // Update every second
  }

  async setupSessionWatcher() {
    if (!await fs.pathExists(this.claudeProjectsPath)) {
      await fs.ensureDir(this.claudeProjectsPath);
    }
    
    // Watch for any changes in the Claude projects directory
    const watcher = chokidar.watch(path.join(this.claudeProjectsPath, '**/*.jsonl'), {
      persistent: true,
      ignoreInitial: true,
      depth: 10
    });
    
    let updateTimer = null;
    const scheduleUpdate = () => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        if (this.state.sessionTracking.enabled) {
          this.updateSessionTracking();
        }
      }, 2000); // Debounce updates
    };
    
    watcher.on('add', scheduleUpdate);
    watcher.on('change', scheduleUpdate);
    watcher.on('unlink', scheduleUpdate);
    
    this.watchers.push(watcher);
  }

  async shutdown() {
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
    }
    this.watchers.forEach(watcher => watcher.close());
    if (this.server) {
      this.server.close();
    }
    console.log('Claude Manager stopped');
  }
}

const manager = new ClaudeManager();
manager.init().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
  manager.shutdown().then(() => process.exit(0));
});

module.exports = ClaudeManager;