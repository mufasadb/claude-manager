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
      command: 'curl -X POST "http://100.83.40.11:8080/tts" -H "Content-Type: application/json" -d "{\\"text\\": \\"$CLAUDE_NOTIFICATION\\"}"'
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
    command: 'npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref={project_ref}',
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
    this.sessionTrackingFile = path.join(this.registryPath, 'session-tracking.json');
    this.settingsFile = path.join(this.registryPath, 'settings.json');
    this.claudeDesktopConfigPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    this.state = {
      userConfig: {},
      projects: {},
      mcpServers: {},
      claudeDesktopMcpServers: {},
      userEnvVars: {},
      projectEnvVars: {},
      settings: {
        sessionTracking: {
          enabled: false,
          billingPeriodStart: null,
          planType: 'pro' // pro, max-5x, max-20x
        }
      },
      sessionTracking: {
        enabled: false,
        billingPeriodStart: null,
        planType: 'pro', // pro, max-5x, max-20x
        sessions: [],
        currentMonth: {
          sessionsCount: 0,
          totalDuration: 0
        }
      },
      lastUpdate: Date.now()
    };
  }

  async init() {
    await this.ensureDirectories();
    await this.loadRegistry();
    this.setupFileWatchers();
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
      
      // Load session tracking data
      if (await fs.pathExists(this.sessionTrackingFile)) {
        const trackingData = await fs.readJson(this.sessionTrackingFile);
        this.state.sessionTracking = { ...this.state.sessionTracking, ...trackingData };
      }
      
      // Load persistent settings
      if (await fs.pathExists(this.settingsFile)) {
        const settings = await fs.readJson(this.settingsFile);
        this.state.settings = { ...this.state.settings, ...settings };
        
        // Sync session tracking settings
        if (settings.sessionTracking) {
          this.state.sessionTracking.enabled = settings.sessionTracking.enabled;
          this.state.sessionTracking.planType = settings.sessionTracking.planType || 'pro';
          this.state.sessionTracking.billingPeriodStart = settings.sessionTracking.billingPeriodStart;
        }
      }
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

  async saveSessionTracking() {
    await fs.writeJson(this.sessionTrackingFile, this.state.sessionTracking, { spaces: 2 });
  }

  async saveSettings() {
    // Update settings with current session tracking state
    this.state.settings.sessionTracking = {
      enabled: this.state.sessionTracking.enabled,
      planType: this.state.sessionTracking.planType,
      billingPeriodStart: this.state.sessionTracking.billingPeriodStart
    };
    
    await fs.writeJson(this.settingsFile, this.state.settings, { spaces: 2 });
  }

  // Session tracking methods
  async toggleSessionTracking(enabled) {
    this.state.sessionTracking.enabled = enabled;
    
    if (enabled && !this.state.sessionTracking.billingPeriodStart) {
      // Set billing period start to current date if not set
      this.state.sessionTracking.billingPeriodStart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }
    
    // Update user's Claude settings to include/remove session tracking hooks
    await this.updateSessionTrackingHooks(enabled);
    await this.saveSessionTracking();
    await this.saveSettings(); // Save persistent settings
    
    return { success: true, enabled };
  }

  async updateSessionTrackingHooks(enabled) {
    const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    
    try {
      let settings = {};
      if (await fs.pathExists(userSettingsPath)) {
        settings = await fs.readJson(userSettingsPath);
      }
      
      if (!settings.hooks) settings.hooks = {};
      
      if (enabled) {
        // Add session tracking hooks
        settings.hooks.Start = settings.hooks.Start || [];
        settings.hooks.Stop = settings.hooks.Stop || [];
        
        // Remove existing tracking hooks first
        settings.hooks.Start = settings.hooks.Start.filter(hook => 
          !hook.hooks?.[0]?.command?.includes('session-event')
        );
        settings.hooks.Stop = settings.hooks.Stop.filter(hook => 
          !hook.hooks?.[0]?.command?.includes('session-event')
        );
        
        // Add session start tracking hook
        settings.hooks.Start.push({
          matcher: '*',
          hooks: [{
            type: 'command',
            command: 'curl -s -X POST http://localhost:3456/api/session-event -H "Content-Type: application/json" -d "{\\"event\\": \\"start\\", \\"timestamp\\": $(date +%s), \\"project\\": \\"$(pwd)\\"}" || true'
          }]
        });
        
        // Note: We don't track Stop events anymore since Claude sessions are time-based (5 hours)
        // Sessions automatically end after 5 hours regardless of activity
      } else {
        // Remove session tracking hooks
        if (settings.hooks.Start) {
          settings.hooks.Start = settings.hooks.Start.filter(hook => 
            !hook.hooks?.[0]?.command?.includes('session-event')
          );
        }
        if (settings.hooks.Stop) {
          settings.hooks.Stop = settings.hooks.Stop.filter(hook => 
            !hook.hooks?.[0]?.command?.includes('session-event')
          );
        }
      }
      
      await fs.ensureDir(path.dirname(userSettingsPath));
      await fs.writeJson(userSettingsPath, settings, { spaces: 2 });
      
    } catch (error) {
      console.error('Error updating session tracking hooks:', error.message);
      throw error;
    }
  }

  async recordSessionEvent(event, timestamp, project) {
    if (!this.state.sessionTracking.enabled) return;
    
    const currentTime = parseInt(timestamp);
    const currentTimeMs = currentTime * 1000;
    
    // Only track 'start' events as potential session starts
    if (event === 'start') {
      // Check if this is a new session (no recent activity in last 5 hours)
      const recentSessions = this.state.sessionTracking.sessions.filter(s => 
        s.event === 'session_start' && 
        (currentTime - s.timestamp) < (5 * 60 * 60) // Within last 5 hours
      );
      
      // If no recent session, this is a new session start
      if (recentSessions.length === 0) {
        const session = {
          event: 'session_start',
          timestamp: currentTime,
          project,
          date: new Date(currentTimeMs).toISOString(),
          sessionId: `session_${currentTime}` // Unique session identifier
        };
        
        this.state.sessionTracking.sessions.push(session);
        
        // Calculate monthly stats
        this.calculateMonthlyStats();
        
        await this.saveSessionTracking();
        this.broadcast({ 
          type: 'sessionEvent', 
          session, 
          stats: this.state.sessionTracking.currentMonth,
          message: 'New Claude Code session started'
        });
        
        console.log(`📅 New Claude Code session started at ${new Date(currentTimeMs).toLocaleString()}`);
      }
    }
    
    // For 'end' events, we ignore them since Claude sessions are time-based, not tool-use based
    // Sessions automatically end after 5 hours regardless of activity
  }

  calculateMonthlyStats() {
    const billingStart = new Date(this.state.sessionTracking.billingPeriodStart);
    const billingEnd = new Date(billingStart);
    billingEnd.setMonth(billingEnd.getMonth() + 1);
    
    // Filter sessions in current billing period
    const currentSessions = this.state.sessionTracking.sessions.filter(session => {
      const sessionDate = new Date(session.timestamp * 1000);
      return sessionDate >= billingStart && sessionDate < billingEnd && session.event === 'session_start';
    });
    
    const now = Date.now() / 1000; // Current time in seconds
    const sessionDuration = 5 * 60 * 60; // 5 hours in seconds
    
    // Calculate active sessions (started within last 5 hours)
    const activeSessions = currentSessions.filter(session => {
      const sessionAge = now - session.timestamp;
      return sessionAge < sessionDuration; // Still within 5-hour window
    });
    
    // All sessions are 5 hours long (or ongoing)
    const completedSessions = currentSessions.filter(session => {
      const sessionAge = now - session.timestamp;
      return sessionAge >= sessionDuration; // Completed 5-hour sessions
    });
    
    this.state.sessionTracking.currentMonth = {
      sessionsCount: currentSessions.length,
      totalDuration: completedSessions.length * sessionDuration + 
                     activeSessions.reduce((sum, session) => sum + Math.min(now - session.timestamp, sessionDuration), 0),
      activeSessions: activeSessions.length
    };
  }

  getSessionLimits() {
    const limits = {
      pro: { sessions5h: 45, codePrompts5h: '10-40', monthlySessions: 50 },
      'max-5x': { sessions5h: 225, codePrompts5h: '50-200', monthlySessions: 50 },
      'max-20x': { sessions5h: 900, codePrompts5h: '200-800', monthlySessions: 50 }
    };
    
    return limits[this.state.sessionTracking.planType] || limits.pro;
  }

  getTimeInCurrentBillingPeriod() {
    if (!this.state.sessionTracking.billingPeriodStart) return 0;
    
    const start = new Date(this.state.sessionTracking.billingPeriodStart);
    const now = new Date();
    const totalPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const elapsed = now - start;
    
    return Math.min(elapsed / totalPeriod, 1); // Return as percentage (0-1)
  }

  getEstimatedMonthlyUsage() {
    const timeProgress = this.getTimeInCurrentBillingPeriod();
    const currentSessions = this.state.sessionTracking.currentMonth.sessionsCount;
    
    if (timeProgress === 0) return 0;
    
    return Math.round(currentSessions / timeProgress);
  }

  getCurrentActiveSession() {
    if (!this.state.sessionTracking.enabled || !this.state.sessionTracking.sessions) {
      return null;
    }

    const now = new Date();
    const sessionDuration = 5 * 60 * 60 * 1000; // 5 hours in milliseconds

    // Find the most recent session_start within the last 5 hours
    const recentSessions = this.state.sessionTracking.sessions
      .filter(s => s.event === 'session_start')
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first

    for (const session of recentSessions) {
      const sessionStart = new Date(session.timestamp * 1000);
      const sessionEnd = new Date(sessionStart.getTime() + sessionDuration);
      const timeRemaining = Math.max(0, sessionEnd - now);
      
      if (timeRemaining > 0) {
        // This session is still active
        return {
          startTime: sessionStart,
          endTime: sessionEnd,
          timeRemaining,
          isActive: true,
          project: session.project,
          session: session
        };
      }
    }

    return null;
  }

  getCountdownInfo() {
    const activeSession = this.getCurrentActiveSession();
    
    if (!activeSession || !activeSession.isActive) {
      return {
        hasActiveSession: false,
        timeRemaining: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        project: null
      };
    }

    const totalSeconds = Math.floor(activeSession.timeRemaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      hasActiveSession: true,
      timeRemaining: activeSession.timeRemaining,
      hours,
      minutes,
      seconds,
      project: activeSession.project,
      sessionStart: activeSession.startTime,
      sessionEnd: activeSession.endTime
    };
  }

  getUserConfigPaths() {
    const home = os.homedir();
    return {
      settings: path.join(home, '.claude', 'settings.json'),
      memory: path.join(home, '.claude', 'CLAUDE.md')
    };
  }

  getProjectConfigPaths(projectPath) {
    return {
      settings: path.join(projectPath, '.claude', 'settings.json'),
      settingsLocal: path.join(projectPath, '.claude', 'settings.local.json'),
      mcp: path.join(projectPath, '.mcp.json'),
      memory: path.join(projectPath, 'CLAUDE.md')
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

  async refreshMcpServers() {
    return new Promise((resolve) => {
      exec('claude mcp list', (error, stdout, stderr) => {
        if (error) {
          this.state.mcpServers = { error: error.message };
        } else {
          try {
            // Try to parse as JSON first
            this.state.mcpServers = JSON.parse(stdout);
          } catch (parseError) {
            // Parse text output manually
            const lines = stdout.split('\n').filter(line => line.trim());
            const servers = {};
            
            // Look for patterns like "server-name  command args"
            lines.forEach(line => {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith('No MCP') && !trimmed.startsWith('---')) {
                // Split on multiple spaces to separate name from command
                const parts = trimmed.split(/\s{2,}/);
                if (parts.length >= 2) {
                  servers[parts[0]] = parts[1];
                } else if (trimmed.includes('stdio:')) {
                  // Handle stdio format
                  const [name, command] = trimmed.split(' stdio:');
                  if (name && command) {
                    servers[name.trim()] = 'stdio:' + command.trim();
                  }
                }
              }
            });
            
            this.state.mcpServers = Object.keys(servers).length > 0 ? servers : { 
              info: stdout.trim() || 'No MCP servers found' 
            };
          }
        }
        resolve();
      });
    });
  }

  async refreshAllData() {
    await this.refreshUserConfig();
    await this.refreshMcpServers();
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

    // Session tracking API endpoints
    this.app.post('/api/toggle-session-tracking', async (req, res) => {
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      try {
        const result = await this.toggleSessionTracking(enabled);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/update-session-config', async (req, res) => {
      const { planType, billingPeriodStart } = req.body;
      
      try {
        if (planType && ['pro', 'max-5x', 'max-20x'].includes(planType)) {
          this.state.sessionTracking.planType = planType;
        }
        
        if (billingPeriodStart) {
          this.state.sessionTracking.billingPeriodStart = billingPeriodStart;
          this.calculateMonthlyStats(); // Recalculate with new period
        }
        
        await this.saveSessionTracking();
        await this.saveSettings(); // Save persistent settings
        res.json({ success: true, sessionTracking: this.state.sessionTracking });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/session-event', async (req, res) => {
      const { event, timestamp, project } = req.body;
      
      if (!event || !timestamp || !project) {
        return res.status(400).json({ error: 'event, timestamp, and project required' });
      }

      try {
        await this.recordSessionEvent(event, timestamp, project);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/session-stats', (req, res) => {
      const limits = this.getSessionLimits();
      const stats = this.state.sessionTracking.currentMonth;
      const countdown = this.getCountdownInfo();
      
      res.json({
        tracking: this.state.sessionTracking,
        limits,
        stats,
        countdown,
        usage: {
          monthlyProgress: stats.sessionsCount / limits.monthlySessions,
          timeInCurrentPeriod: this.getTimeInCurrentBillingPeriod(),
          estimatedMonthlyUsage: this.getEstimatedMonthlyUsage()
        }
      });
    });

    this.app.get('/api/countdown', (req, res) => {
      const countdown = this.getCountdownInfo();
      res.json(countdown);
    });

    this.app.post('/api/clear-session-data', async (req, res) => {
      try {
        this.state.sessionTracking.sessions = [];
        this.state.sessionTracking.currentMonth = {
          sessionsCount: 0,
          totalDuration: 0,
          activeSessions: 0
        };
        
        await this.saveSessionTracking();
        res.json({ success: true, message: 'Session data cleared' });
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

    this.app.get('/api/claude-desktop-config-path', (req, res) => {
      res.json({ 
        path: this.claudeDesktopConfigPath,
        exists: fs.existsSync(this.claudeDesktopConfigPath)
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

  async shutdown() {
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