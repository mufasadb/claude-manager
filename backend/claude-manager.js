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
const ClaudeConfigReader = require('./services/claude-config-reader');
const HookRegistry = require('./services/data/hook-registry');
const HookEventService = require('./services/hook-event-service');
const HookGenerator = require('./services/operations/hook-generator');
const MCPDiscoveryService = require('./services/mcp-discovery-service');
const DocsService = require('./services/docs-service');

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
    this.claudeConfigReader = new ClaudeConfigReader();
    this.mcpService = new MCPService(this.claudeConfigReader, this.projectService);
    this.commandService = new CommandService(this);
    this.agentService = new AgentService(this);
    this.hookRegistry = new HookRegistry();
    this.hookEventService = null; // Will be initialized after user env vars are loaded
    this.hookGenerator = null; // Will be initialized with Task agent reference
    this.mcpDiscoveryService = new MCPDiscoveryService(this);
    this.docsService = new DocsService();

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
    
    // Load initial data first
    await this.refreshAllData();
    
    // Set up file watchers
    this.setupFileWatchers();
    
    // Initialize hook services after user env vars are loaded  
    await this.initializeHookServices();
    
    // Set up web server LAST
    this.setupWebServer();
    
    // Set up periodic MCP sync
    this.setupPeriodicMCPSync();
    
    console.log('✓ Claude Manager started on http://localhost:3455');
  }

  async refreshAllData() {
    try {
      // Load user configuration
      await this.loadUserConfig();
      
      // Load user environment variables
      await this.loadUserEnvVars();
      
      // Update timestamp
      this.state.lastUpdate = Date.now();
      
      console.log('All data refreshed successfully');
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }

  async loadUserConfig() {
    try {
      const userPaths = getUserConfigPaths();
      if (await fs.pathExists(userPaths.settings)) {
        this.state.userConfig = await fs.readJson(userPaths.settings);
      }
    } catch (error) {
      console.error('Error loading user config:', error);
      this.state.userConfig = {};
    }
  }

  async loadUserEnvVars() {
    try {
      if (await fs.pathExists(this.userEnvFile)) {
        this.state.userEnvVars = parseEnvFile(await fs.readFile(this.userEnvFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading user env vars:', error);
      this.state.userEnvVars = {};
    }
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

    // Register project hooks for existing projects with both systems
    const projects = this.projectService.getProjects();
    for (const [projectName, project] of Object.entries(projects)) {
      await this.hookRegistry.loadProjectHooks(projectName, project.path);
      await this.hookEventService.registerProject(projectName, project.path);
    }

    // Set up hook event broadcasting
    this.setupHookEventBroadcasting();
  }

  // Hook Event Broadcasting
  setupHookEventBroadcasting() {
    if (!this.hookEventService) return;

    // Listen for incoming hook events and broadcast them
    this.hookEventService.on('eventReceived', (event) => {
      this.broadcastToClients({
        type: 'hookEventReceived',
        event: {
          id: event.id,
          eventType: event.eventType,
          toolName: event.toolName,
          projectPath: event.projectPath,
          timestamp: event.timestamp,
          receivedAt: event.receivedAt
        }
      });
    });

    // Listen for processed events and broadcast results
    this.hookEventService.on('eventProcessed', (result) => {
      this.broadcastToClients({
        type: 'hookEventProcessed',
        result: {
          eventId: result.event.id,
          eventType: result.event.eventType,
          hooksExecuted: result.hooksExecuted,
          processingTime: result.processingTime,
          timestamp: Date.now()
        }
      });
    });

    // Listen for hook execution results
    this.hookEventService.on('hookExecuted', (execution) => {
      this.broadcastToClients({
        type: 'hookExecuted',
        execution: {
          eventId: execution.event.id,
          hookName: execution.hook.name,
          success: execution.result.success,
          timestamp: Date.now()
        }
      });
    });

    // Listen for hook errors
    this.hookEventService.on('hookError', (error) => {
      this.broadcastToClients({
        type: 'hookError',
        error: {
          eventId: error.event?.id || 'unknown',
          hookName: error.hook?.name || 'unknown',
          message: error.error,
          timestamp: Date.now()
        }
      });
    });

    // Listen for hook log updates
    this.hookEventService.on('hookLogUpdated', (logEvent) => {
      this.broadcastToClients({
        type: 'hookLogUpdated',
        logEvent
      });
    });
  }

  // File Watching
  setupFileWatchers() {
    this.fileWatcher.setupFileWatchers(
      this.projectService.getProjects(),
      this.onFileChange.bind(this)
    );
  }

  // Periodic MCP Sync
  setupPeriodicMCPSync() {
    // Initial sync on startup
    setTimeout(async () => {
      try {
        console.log('Performing initial MCP sync on startup...');
        const syncResult = await this.mcpService.syncWithClaudeConfig();
        if (syncResult.success) {
          this.state.mcps = this.mcpService.getState();
          this.broadcastToClients({ 
            type: 'mcpUpdate', 
            mcps: this.state.mcps,
            syncTriggered: true,
            syncReason: 'startup_sync'
          });
          console.log('Initial MCP sync completed successfully');
        }
      } catch (error) {
        console.error('Initial MCP sync failed:', error);
      }
    }, 5000); // Wait 5 seconds after startup

    // Periodic sync every 5 minutes
    this.mcpSyncInterval = setInterval(async () => {
      try {
        console.log('Performing periodic MCP sync...');
        const syncResult = await this.mcpService.syncWithClaudeConfig();
        if (syncResult.success && (syncResult.syncResults?.added?.length > 0 || 
                                   syncResult.syncResults?.removed?.length > 0 || 
                                   syncResult.syncResults?.movedToDisabled?.length > 0)) {
          this.state.mcps = this.mcpService.getState();
          this.broadcastToClients({ 
            type: 'mcpUpdate', 
            mcps: this.state.mcps,
            syncTriggered: true,
            syncReason: 'periodic_sync',
            changes: syncResult.syncResults
          });
          console.log('Periodic MCP sync found changes and updated state');
        }
      } catch (error) {
        console.error('Periodic MCP sync failed:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  async onFileChange(scope, filePath, projectName) {
    console.log(`File changed: ${filePath} (${scope}${projectName ? ` - ${projectName}` : ''})`);
    
    // Handle registry.json changes
    if (filePath.includes('registry.json')) {
      console.log('Registry file changed, refreshing projects...');
      await this.projectService.reload();
      this.state.projects = this.projectService.getProjects();
      this.state.projectEnvVars = this.projectService.getAllProjectEnvVars();
      
      // Update file watchers for the new project list
      this.setupFileWatchers();
      
      // Broadcast project update to clients
      this.broadcastToClients({ 
        type: 'projectUpdate', 
        projects: this.state.projects,
        projectEnvVars: this.state.projectEnvVars
      });
      return;
    }
    
    if (scope === 'user') {
      await this.refreshUserConfig();
      await this.refreshUserEnvVars();
    } else if (scope === 'project' && projectName) {
      await this.projectService.refreshProjectConfig(projectName);
      await this.projectService.refreshProjectEnvVars(projectName);
    }
    
    // Trigger MCP sync if settings.json files changed (they contain MCP configurations)
    if (filePath.includes('settings.json')) {
      try {
        console.log('Settings file changed, triggering MCP sync...');
        const syncResult = await this.mcpService.syncWithClaudeConfig();
        if (syncResult.success) {
          this.state.mcps = this.mcpService.getState();
          // Broadcast MCP update to clients
          this.broadcastToClients({ 
            type: 'mcpUpdate', 
            mcps: this.state.mcps,
            syncTriggered: true,
            syncReason: 'settings_file_changed'
          });
        }
      } catch (error) {
        console.error('Failed to sync MCPs after settings file change:', error);
      }
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
    
    // Enable CORS for development - frontend on port 3456, backend on 3455
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', 'http://localhost:3456');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      next();
    });
    
    // Backend serves ONLY REST API - no static files
    // Frontend dev server runs on port 3456 for development
    
    // API Routes
    this.setupAPIRoutes();
    
    // Create HTTP server
    const http = require('http');
    this.server = http.createServer(this.app);
    
    // Set up WebSocket server
    try {
      const WebSocket = require('ws');
      this.wss = new WebSocket.Server({ server: this.server });
      this.setupWebSocket();
      console.log('WebSocket server initialized');
    } catch (error) {
      console.error('WebSocket setup failed:', error);
    }
    
    const port = 3455;
    this.server.on('error', (error) => {
      console.error('Server error:', error);
      // Try to kill any existing process on this port
      require('child_process').exec(`lsof -ti:${port} | xargs kill -9`, (err) => {
        if (!err) console.log('Killed existing process on port', port);
      });
    });
    
    this.server.listen(port, (error) => {
      if (error) {
        console.error('Failed to start server:', error);
      } else {
        console.log(`✅ Server successfully listening on port ${port}`);
      }
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
        const { name, path: projectPath, statusDisplay } = req.body;
        const result = await this.projectService.registerProject(name, projectPath, statusDisplay);
        
        // Register with both hook systems
        await this.hookRegistry.loadProjectHooks(name, projectPath);
        await this.hookEventService.registerProject(name, projectPath);
        
        this.fileWatcher.updateProjectWatchers(this.projectService.getProjects());
        res.json({ success: true, project: result });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/unregister-project', async (req, res) => {
      try {
        const { name } = req.body;
        const project = this.projectService.getProject(name);
        const projectPath = project?.path;
        
        const result = await this.projectService.unregisterProject(name);
        
        // Unregister from both hook systems
        await this.hookRegistry.unregisterProject(name);
        if (projectPath) {
          await this.hookEventService.unregisterProject(name, projectPath);
        }
        
        this.fileWatcher.updateProjectWatchers(this.projectService.getProjects());
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Status display management endpoints
    this.app.get('/api/project-status-display', async (req, res) => {
      try {
        const { path: projectPath } = req.query;
        
        if (!projectPath) {
          return res.status(400).json({ error: 'Project path is required' });
        }

        const statusDisplay = this.projectService.getStatusDisplayByPath(projectPath);
        res.json({ statusDisplay: statusDisplay || 'http://localhost:3456' }); // Default fallback
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/update-status-display', async (req, res) => {
      try {
        const { projectName, statusDisplay } = req.body;
        
        if (!projectName) {
          return res.status(400).json({ error: 'Project name is required' });
        }

        const result = await this.projectService.updateStatusDisplay(projectName, statusDisplay);
        this.broadcastToClients();
        res.json({ success: true, project: result });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Quick actions for projects
    this.app.post('/api/open-vscode', async (req, res) => {
      try {
        const { projectPath } = req.body;
        
        if (!projectPath) {
          return res.status(400).json({ error: 'Project path is required' });
        }

        const { exec } = require('child_process');
        exec(`code "${projectPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error('Error opening VS Code:', error);
            return res.status(500).json({ error: 'Failed to open VS Code' });
          }
          res.json({ success: true });
        });
      } catch (error) {
        console.error('Error opening VS Code:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/open-finder', async (req, res) => {
      try {
        const { projectPath } = req.body;
        
        if (!projectPath) {
          return res.status(400).json({ error: 'Project path is required' });
        }

        const { exec } = require('child_process');
        exec(`open "${projectPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error('Error opening Finder:', error);
            return res.status(500).json({ error: 'Failed to open Finder' });
          }
          res.json({ success: true });
        });
      } catch (error) {
        console.error('Error opening Finder:', error);
        res.status(500).json({ error: error.message });
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

    this.app.get('/api/session-stats', async (req, res) => {
      const stats = await this.sessionService.getSessionStats();
      res.json(stats);
    });

    this.app.post('/api/set-billing-date', async (req, res) => {
      try {
        const { billingDate } = req.body;
        if (!billingDate || billingDate < 1 || billingDate > 31) {
          return res.status(400).json({ error: 'Billing date must be between 1 and 31' });
        }
        
        await this.sessionService.setBillingDate(billingDate);
        const updatedStats = await this.sessionService.getSessionStats();
        
        // Broadcast the updated stats to all connected clients
        this.broadcastToClients({
          type: 'sessionStatsUpdate',
          stats: updatedStats
        });
        
        res.json({ success: true, billingDate, stats: updatedStats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/reprocess-sessions', async (req, res) => {
      try {
        // Force a complete re-processing of all session data to extract token usage
        await this.sessionService.updateSessionTracking();
        const updatedStats = await this.sessionService.getSessionStats();
        
        // Broadcast the updated stats to all connected clients
        this.broadcastToClients({
          type: 'sessionStatsUpdate',
          stats: updatedStats
        });
        
        res.json({ success: true, message: 'Session data reprocessed successfully', stats: updatedStats });
      } catch (error) {
        console.error('Error reprocessing sessions:', error);
        res.status(500).json({ error: error.message });
      }
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
        const stats = await this.sessionService.getSessionStats();
        
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
            return this.sessionService.isSessionActive(session.start, now);
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
            return !this.sessionService.isSessionActive(session.start, now);
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
        const stats = await this.sessionService.getSessionStats();
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
          isActive: this.sessionService.isSessionActive(session.start)
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

    this.app.get('/api/mcp/actual-config', async (req, res) => {
      try {
        const actualConfig = await this.claudeConfigReader.getActualMCPConfiguration();
        res.json(actualConfig);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/sync-with-claude', async (req, res) => {
      try {
        const syncResult = await this.claudeConfigReader.syncWithClaudeManagerConfig();
        
        if (syncResult.success) {
          // Broadcast the sync results to connected clients
          this.broadcastToClients({ 
            type: 'mcpConfigSynced', 
            syncResults: syncResult.syncResults,
            managerConfig: syncResult.managerConfig
          });
        }
        
        res.json(syncResult);
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
        
        // Include warning in response if present
        if (result.warning) {
          res.json({ success: true, warning: result.warning });
        } else {
          res.json(result);
        }
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
        
        // Include warning in response if present
        if (result.warning) {
          res.json({ success: true, warning: result.warning });
        } else {
          res.json(result);
        }
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

    // MCP Discovery Endpoints
    this.app.post('/api/mcp/discover', async (req, res) => {
      try {
        const { description, preferredLLM = 'openrouter' } = req.body;
        
        if (!description || description.trim().length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'Description is required for MCP discovery' 
          });
        }

        console.log(`Starting MCP discovery for: "${description}" using ${preferredLLM}`);
        
        const result = await this.mcpDiscoveryService.discoverMCPServer(description, preferredLLM);
        
        res.json(result);
      } catch (error) {
        console.error('MCP discovery failed:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    this.app.get('/api/mcp/discovery/health', async (req, res) => {
      try {
        const healthStatus = await this.mcpDiscoveryService.healthCheck();
        res.json(healthStatus);
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    this.app.post('/api/mcp/add-discovered', async (req, res) => {
      try {
        const { scope, template, projectPath } = req.body;
        
        if (!template || !template.template) {
          return res.status(400).json({ 
            success: false, 
            error: 'Template data is required' 
          });
        }

        // Validate scope for project installations
        if (scope === 'project' && !projectPath) {
          return res.status(400).json({ 
            success: false, 
            error: 'Project path is required for project scope installations' 
          });
        }

        const mcpTemplate = template.template;
        
        // Prepare the MCP configuration from the discovered template
        const mcpConfig = {
          name: template.templateKey || mcpTemplate.name.toLowerCase().replace(/\s+/g, '-'),
          command: mcpTemplate.command,
          transport: mcpTemplate.transport || 'stdio',
          args: mcpTemplate.args || [],
          envVars: mcpTemplate.providedEnvVars || {},
          projectPath: scope === 'project' ? projectPath : undefined
        };

        // Check if environment variables are required but not provided
        const requiresEnvVars = mcpTemplate.envVars && mcpTemplate.envVars.length > 0;
        let hasRequiredEnvVars = true;
        
        if (requiresEnvVars) {
          for (const envVar of mcpTemplate.envVars) {
            if (envVar.required && (!mcpConfig.envVars[envVar.key] || mcpConfig.envVars[envVar.key].trim() === '')) {
              hasRequiredEnvVars = false;
              break;
            }
          }
        }

        // If environment variables are required but not all are provided,
        // add the template and return instructions for manual configuration
        if (requiresEnvVars && !hasRequiredEnvVars) {
          // Add the template to MCP service for later use
          const templateKey = template.templateKey || mcpTemplate.name.toLowerCase().replace(/\s+/g, '-');
          this.mcpService.templates[templateKey] = mcpTemplate;

          return res.json({
            success: true,
            requiresEnvVars: true,
            templateAdded: templateKey,
            templateName: mcpTemplate.name,
            template: mcpTemplate,
            message: `Template "${mcpTemplate.name}" has been created but requires environment variables. Please configure the required variables and add the MCP manually.`,
            envVars: mcpTemplate.envVars
          });
        }

        // If no environment variables are required, directly install the MCP
        try {
          const result = await this.mcpService.addMCP(scope, mcpConfig, projectPath);
          
          // Update state and broadcast
          this.state.mcps = this.mcpService.getState();
          this.broadcastToClients({ type: 'mcpUpdate', mcps: this.state.mcps });
          
          res.json({
            success: true,
            mcpInstalled: true,
            mcpName: mcpConfig.name,
            templateName: mcpTemplate.name,
            message: `MCP server "${mcpTemplate.name}" has been successfully installed and configured!`,
            result
          });
        } catch (installError) {
          // If installation fails, still add the template for manual retry
          const templateKey = template.templateKey || mcpTemplate.name.toLowerCase().replace(/\s+/g, '-');
          this.mcpService.templates[templateKey] = mcpTemplate;
          
          return res.json({
            success: false,
            error: `Failed to install MCP: ${installError.message}`,
            templateAdded: templateKey,
            templateName: mcpTemplate.name,
            message: `Installation failed, but template "${mcpTemplate.name}" has been saved. You can try installing it manually from the MCP templates.`
          });
        }

      } catch (error) {
        console.error('Failed to add discovered MCP:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Save Complex Installation Template Endpoint
    this.app.post('/api/mcp/save-complex-template', async (req, res) => {
      try {
        const { templateData } = req.body;
        
        if (!templateData || !templateData.name) {
          return res.status(400).json({ 
            success: false, 
            error: 'Template data with name is required' 
          });
        }

        // Generate a template key from the name
        const templateKey = templateData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        // Create the template object
        const template = {
          name: templateData.name,
          description: templateData.description,
          installationType: 'complex',
          installationSteps: templateData.installationSteps || [],
          environmentVars: templateData.environmentVars || [],
          finalCommand: templateData.finalCommand,
          transport: templateData.finalCommand?.transport || 'stdio',
          createdAt: templateData.createdAt || Date.now(),
          // Convert to standard template format for compatibility
          command: templateData.finalCommand?.command || 'node',
          args: templateData.finalCommand?.args || [],
          envVars: templateData.environmentVars || []
        };

        // Save to MCP service templates
        this.mcpService.templates[templateKey] = template;

        // Also save to a persistent file for complex templates
        const complexTemplatesPath = path.join(this.userDataDir, 'complex-templates.json');
        let complexTemplates = {};
        
        try {
          if (await fs.pathExists(complexTemplatesPath)) {
            complexTemplates = await fs.readJson(complexTemplatesPath);
          }
        } catch (error) {
          console.warn('Could not read existing complex templates:', error.message);
        }

        complexTemplates[templateKey] = template;
        await fs.writeJson(complexTemplatesPath, complexTemplates, { spaces: 2 });

        res.json({
          success: true,
          templateKey,
          templateName: template.name,
          message: `Complex installation template "${template.name}" has been saved successfully!`,
          template
        });

      } catch (error) {
        console.error('Failed to save complex template:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // MCP Logs Endpoint
    this.app.get('/api/mcp/logs/:scope/:mcpName', async (req, res) => {
      try {
        const { scope, mcpName } = req.params;
        const { projectPath } = req.query;
        
        // Get the project path for this MCP server
        let searchPath = '';
        if (scope === 'project' && projectPath) {
          searchPath = projectPath;
        } else {
          // For user scope, we need to find projects that use this MCP
          const projects = this.projectService.getProjects();
          searchPath = Object.values(projects)[0]?.path || process.cwd();
        }
        
        let logs = [];
        let debugInfo = [];
        let searchedDirectories = [];
        
        // Multiple possible log locations for Claude Code
        const possibleLogDirs = [
          // Original location
          path.join(os.homedir(), '.claude', 'projects', searchPath.replace(/\//g, '-').replace(/^-/, '')),
          // Alternative location based on project hash or different naming
          path.join(os.homedir(), '.claude', 'projects', path.basename(searchPath)),
          // Session logs directory
          path.join(os.homedir(), '.claude', 'sessions'),
          // Direct projects folder scan
          path.join(os.homedir(), '.claude', 'projects'),
          // Local project logs
          path.join(searchPath, '.claude', 'logs'),
          // Claude cache directory
          path.join(os.homedir(), '.claude', 'cache'),
          // Temp or system logs
          path.join(os.tmpdir(), 'claude-logs')
        ];
        
        // Check for logs in all possible directories
        for (const logDir of possibleLogDirs) {
          try {
            if (await fs.pathExists(logDir)) {
              searchedDirectories.push(logDir);
              debugInfo.push(`Found directory: ${logDir}`);
              
              const entries = await fs.readdir(logDir, { withFileTypes: true });
              
              // Check for direct .jsonl files
              const jsonlFiles = entries
                .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
                .map(entry => entry.name)
                .sort((a, b) => b.localeCompare(a)) // Most recent first
                .slice(0, 20); // Check more files
              
              // Also check subdirectories
              const subDirs = entries
                .filter(entry => entry.isDirectory())
                .map(entry => entry.name);
              
              debugInfo.push(`Directory ${logDir} - Files: ${jsonlFiles.length}, Subdirs: ${subDirs.length}`);
              
              // Process direct files
              for (const file of jsonlFiles) {
                const filePath = path.join(logDir, file);
                await this.processLogFile(filePath, file, mcpName, logs, debugInfo);
              }
              
              // Process subdirectories (for nested project structure)
              for (const subDir of subDirs.slice(0, 10)) { // Limit subdirs to avoid performance issues
                const subDirPath = path.join(logDir, subDir);
                try {
                  const subEntries = await fs.readdir(subDirPath, { withFileTypes: true });
                  const subJsonlFiles = subEntries
                    .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
                    .map(entry => entry.name)
                    .sort((a, b) => b.localeCompare(a))
                    .slice(0, 10);
                  
                  for (const file of subJsonlFiles) {
                    const filePath = path.join(subDirPath, file);
                    await this.processLogFile(filePath, file, mcpName, logs, debugInfo);
                  }
                } catch (subError) {
                  debugInfo.push(`Error reading subdirectory ${subDir}: ${subError.message}`);
                }
              }
            } else {
              debugInfo.push(`Directory not found: ${logDir}`);
            }
          } catch (dirError) {
            debugInfo.push(`Error accessing directory ${logDir}: ${dirError.message}`);
          }
        }
        
        // Sort by timestamp descending (most recent first)
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json({
          success: true,
          mcpName,
          scope,
          projectPath: searchPath,
          logs: logs.slice(0, 100), // Limit to 100 entries
          totalFound: logs.length,
          logDirectory: searchedDirectories[0] || possibleLogDirs[0],
          searchedDirectories,
          debugInfo,
          availableMCPs: Object.keys(this.state.mcps?.userMCPs?.active || {}),
          projectMCPs: Object.keys(this.state.mcps?.projectMCPs?.active || {})
        });
        
      } catch (error) {
        console.error('Failed to fetch MCP logs:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Slash Command Management
    this.app.post('/api/create-slash-command', async (req, res) => {
      try {
        const { commandName, instructions, scope, category, projectName } = req.body;
        
        const result = await this.commandService.createSlashCommand(
          commandName, 
          instructions, 
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
              description: result.description,
              instructions,
              scope,
              category,
              projectName,
              path: result.commandPath,
              relativePath: result.relativePath,
              allowedTools: result.allowedTools,
              suggestedCategory: result.suggestedCategory
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

    this.app.get('/api/get-slash-command-content', async (req, res) => {
      try {
        const { scope, relativePath, projectName } = req.query;
        const result = await this.commandService.getCommandContent(scope, relativePath, projectName);
        
        if (result.success) {
          res.json({ 
            success: true, 
            content: result.content,
            relativePath: result.relativePath 
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: result.error 
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/delete-slash-command', async (req, res) => {
      try {
        const { scope, relativePath, projectName } = req.body;
        
        const result = await this.commandService.deleteSlashCommand(
          scope,
          relativePath,
          projectName
        );
        
        if (result.success) {
          // Broadcast command deletion to connected clients
          this.broadcastToClients({ 
            type: 'slashCommandDeleted', 
            command: {
              scope,
              relativePath,
              projectName,
              path: result.commandPath
            }
          });
        }
        
        res.json(result);
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
        const { scope = 'user', projectName } = req.query;
        const tools = this.agentService.getAvailableTools(scope, projectName);
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

    // Slash Command Management API Endpoints
    
    // Create slash command
    this.app.post('/api/create-slash-command', async (req, res) => {
      try {
        const { commandName, instructions, scope, category, projectName } = req.body;
        
        if (!commandName || !instructions || !scope) {
          return res.status(400).json({ error: 'Command name, instructions, and scope are required' });
        }

        const result = await this.commandService.createSlashCommand(
          commandName,
          instructions,
          scope,
          category,
          projectName
        );

        if (result.success) {
          // Log successful creation
          console.log(`Successfully created slash command: ${result.relativePath}`);
        }

        res.json(result);
      } catch (error) {
        console.error('Error creating slash command:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List slash commands
    this.app.get('/api/slash-commands/:scope', async (req, res) => {
      try {
        const { scope } = req.params;
        const { projectName } = req.query;

        const commands = await this.commandService.listExistingCommands(scope, projectName);
        res.json({ commands });
      } catch (error) {
        console.error('Error listing slash commands:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete slash command
    this.app.delete('/api/slash-commands/:scope/:relativePath(*)', async (req, res) => {
      try {
        const { scope, relativePath } = req.params;
        const { projectName } = req.query;

        const result = await this.commandService.deleteSlashCommand(scope, relativePath, projectName);
        res.json(result);
      } catch (error) {
        console.error('Error deleting slash command:', error);
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

    // List hooks (supports both registry and file-based systems)
    this.app.get('/api/hooks/list/:scope', async (req, res) => {
      try {
        const { scope } = req.params;
        const { projectName } = req.query;
        
        let hooks;
        if (this.hookEventService.useFileBasedHooks) {
          const projectPath = projectName ? this.projectService.getProject(projectName)?.path : null;
          hooks = this.hookEventService.fileBasedHooks.getHooks(scope, projectPath);
        } else {
          hooks = this.hookRegistry.getHooks(scope, projectName);
        }
        
        res.json({ hooks, scope, projectName, useFileBasedHooks: this.hookEventService.useFileBasedHooks });
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
        // Log WebFetch events for debugging
        if (req.body.toolName === 'WebFetch') {
          console.log('🔍 WebFetch hook event:', JSON.stringify(req.body, null, 2));
        }
        
        const result = await this.hookEventService.receiveHookEvent(req.body);
        res.json(result);
      } catch (error) {
        console.log('❌ Hook webhook error:', error.message);
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

    // Get recent hook events
    this.app.get('/api/hooks/events', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const events = this.hookEventService ? this.hookEventService.getRecentEvents(limit) : [];
        
        res.json({
          events: events,
          total: events.length,
          limit: limit
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === HOOK LOGGING ENDPOINTS ===
    
    // Get recent hook logs
    this.app.get('/api/hooks/logs', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await this.hookEventService.getRecentHookLogs(limit);
        
        res.json({
          logs: logs,
          total: logs.length,
          limit: limit
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get hook log statistics (must come before parameterized route)
    this.app.get('/api/hooks/logs/stats', async (req, res) => {
      try {
        const stats = await this.hookEventService.getHookLogStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Search hook logs (must come before parameterized route)
    this.app.get('/api/hooks/logs/search', async (req, res) => {
      try {
        const { q: searchTerm } = req.query;
        const limit = parseInt(req.query.limit) || 100;
        
        if (!searchTerm) {
          return res.status(400).json({ error: 'Search term (q) is required' });
        }
        
        const logs = await this.hookEventService.searchHookLogs(searchTerm, limit);
        
        res.json({
          logs: logs,
          searchTerm: searchTerm,
          total: logs.length,
          limit: limit
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get hook logs by hook ID
    this.app.get('/api/hooks/logs/:hookId', async (req, res) => {
      try {
        const { hookId } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const logs = await this.hookEventService.getHookLogsByHookId(hookId, limit);
        
        res.json({
          logs: logs,
          hookId: hookId,
          total: logs.length,
          limit: limit
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === FILE-BASED HOOK MANAGEMENT ENDPOINTS ===
    
    // Create hook file from template
    this.app.post('/api/hooks-files/create', async (req, res) => {
      try {
        const { scope, projectName, filename, template } = req.body;
        
        if (!filename || !template || !scope) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const projectPath = projectName ? this.projectService.getProject(projectName)?.path : null;
        const filePath = await this.hookEventService.fileBasedHooks.createHookFromTemplate(
          scope, projectPath, filename, template
        );
        
        this.broadcastState();
        res.json({ success: true, filePath, filename });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Update hook file content
    this.app.put('/api/hooks-files/update', async (req, res) => {
      try {
        const { scope, projectName, filename, content } = req.body;
        
        if (!filename || !content || !scope) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const projectPath = projectName ? this.projectService.getProject(projectName)?.path : null;
        await this.hookEventService.fileBasedHooks.updateHookFile(
          scope, projectPath, filename, content
        );
        
        this.broadcastState();
        res.json({ success: true, filename });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Enable hook (move from disabled directory)
    this.app.post('/api/hooks-files/enable', async (req, res) => {
      try {
        const { scope, projectName, filename } = req.body;
        
        if (!filename || !scope) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const projectPath = projectName ? this.projectService.getProject(projectName)?.path : null;
        await this.hookEventService.fileBasedHooks.enableHook(scope, projectPath, filename);
        
        this.broadcastState();
        res.json({ success: true, filename, enabled: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Disable hook (move to disabled directory)
    this.app.post('/api/hooks-files/disable', async (req, res) => {
      try {
        const { scope, projectName, filename } = req.body;
        
        if (!filename || !scope) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const projectPath = projectName ? this.projectService.getProject(projectName)?.path : null;
        await this.hookEventService.fileBasedHooks.disableHook(scope, projectPath, filename);
        
        this.broadcastState();
        res.json({ success: true, filename, enabled: false });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Delete hook file permanently
    this.app.delete('/api/hooks-files/delete', async (req, res) => {
      try {
        const { scope, projectName, filename } = req.body;
        
        if (!filename || !scope) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const projectPath = projectName ? this.projectService.getProject(projectName)?.path : null;
        await this.hookEventService.fileBasedHooks.deleteHook(scope, projectPath, filename);
        
        this.broadcastState();
        res.json({ success: true, filename, deleted: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get hook templates
    this.app.get('/api/hooks/templates', (req, res) => {
      try {
        const HookTemplates = require('./services/hook-templates');
        const templates = HookTemplates.getAllTemplates();
        const categories = HookTemplates.getCategories();
        
        res.json({ templates, categories });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get templates by category
    this.app.get('/api/hooks/templates/category/:category', (req, res) => {
      try {
        const HookTemplates = require('./services/hook-templates');
        const { category } = req.params;
        const templates = HookTemplates.getTemplatesByCategory(category);
        
        res.json({ templates, category });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Create hook from template
    this.app.post('/api/hooks/create-from-template', async (req, res) => {
      try {
        const HookTemplates = require('./services/hook-templates');
        const { templateKey, scope, projectName, customName, variables } = req.body;
        
        if (!templateKey || !scope) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const template = HookTemplates.getTemplate(templateKey);
        if (!template) {
          return res.status(404).json({ error: 'Template not found' });
        }
        
        // Generate filename
        const filename = HookTemplates.generateFilename(templateKey, customName);
        
        // Customize template with variables
        const customizedTemplate = HookTemplates.customizeTemplate(template, variables);
        
        // Create hook file
        const projectPath = projectName ? this.projectService.getProject(projectName)?.path : null;
        const filePath = await this.hookEventService.fileBasedHooks.createHookFromTemplate(
          scope, projectPath, filename, customizedTemplate
        );
        
        this.broadcastState();
        res.json({ 
          success: true, 
          filename, 
          filePath,
          template: template.name 
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Legacy templates endpoint (keeping for backward compatibility)
    this.app.get('/api/hooks/legacy-templates', (req, res) => {
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

    // Anthropic Docs Interceptor Hook API
    this.app.post('/api/hooks/anthropic-docs-interceptor', async (req, res) => {
      try {
        const { url, toolInput } = req.body;
        
        // Check if this is a call to Anthropic documentation
        if (!url || !url.includes('docs.anthropic.com')) {
          return res.json({ 
            success: true, 
            skipped: true, 
            reason: 'Not an Anthropic docs URL',
            allowProceed: true 
          });
        }
        
        // Check if local docs are available
        const docsDir = path.join(os.homedir(), '.claude-manager-docs');
        const docsAvailable = await fs.pathExists(docsDir);
        
        let message = `🚫 Intercepted WebFetch call to: ${url}\n\n`;
        
        if (docsAvailable) {
          // Check if docs service is available
          const docsPath = path.join(docsDir, 'docs');
          const docsInstalled = await fs.pathExists(docsPath);
          
          if (docsInstalled) {
            message += `✅ Local Claude Code documentation is available!\n\n`;
            message += `Instead of fetching from the web, you can:\n`;
            message += `1. Use: cm-docs search "your query" (searches local docs)\n`;
            message += `2. Browse locally at: ${docsPath}\n`;
            message += `3. Check specific files in: ${docsPath}/claude-code/\n\n`;
            
            // Try to suggest the specific local file based on the URL
            const urlParts = url.split('/docs/claude-code/');
            if (urlParts.length > 1) {
              const docPath = urlParts[1].replace(/\/$/, '') || 'overview';
              const localFile = path.join(docsPath, 'claude-code', `${docPath}.md`);
              
              if (await fs.pathExists(localFile)) {
                message += `   The specific file you're looking for is likely at:\n`;
                message += `   ${localFile}\n\n`;
              }
            }
            
            message += `📝 To sync local docs: cm-docs sync\n`;
            message += `   To check docs status: cm-docs status\n\n`;
          } else {
            message += `   Local docs directory exists but incomplete.\n`;
            message += `Run: cm-docs sync to fix this.\n\n`;
          }
        } else {
          message += `❌ Local Claude Code documentation not installed.\n\n`;
          message += `To install local docs (faster access):\n`;
          message += `1. Run: ./install-docs.sh (from claude-manager directory)\n`;
          message += `2. Then use: cm-docs search "your query"\n\n`;
        }
        
        message += `⚡ Local docs are much faster than web fetching!\n`;
        message += `🔄 This hook can be disabled in Hook Management if needed.`;

        // Block the WebFetch call by returning blocked status
        return res.json({
          success: false,
          blocked: true,
          message: message,
          timestamp: new Date().toISOString(),
          allowProceed: false
        });

      } catch (error) {
        console.error('Error in Anthropic docs interceptor hook:', error);
        return res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Generate hook from template
    this.app.post('/api/hooks/generate-template', async (req, res) => {
      try {
        const { template, customization } = req.body;
        
        if (!template) {
          return res.status(400).json({ error: 'Template name is required' });
        }

        // Provide static templates as fallback to avoid AI generation issues
        const staticTemplates = {
          'tts-notification': {
            success: true,
            code: `// TTS Notification Hook
try {
  // Get the notification message from the event context
  const message = hookEvent.context?.message || 
                 hookEvent.context?.notification || 
                 'Notification received';
  
  // Speak the notification using TTS
  await utils.speak(message)
    .then(result => console.log('Notification spoken:', result))
    .catch(err => console.log('TTS failed:', err));
  
  console.log('TTS Notification processed:', message);
  return 'Notification spoken: ' + message;
} catch (error) {
  console.error('TTS Notification hook error:', error);
  return 'TTS Notification failed: ' + error.message;
}`,
            metadata: {
              generatedAt: Date.now(),
              eventType: 'Notification',
              pattern: '*',
              description: 'Speak all notifications using text-to-speech',
              scope: customization?.scope || 'user',
              source: 'static_template'
            }
          },
          'completion-sound': {
            success: true,
            code: `// Completion Sound Hook
try {
  // Get project name if available
  const projectName = projectInfo?.name || 'current project';
  
  // Play success sound
  await utils.playSound('success')
    .then(result => console.log('Success sound played:', result))
    .catch(err => console.log('Sound playback failed:', err));
  
  console.log('Completion sound played for:', projectName);
  return 'Completion sound played for ' + projectName;
} catch (error) {
  console.error('Completion sound hook error:', error);
  return 'Completion sound failed: ' + error.message;
}`,
            metadata: {
              generatedAt: Date.now(),
              eventType: 'Stop',
              pattern: '*',
              description: 'Play success sound when tasks complete',
              scope: customization?.scope || 'user',
              source: 'static_template'
            }
          },
          'file-backup': {
            success: true,
            code: `// File Backup Hook
try {
  // Only run for Write/Edit operations
  if (hookEvent.toolName === 'Write' || hookEvent.toolName === 'Edit' || hookEvent.toolName === 'MultiEdit') {
    const filePaths = hookEvent.filePaths || [];
    
    if (filePaths.length > 0) {
      await utils.notify('Creating backups for ' + filePaths.length + ' files', 'info');
      console.log('Backup needed for files:', filePaths);
    }
  }
  
  return 'File backup check completed';
} catch (error) {
  console.error('File backup hook error:', error);
  return 'File backup failed: ' + error.message;
}`,
            metadata: {
              generatedAt: Date.now(),
              eventType: 'PreToolUse',
              pattern: 'Write|Edit',
              description: 'Create backups before file modifications',
              scope: customization?.scope || 'user',
              source: 'static_template'
            }
          },
          'ollama-summary': {
            success: true,
            code: `// AI Summary Hook
try {
  // Only summarize significant operations
  if (hookEvent.toolName && hookEvent.filePaths && hookEvent.filePaths.length > 0) {
    const summary = await utils.askOllama(
      'Briefly summarize this operation: ' + hookEvent.toolName + ' on files: ' + hookEvent.filePaths.join(', '),
      { model: 'llama3.2', max_tokens: 100 }
    );
    
    console.log('AI Summary generated:', summary);
    await utils.notify('Operation summary: ' + summary, 'info');
    return 'AI summary: ' + summary;
  }
  
  return 'No summary needed for this operation';
} catch (error) {
  console.error('AI summary hook error:', error);
  return 'AI summary failed: ' + error.message;
}`,
            metadata: {
              generatedAt: Date.now(),
              eventType: 'PostToolUse',
              pattern: '*',
              description: 'Generate AI summary of completed operations using Ollama',
              scope: customization?.scope || 'user',
              source: 'static_template'
            }
          }
        };
        
        // Return static template if available
        if (staticTemplates[template]) {
          return res.json(staticTemplates[template]);
        }

        // Fallback to AI generation if no static template
        const result = await this.hookGenerator.generateTemplateHook(template, customization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Documentation API endpoints
    this.app.get('/api/docs/status', async (req, res) => {
      try {
        const status = await this.docsService.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/docs/install', async (req, res) => {
      try {
        const result = await this.docsService.install();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/docs/sync', async (req, res) => {
      try {
        const result = await this.docsService.syncDocs();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/docs/search', async (req, res) => {
      try {
        const { q: query } = req.query;
        if (!query) {
          return res.status(400).json({ error: 'Query parameter "q" is required' });
        }
        
        const results = await this.docsService.searchDocs(query);
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/docs/changelog', async (req, res) => {
      try {
        const { limit = 10 } = req.query;
        const changelog = await this.docsService.getChangelog(parseInt(limit));
        res.json(changelog);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/docs/list', async (req, res) => {
      try {
        const files = await this.docsService.listDocs();
        res.json(files);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/docs/content', async (req, res) => {
      try {
        const { path: filePath } = req.query;
        if (!filePath) {
          return res.status(400).json({ error: 'Query parameter "path" is required' });
        }
        
        const content = await this.docsService.getDocContent(filePath);
        res.json(content);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/docs/auto-sync', async (req, res) => {
      try {
        const result = await this.docsService.autoSync();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // No catch-all handler - backend serves ONLY API endpoints
    // All other requests should return 404
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
      
      // MCP state
      mcps: this.state.mcps,
      
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
    
    // Clear periodic sync interval
    if (this.mcpSyncInterval) {
      clearInterval(this.mcpSyncInterval);
      console.log('Periodic MCP sync stopped');
    }
    
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

  // Helper method to process individual log files for MCP logs
  async processLogFile(filePath, fileName, mcpName, logs, debugInfo) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      debugInfo.push(`Processing file ${fileName}: ${lines.length} lines`);
      
      for (const line of lines) {
        try {
          const logEntry = JSON.parse(line);
          
          // More comprehensive MCP detection
          const entryJson = JSON.stringify(logEntry).toLowerCase();
          const mcpNameLower = mcpName.toLowerCase();
          
          let isRelevantEntry = false;
          
          // Check various ways MCP might be referenced in logs
          if (
            // Tool use with MCP name
            (logEntry.tool_use && (
              logEntry.tool_use.name?.toLowerCase().includes(mcpNameLower) ||
              logEntry.tool_use.function?.toLowerCase().includes(mcpNameLower)
            )) ||
            // Content mentions MCP
            (logEntry.content && logEntry.content.toLowerCase().includes(mcpNameLower)) ||
            // Tool results or responses
            (logEntry.tool_result && entryJson.includes(mcpNameLower)) ||
            // Message content
            (logEntry.message && entryJson.includes(mcpNameLower)) ||
            // Any field containing the MCP name
            entryJson.includes(mcpNameLower) ||
            // MCP server protocol references
            entryJson.includes('mcp') && entryJson.includes(mcpNameLower)
          ) {
            isRelevantEntry = true;
          }
          
          if (isRelevantEntry) {
            logs.push({
              timestamp: logEntry.timestamp || new Date().toISOString(),
              sessionId: fileName.split('.')[0],
              type: logEntry.type || logEntry.role || 'log_entry',
              content: logEntry,
              file: fileName,
              source: 'claude_session'
            });
            debugInfo.push(`Found relevant entry in ${fileName} for ${mcpName}`);
          }
        } catch (parseError) {
          // Skip invalid JSON lines but don't spam debug
        }
      }
    } catch (fileError) {
      debugInfo.push(`Error reading log file ${fileName}: ${fileError.message}`);
    }
  }
}

module.exports = ClaudeManager;