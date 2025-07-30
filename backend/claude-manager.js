const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const os = require('os');

// Import services
const SessionService = require('./services/session-service');
const ProjectService = require('./services/project-service');
const FileWatcher = require('./services/file-watcher');
const MCPService = require('./services/mcp-service');
const CommandService = require('./services/command-service');
const AgentService = require('./services/agent-service');
const HookRegistry = require('./services/data/hook-registry');
const HookEventService = require('./services/hook-event-service');
const HookGenerator = require('./services/operations/hook-generator');

// Import configuration
const { COMMON_HOOKS } = require('./config/hooks');

// Import utilities
const { parseEnvFile, maskEnvValue } = require('./utils/env-utils');
const { getUserConfigPaths } = require('./utils/path-utils');

class ClaudeManager {
  constructor() {
    this.app = express();
    this.server = null;
    
    // File paths
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.userEnvFile = path.join(this.registryPath, 'user.env');
    this.settingsFile = path.join(this.registryPath, 'settings.json');
    this.claudeDesktopConfigPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

    // Initialize services
    this.sessionService = new SessionService();
    this.projectService = new ProjectService();
    this.fileWatcher = new FileWatcher();
    this.mcpService = new MCPService();
    this.commandService = new CommandService();
    this.agentService = new AgentService();
    this.hookRegistry = new HookRegistry();
    this.hookEventService = null; // Will be initialized after user env vars are loaded
    this.hookGenerator = null; // Will be initialized with Task agent reference

    // User-level state
    this.state = {
      userConfig: {},
      userEnvVars: {},
      settings: {},
      mcps: {
        userMCPs: { active: {}, disabled: {} },
        projectMCPs: { active: {}, disabled: {} }
      },
      lastUpdate: Date.now()
    };
  }

  async init() {
    await this.ensureDirectories();
    
    // Initialize services
    await this.sessionService.init();
    await this.projectService.init();
    await this.mcpService.init();
    await this.hookRegistry.init();
    
    // Set up file watchers
    this.setupFileWatchers();
    
    // Set up web server
    this.setupWebServer();
    
    // Load initial data
    await this.refreshAllData();
    
    // Initialize hook services after user env vars are loaded
    await this.initializeHookServices();
    
    console.log('🚀 Claude Manager started on http://localhost:3455');
  }

  async ensureDirectories() {
    await fs.ensureDir(this.registryPath);
  }

  async initializeHookServices() {
    // Initialize hook event service with user environment variables
    this.hookEventService = new HookEventService(
      this.hookRegistry,
      this.projectService,
      this.state.userEnvVars
    );

    // Initialize hook generator with Task agent reference
    this.hookGenerator = new HookGenerator({
      execute: async (request) => {
        const TaskTool = require('./tools/task');
        return await TaskTool.execute(request);
      }
    });

    // Register project hooks for existing projects
    const projects = this.projectService.getProjects();
    for (const [projectName, project] of Object.entries(projects)) {
      await this.hookRegistry.loadProjectHooks(projectName, project.path);
    }
  }

  // File Watching
  setupFileWatchers() {
    this.fileWatcher.setupFileWatchers(
      this.projectService.getProjects(),
      this.onFileChange.bind(this)
    );
  }

  async onFileChange(scope, filePath, projectName) {
    console.log(`File changed: ${filePath} (${scope}${projectName ? ` - ${projectName}` : ''})`);
    
    if (scope === 'user') {
      await this.refreshUserConfig();
      await this.refreshUserEnvVars();
    } else if (scope === 'project' && projectName) {
      await this.projectService.refreshProjectConfig(projectName);
      await this.projectService.refreshProjectEnvVars(projectName);
    }
    
    // Broadcast file change to connected clients
    this.broadcastToClients({ type: 'fileChange', scope, filePath, projectName });
  }

  // User Configuration Management
  async refreshUserConfig() {
    const paths = getUserConfigPaths();
    const config = {
      settings: {},
      settingsLocal: {},
      memory: '',
      commands: {}
    };

    try {
      if (await fs.pathExists(paths.settings)) {
        config.settings = await fs.readJson(paths.settings);
      }
      if (await fs.pathExists(paths.settingsLocal)) {
        config.settingsLocal = await fs.readJson(paths.settingsLocal);
      }
      if (await fs.pathExists(paths.memory)) {
        config.memory = await fs.readFile(paths.memory, 'utf8');
      }
      if (await fs.pathExists(paths.commands)) {
        config.commands = await this.loadCommands(paths.commands);
      }
    } catch (error) {
      console.error('Error refreshing user config:', error);
    }

    this.state.userConfig = config;
  }

  async loadCommands(commandsPath) {
    const commands = {};
    try {
      const entries = await fs.readdir(commandsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const commandName = entry.name.replace('.md', '');
          const commandPath = path.join(commandsPath, entry.name);
          const content = await fs.readFile(commandPath, 'utf8');
          commands[commandName] = {
            name: commandName,
            content: content.trim(),
            path: commandPath
          };
        }
      }
    } catch (error) {
      console.error('Error loading commands:', error);
    }
    return commands;
  }

  async refreshUserEnvVars() {
    try {
      if (await fs.pathExists(this.userEnvFile)) {
        const content = await fs.readFile(this.userEnvFile, 'utf8');
        this.state.userEnvVars = parseEnvFile(content);
      } else {
        this.state.userEnvVars = {};
      }
    } catch (error) {
      console.error('Error reading user env vars:', error);
      this.state.userEnvVars = {};
    }
  }

  async addUserEnvVar(key, value) {
    try {
      let content = '';
      let existingVars = {};
      
      if (await fs.pathExists(this.userEnvFile)) {
        content = await fs.readFile(this.userEnvFile, 'utf8');
        existingVars = parseEnvFile(content);
      }
      
      existingVars[key] = value;
      
      const envLines = Object.entries(existingVars).map(([k, v]) => `${k}=${v}`);
      const newContent = envLines.join('\n') + '\n';
      
      await fs.ensureDir(path.dirname(this.userEnvFile));
      await fs.writeFile(this.userEnvFile, newContent, 'utf8');
      
      this.state.userEnvVars[key] = value;
      return this.state.userEnvVars;
    } catch (error) {
      console.error('Error adding user env var:', error);
      throw error;
    }
  }

  async deleteUserEnvVar(key) {
    try {
      let content = '';
      let existingVars = {};
      
      if (await fs.pathExists(this.userEnvFile)) {
        content = await fs.readFile(this.userEnvFile, 'utf8');
        existingVars = parseEnvFile(content);
      }
      
      delete existingVars[key];
      
      const envLines = Object.entries(existingVars).map(([k, v]) => `${k}=${v}`);
      const newContent = envLines.join('\n') + (envLines.length > 0 ? '\n' : '');
      
      await fs.writeFile(this.userEnvFile, newContent, 'utf8');
      
      delete this.state.userEnvVars[key];
      await this.broadcastState();
    } catch (error) {
      console.error('Error deleting user env var:', error);
      throw error;
    }
  }

  async updateUserEnvVar(key, value) {
    try {
      let content = '';
      let existingVars = {};
      
      if (await fs.pathExists(this.userEnvFile)) {
        content = await fs.readFile(this.userEnvFile, 'utf8');
        existingVars = parseEnvFile(content);
      }
      
      existingVars[key] = value;
      
      const envLines = Object.entries(existingVars).map(([k, v]) => `${k}=${v}`);
      const newContent = envLines.join('\n') + '\n';
      
      await fs.writeFile(this.userEnvFile, newContent, 'utf8');
      
      this.state.userEnvVars[key] = value;
      await this.broadcastState();
      return this.state.userEnvVars;
    } catch (error) {
      console.error('Error updating user env var:', error);
      throw error;
    }
  }

  async refreshAllData() {
    // Refresh user data
    await this.refreshUserConfig();
    await this.refreshUserEnvVars();
    
    // Load MCP state
    this.state.mcps = this.mcpService.getState();
    
    // Load settings
    try {
      if (await fs.pathExists(this.settingsFile)) {
        this.state.settings = await fs.readJson(this.settingsFile);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    
    // Update timestamp
    this.state.lastUpdate = Date.now();
    
    // Update file watchers with current projects
    this.fileWatcher.updateProjectWatchers(this.projectService.getProjects());
  }

  // WebSocket broadcasting removed - using REST API only

  // Web Server Setup
  setupWebServer() {
    this.app.use(express.json({ limit: '50mb' }));
    
    // Serve React app build files in production, fallback to old HTML in development
    const reactBuildPath = path.join(__dirname, '..', 'frontend', 'build');
    const publicPath = path.join(__dirname, 'public');
    
    if (fs.existsSync(reactBuildPath)) {
      this.app.use(express.static(reactBuildPath));
    } else {
      this.app.use(express.static(publicPath));
    }
    
    // API Routes
    this.setupAPIRoutes();
    
    // Create HTTP server
    const http = require('http');
    const WebSocket = require('ws');
    this.server = http.createServer(this.app);
    
    // Set up WebSocket server
    this.wss = new WebSocket.Server({ server: this.server });
    this.setupWebSocket();
    
    this.server.listen(3455, () => {
      console.log('Server listening on port 3455');
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('WebSocket client connected');
      
      // Send initial state
      this.getFullState().then(state => {
        ws.send(JSON.stringify({ type: 'state', state }));
      }).catch(error => {
        console.error('Error sending initial state:', error);
      });
      
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  broadcastToClients(data) {
    if (this.wss) {
      this.wss.clients.forEach((client) => {
        if (client.readyState === require('ws').OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  }

  async broadcastState() {
    try {
      const state = await this.getFullState();
      this.broadcastToClients({ type: 'state', state });
    } catch (error) {
      console.error('Error broadcasting state:', error);
    }
  }

  setupAPIRoutes() {
    // Status endpoint
    this.app.get('/api/status', async (req, res) => {
      try {
        const state = await this.getFullState();
        res.json(state);
      } catch (error) {
        console.error('Error getting full state:', error);
        res.status(500).json({ error: error.message });
      }
    });


    this.app.get('/api/common-hooks', (req, res) => {
      res.json(COMMON_HOOKS);
    });

    this.app.get('/api/check-global-commands', (req, res) => {
      exec('which cm-reg', (error) => {
        const hasGlobalCommands = !error;
        res.json({ hasGlobalCommands });
      });
    });

    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // File operations
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

        // Allow project paths
        const projects = this.projectService.getProjects();
        for (const project of Object.values(projects)) {
          allowedPaths.push(path.join(project.path, 'CLAUDE.md'));
          allowedPaths.push(path.join(project.path, '.claude', 'settings.json'));
        }

        if (!allowedPaths.some(allowed => filePath.startsWith(allowed))) {
          return res.status(403).json({ error: 'File path not allowed' });
        }

        await fs.ensureDir(path.dirname(filePath));

        if (type === 'json') {
          const parsedContent = JSON.parse(content);
          await fs.writeJson(filePath, parsedContent, { spaces: 2 });
        } else {
          await fs.writeFile(filePath, content, 'utf8');
        }

        res.json({ success: true });
      } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Project management endpoints
    this.app.post('/api/register-project', async (req, res) => {
      try {
        const { name, path: projectPath } = req.body;
        const result = await this.projectService.registerProject(name, projectPath);
        this.fileWatcher.updateProjectWatchers(this.projectService.getProjects());
        res.json({ success: true, project: result });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/unregister-project', async (req, res) => {
      try {
        const { name } = req.body;
        const result = await this.projectService.unregisterProject(name);
        this.fileWatcher.updateProjectWatchers(this.projectService.getProjects());
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/update-user-settings', async (req, res) => {
      try {
        const { settings } = req.body;
        
        if (!settings) {
          return res.status(400).json({ error: 'Settings content required' });
        }

        // Validate JSON
        let parsedSettings;
        try {
          parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : settings;
        } catch (error) {
          return res.status(400).json({ error: 'Invalid JSON format', details: error.message });
        }

        const paths = getUserConfigPaths();
        
        // Write the settings file
        await fs.ensureDir(path.dirname(paths.settings));
        await fs.writeJson(paths.settings, parsedSettings, { spaces: 2 });
        
        // Refresh user config and broadcast changes
        await this.refreshUserConfig();
        await this.broadcastState();
        
        res.json({ success: true, settings: this.state.userConfig.settings });
      } catch (error) {
        console.error('Error updating user settings:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/save-claude-md', async (req, res) => {
      try {
        const { projectPath, content } = req.body;
        
        if (!projectPath || typeof content !== 'string') {
          return res.status(400).json({ error: 'Project path and content required' });
        }

        // Validate project path exists in registry
        const projectName = Object.keys(this.state.projects).find(
          name => this.state.projects[name].path === projectPath
        );
        
        if (!projectName) {
          return res.status(404).json({ error: 'Project not found in registry' });
        }

        // Build CLAUDE.md file path
        const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
        
        // Write the CLAUDE.md file
        await fs.writeFile(claudeMdPath, content, 'utf8');
        
        // Don't store claudeMd content in state - it will be loaded on-demand
        // Just trigger a save to update lastUpdate timestamp
        await this.saveState();
        
        // Broadcast changes
        await this.broadcastState();
        
        res.json({ success: true, content });
      } catch (error) {
        console.error('Error saving CLAUDE.md:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/save-user-claude-md', async (req, res) => {
      try {
        const { content } = req.body;
        
        if (typeof content !== 'string') {
          return res.status(400).json({ error: 'Content required' });
        }

        const paths = getUserConfigPaths();
        
        // Write the user CLAUDE.md file
        await fs.ensureDir(path.dirname(paths.memory));
        await fs.writeFile(paths.memory, content, 'utf8');
        
        // Refresh user config and broadcast changes
        await this.refreshUserConfig();
        await this.broadcastState();
        
        res.json({ success: true, content });
      } catch (error) {
        console.error('Error saving user CLAUDE.md:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Environment variable endpoints
    this.app.post('/api/add-user-env', async (req, res) => {
      try {
        const { key, value } = req.body;
        const result = await this.addUserEnvVar(key, value);
        res.json({ success: true, envVars: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/add-env-to-project', async (req, res) => {
      try {
        const { projectName, key, value } = req.body;
        const result = await this.projectService.addEnvToProject(projectName, key, value);
        res.json({ success: true, envVars: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/copy-env-to-user', async (req, res) => {
      try {
        const { projectName, key } = req.body;
        const result = await this.projectService.copyEnvToUser(projectName, key, this.userEnvFile);
        await this.refreshUserEnvVars();
        res.json({ success: true, copied: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/delete-user-env', async (req, res) => {
      try {
        const { key } = req.body;
        await this.deleteUserEnvVar(key);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/push-env-to-project', async (req, res) => {
      try {
        const { projectName, key, value } = req.body;
        const result = await this.projectService.pushEnvToProject(projectName, key, value);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/update-user-env', async (req, res) => {
      try {
        const { key, value } = req.body;
        const result = await this.updateUserEnvVar(key, value);
        res.json({ success: true, envVars: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // Session tracking endpoints
    this.app.post('/api/toggle-session-tracking', async (req, res) => {
      try {
        const { enabled } = req.body;
        const result = await this.sessionService.toggleTracking(enabled);
        res.json({ success: true, sessionTracking: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/session-stats', (req, res) => {
      const stats = this.sessionService.getSessionStats();
      res.json(stats);
    });

    this.app.get('/api/countdown', async (req, res) => {
      try {
        const currentSession = await this.sessionService.getCurrentSession();
        if (currentSession) {
          const remaining = currentSession.remaining;
          res.json({
            active: true,
            remaining: {
              totalMs: remaining,
              hours: Math.floor(remaining / (60 * 60 * 1000)),
              minutes: Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000)),
              seconds: Math.floor((remaining % (60 * 1000)) / 1000)
            }
          });
        } else {
          res.json({ active: false });
        }
      } catch (error) {
        console.error('Error getting countdown:', error);
        res.json({ active: false });
      }
    });

    // Session status endpoint (alias for session-stats with detailed metrics)
    this.app.get('/api/session-status', async (req, res) => {
      try {
        const stats = this.sessionService.getSessionStats();
        
        // Add detailed metrics for frontend consumption
        const detailedStats = {
          ...stats,
          // Calculate current and previous session details from session history
          currentSession: null,
          previousSession: null,
          billingMonthStats: {
            sessionCount: stats.monthlySessions || 0,
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            costs: {
              sonnet4: 0,
              opus4: 0
            }
          }
        };
        
        // Find current and previous sessions from history
        if (stats.sessionHistory && stats.sessionHistory.length > 0) {
          const sessions = stats.sessionHistory;
          const now = Date.now();
          
          // Current session is the most recent active one
          const activeSession = sessions.find(session => {
            const sessionEnd = session.end + (5 * 60 * 60 * 1000); // 5 hours after last activity
            return now <= sessionEnd;
          });
          
          if (activeSession) {
            detailedStats.currentSession = {
              userPrompts: activeSession.messageCount || 0,
              assistantResponses: Math.max(0, (activeSession.messageCount || 0) - 1),
              totalTokensUsed: activeSession.tokens || 0,
              inputTokens: Math.floor((activeSession.tokens || 0) * 0.6), // Estimate
              outputTokens: Math.floor((activeSession.tokens || 0) * 0.4), // Estimate
              costs: {
                sonnet4: ((activeSession.tokens || 0) * 0.000015) || 0, // Rough estimate
                opus4: ((activeSession.tokens || 0) * 0.000075) || 0  // Rough estimate
              }
            };
          }
          
          // Previous session is the one before current
          const completedSessions = sessions.filter(session => {
            const sessionEnd = session.end + (5 * 60 * 60 * 1000);
            return now > sessionEnd;
          }).sort((a, b) => b.end - a.end);
          
          if (completedSessions.length > 0) {
            const prevSession = completedSessions[0];
            detailedStats.previousSession = {
              userPrompts: prevSession.messageCount || 0,
              assistantResponses: Math.max(0, (prevSession.messageCount || 0) - 1),
              totalTokensUsed: prevSession.tokens || 0,
              inputTokens: Math.floor((prevSession.tokens || 0) * 0.6),
              outputTokens: Math.floor((prevSession.tokens || 0) * 0.4),
              costs: {
                sonnet4: ((prevSession.tokens || 0) * 0.000015) || 0,
                opus4: ((prevSession.tokens || 0) * 0.000075) || 0
              }
            };
          }
          
          // Calculate billing month totals
          const billingMonthTotalTokens = sessions.reduce((total, session) => total + (session.tokens || 0), 0);
          detailedStats.billingMonthStats = {
            sessionCount: stats.monthlySessions || 0,
            totalTokens: billingMonthTotalTokens,
            inputTokens: Math.floor(billingMonthTotalTokens * 0.6),
            outputTokens: Math.floor(billingMonthTotalTokens * 0.4),
            costs: {
              sonnet4: (billingMonthTotalTokens * 0.000015) || 0,
              opus4: (billingMonthTotalTokens * 0.000075) || 0
            }
          };
        }
        
        res.json(detailedStats);
      } catch (error) {
        console.error('Error getting session status:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Token usage summary endpoint
    this.app.get('/api/token-usage', async (req, res) => {
      try {
        const stats = this.sessionService.getSessionStats();
        const now = Date.now();
        
        // Calculate lifetime tokens
        const lifetimeTokens = stats.sessionHistory.reduce((total, session) => {
          return total + (session.tokens || 0);
        }, 0);
        
        // Calculate current month tokens (based on billing date)
        const currentDate = new Date();
        const billingDate = stats.billingDate || 1;
        
        // Calculate current billing period start
        let billingPeriodStart;
        if (currentDate.getDate() >= billingDate) {
          // We're in the current billing period
          billingPeriodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), billingDate);
        } else {
          // We're in next month but before billing date, so billing period started last month
          billingPeriodStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, billingDate);
        }
        
        const monthlyTokens = stats.sessionHistory
          .filter(session => session.start >= billingPeriodStart.getTime())
          .reduce((total, session) => total + (session.tokens || 0), 0);
        
        // Calculate current session tokens
        let currentSessionTokens = 0;
        if (stats.currentSessionStart) {
          // Find any sessions that started at or after the current session start time
          const currentSessionData = stats.sessionHistory
            .filter(session => session.start >= stats.currentSessionStart)
            .reduce((total, session) => total + (session.tokens || 0), 0);
          currentSessionTokens = currentSessionData;
        }
        
        const tokenSummary = {
          currentSession: {
            tokens: currentSessionTokens,
            active: !!stats.currentSessionStart,
            startTime: stats.currentSessionStart
          },
          currentMonth: {
            tokens: monthlyTokens,
            billingPeriodStart: billingPeriodStart.toISOString(),
            billingDate: billingDate
          },
          lifetime: {
            tokens: lifetimeTokens,
            totalSessions: stats.sessionHistory.length
          },
          summary: {
            currentSessionTokens,
            monthlyTokens,
            lifetimeTokens
          }
        };
        
        res.json(tokenSummary);
      } catch (error) {
        console.error('Error calculating token usage:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Debug endpoint to check session detection
    this.app.get('/api/debug-sessions', async (req, res) => {
      try {
        // Force an update and get the latest state
        await this.sessionService.updateSessionTracking();
        const state = this.sessionService.getState();
        
        // Get most recent messages from recent files
        const recentFiles = require('child_process').execSync(
          `find ${require('os').homedir()}/.claude/projects -name "*.jsonl" -newermt "2 hours ago"`,
          { encoding: 'utf8' }
        ).trim().split('\n').filter(Boolean);
        
        const recentMessages = [];
        for (const file of recentFiles.slice(0, 3)) {
          try {
            const content = require('fs').readFileSync(file, 'utf8');
            const lines = content.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            if (lastLine) {
              const msg = JSON.parse(lastLine);
              recentMessages.push({
                file: file.split('/').pop(),
                timestamp: msg.timestamp,
                role: msg.message?.role || msg.role,
                hasUsage: !!(msg.message?.usage || msg.usage)
              });
            }
          } catch (e) {
            // Skip files that can't be parsed
          }
        }
        
        // Get the 3 most recent sessions from the history
        const recentSessions = state.sessionHistory.slice(-3).map(session => ({
          start: new Date(session.start).toISOString(),
          end: new Date(session.end).toISOString(),
          messageCount: session.messageCount,
          tokens: session.tokens,
          duration: Math.round((session.end - session.start) / (60 * 1000)) + 'min',
          isActive: Date.now() <= (session.end + (5 * 60 * 60 * 1000))
        }));

        res.json({
          state: {
            enabled: state.enabled,
            currentSessionStart: state.currentSessionStart,
            currentSessionStartTime: state.currentSessionStart ? new Date(state.currentSessionStart).toISOString() : null,
            lastScannedTimestamp: state.lastScannedTimestamp,
            lastScannedTime: new Date(state.lastScannedTimestamp).toISOString(),
            sessionCount: state.sessionHistory.length
          },
          recentSessions,
          recentMessages,
          recentFiles: recentFiles.slice(0, 5),
          now: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // MCP Management Endpoints
    this.app.get('/api/mcp/templates', (req, res) => {
      try {
        res.json(this.mcpService.getTemplates());
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mcp/list/:scope', async (req, res) => {
      try {
        const { scope } = req.params;
        const mcps = await this.mcpService.listMCPs(scope);
        res.json(mcps);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/add', async (req, res) => {
      try {
        const { scope, mcpConfig, projectPath } = req.body;
        const result = await this.mcpService.addMCP(scope, { ...mcpConfig, projectPath });
        
        // Update state and broadcast
        this.state.mcps = this.mcpService.getState();
        this.broadcastToClients({ type: 'mcpUpdate', mcps: this.state.mcps });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/remove', async (req, res) => {
      try {
        const { scope, name, projectPath } = req.body;
        const result = await this.mcpService.removeMCP(scope, name, projectPath);
        
        // Update state and broadcast
        this.state.mcps = this.mcpService.getState();
        this.broadcastToClients({ type: 'mcpUpdate', mcps: this.state.mcps });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/disable', async (req, res) => {
      try {
        const { scope, name, projectPath } = req.body;
        const result = await this.mcpService.disableMCP(scope, name, projectPath);
        
        // Update state and broadcast
        this.state.mcps = this.mcpService.getState();
        this.broadcastToClients({ type: 'mcpUpdate', mcps: this.state.mcps });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/enable', async (req, res) => {
      try {
        const { scope, name, projectPath } = req.body;
        const result = await this.mcpService.enableMCP(scope, name, projectPath);
        
        // Update state and broadcast
        this.state.mcps = this.mcpService.getState();
        this.broadcastToClients({ type: 'mcpUpdate', mcps: this.state.mcps });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Slash Command Management
    this.app.post('/api/create-slash-command', async (req, res) => {
      try {
        const { commandName, description, scope, category, projectName } = req.body;
        
        const result = await this.commandService.createSlashCommand(
          commandName, 
          description, 
          scope, 
          category, 
          projectName
        );
        
        if (result.success) {
          // Broadcast command creation to connected clients
          this.broadcastToClients({ 
            type: 'slashCommandCreated', 
            command: {
              name: commandName,
              description,
              scope,
              category,
              projectName,
              path: result.commandPath,
              relativePath: result.relativePath
            }
          });
        }
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/list-slash-commands', async (req, res) => {
      try {
        const { scope, projectName } = req.query;
        const commands = await this.commandService.listExistingCommands(scope, projectName);
        res.json({ commands });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Agent management endpoints
    this.app.get('/api/agents/templates', (req, res) => {
      try {
        const templates = this.agentService.getTemplates();
        res.json(templates);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/agents/available-tools', (req, res) => {
      try {
        const tools = this.agentService.getAvailableTools();
        res.json({ tools });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/agents/list/:scope', async (req, res) => {
      try {
        const { scope } = req.params;
        const { projectName } = req.query;
        const agents = await this.agentService.listExistingAgents(scope, projectName);
        res.json({ agents });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agents/create', async (req, res) => {
      try {
        const { agentName, description, scope, projectName, textFace, textColor, tools } = req.body;
        
        if (!agentName || !description || !scope) {
          return res.status(400).json({ error: 'Agent name, description, and scope are required' });
        }

        const result = await this.agentService.createAgent(
          agentName, 
          description, 
          scope, 
          projectName, 
          textFace, 
          textColor, 
          tools
        );

        if (result.success) {
          // Broadcast update to connected clients
          this.broadcastToClients({
            type: 'agentUpdate',
            action: 'created',
            agent: { name: agentName, scope, projectName },
            timestamp: Date.now()
          });
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agents/delete', async (req, res) => {
      try {
        const { agentName, scope, projectName } = req.body;
        
        if (!agentName || !scope) {
          return res.status(400).json({ error: 'Agent name and scope are required' });
        }

        const result = await this.agentService.deleteAgent(agentName, scope, projectName);

        if (result.success) {
          // Broadcast update to connected clients
          this.broadcastToClients({
            type: 'agentUpdate',
            action: 'deleted',
            agent: { name: agentName, scope, projectName },
            timestamp: Date.now()
          });
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Hook Management API Endpoints
    
    // Generate hook using Claude Code
    this.app.post('/api/hooks/generate', async (req, res) => {
      try {
        const { scope, eventType, pattern, description, projectName } = req.body;
        
        if (!eventType || !description) {
          return res.status(400).json({ error: 'Event type and description are required' });
        }

        const projectInfo = projectName ? {
          name: projectName,
          path: this.projectService.getProject(projectName)?.path,
          config: this.projectService.getProject(projectName)?.config || {}
        } : null;

        const result = await this.hookGenerator.generateHook({
          scope: scope || 'user',
          eventType,
          pattern: pattern || '*',
          description,
          projectInfo,
          userEnv: this.state.userEnvVars
        });

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Save generated hook
    this.app.post('/api/hooks/save', async (req, res) => {
      try {
        const { scope, projectName, hookConfig } = req.body;
        
        if (!hookConfig || !hookConfig.name || !hookConfig.eventType || !hookConfig.code) {
          return res.status(400).json({ error: 'Hook configuration with name, eventType, and code is required' });
        }

        const hook = await this.hookRegistry.addHook(scope, projectName, hookConfig);
        
        // Broadcast update to connected clients
        this.broadcastToClients({
          type: 'hookUpdate',
          action: 'created',
          hook,
          scope,
          projectName,
          timestamp: Date.now()
        });

        res.json({ success: true, hook });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // List hooks
    this.app.get('/api/hooks/list/:scope', async (req, res) => {
      try {
        const { scope } = req.params;
        const { projectName } = req.query;
        
        const hooks = this.hookRegistry.getHooks(scope, projectName);
        res.json({ hooks, scope, projectName });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get specific hook
    this.app.get('/api/hooks/get/:scope/:hookId', async (req, res) => {
      try {
        const { scope, hookId } = req.params;
        const { projectName } = req.query;
        
        const hook = this.hookRegistry.getHook(scope, projectName, hookId);
        if (!hook) {
          return res.status(404).json({ error: 'Hook not found' });
        }

        res.json({ hook, scope, projectName });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update hook
    this.app.put('/api/hooks/update/:scope/:hookId', async (req, res) => {
      try {
        const { scope, hookId } = req.params;
        const { projectName, updates } = req.body;
        
        const hook = await this.hookRegistry.updateHook(scope, projectName, hookId, updates);
        
        // Broadcast update to connected clients
        this.broadcastToClients({
          type: 'hookUpdate',
          action: 'updated',
          hook,
          scope,
          projectName,
          timestamp: Date.now()
        });

        res.json({ success: true, hook });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete hook
    this.app.delete('/api/hooks/delete/:scope/:hookId', async (req, res) => {
      try {
        const { scope, hookId } = req.params;
        const { projectName } = req.query;
        
        const deletedHook = await this.hookRegistry.deleteHook(scope, projectName, hookId);
        
        // Broadcast update to connected clients
        this.broadcastToClients({
          type: 'hookUpdate',
          action: 'deleted',
          hook: deletedHook,
          scope,
          projectName,
          timestamp: Date.now()
        });

        res.json({ success: true, deletedHook });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Test hook execution
    this.app.post('/api/hooks/test', async (req, res) => {
      try {
        const { hookId, scope, projectName, mockEventData } = req.body;
        
        if (!hookId || !scope) {
          return res.status(400).json({ error: 'Hook ID and scope are required' });
        }

        const result = await this.hookEventService.testHook(hookId, scope, projectName, mockEventData);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Hook event webhook endpoint
    this.app.post('/api/hooks/webhook', async (req, res) => {
      try {
        const result = await this.hookEventService.receiveHookEvent(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get hook execution statistics
    this.app.get('/api/hooks/stats', (req, res) => {
      try {
        const registryStats = this.hookRegistry.getStats();
        const eventServiceStats = this.hookEventService ? this.hookEventService.getStats() : {};
        
        res.json({
          registry: registryStats,
          eventService: eventServiceStats
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get hook templates
    this.app.get('/api/hooks/templates', (req, res) => {
      try {
        const templates = {
          'tts-notification': {
            name: 'TTS Notification',
            description: 'Speak all notifications using text-to-speech',
            eventType: 'Notification',
            pattern: '*'
          },
          'file-backup': {
            name: 'File Backup',
            description: 'Create backups before file modifications',
            eventType: 'PreToolUse',
            pattern: 'Write|Edit'
          },
          'completion-sound': {
            name: 'Completion Sound',
            description: 'Play success sound when tasks complete',
            eventType: 'Stop',
            pattern: '*'
          },
          'ollama-summary': {
            name: 'AI Summary',
            description: 'Generate AI summary of completed operations using Ollama',
            eventType: 'PostToolUse',
            pattern: '*'
          }
        };
        
        res.json(templates);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Generate hook from template
    this.app.post('/api/hooks/generate-template', async (req, res) => {
      try {
        const { template, customization } = req.body;
        
        if (!template) {
          return res.status(400).json({ error: 'Template name is required' });
        }

        const result = await this.hookGenerator.generateTemplateHook(template, customization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Catch-all handler for React Router - must be last
    this.app.get('*', (req, res) => {
      const reactBuildPath = path.join(__dirname, '..', 'frontend', 'build');
      const publicPath = path.join(__dirname, 'public');
      
      if (fs.existsSync(reactBuildPath)) {
        res.sendFile(path.join(reactBuildPath, 'index.html'));
      } else {
        res.sendFile(path.join(publicPath, 'index.html'));
      }
    });
  }

  // State Management
  async getFullState() {
    const projectState = this.projectService.getState();
    const sessionState = this.sessionService.getState();
    
    return {
      // User-level state
      userConfig: this.state.userConfig,
      userEnvVars: this.state.userEnvVars,
      settings: this.state.settings,
      
      // Service states
      projects: projectState.projects,
      projectEnvVars: projectState.projectEnvVars,
      
      sessionTracking: sessionState,
      
      lastUpdate: this.state.lastUpdate
    };
  }

  // Cleanup
  async shutdown() {
    console.log('Shutting down Claude Manager...');
    
    // Stop services
    await this.sessionService.shutdown();
    this.fileWatcher.closeAllWatchers();
    
    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }
    
    // Close server
    if (this.server) {
      this.server.close();
    }
    
    console.log('Claude Manager stopped');
  }
}

module.exports = ClaudeManager;