const EventEmitter = require('events');
const HookExecutor = require('./operations/hook-executor');
const FileBasedHookLoader = require('./file-based-hook-loader');
const HookLogManager = require('./data/hook-log-manager');

class HookEventService extends EventEmitter {
  constructor(hookRegistry, projectService, userEnvVars = {}) {
    super();
    
    // Keep old registry for backward compatibility during transition
    this.hookRegistry = hookRegistry;
    this.projectService = projectService;
    this.hookExecutor = new HookExecutor(userEnvVars);
    
    // Initialize hook log manager
    this.hookLogManager = new HookLogManager();
    this.hookLogManager.init().catch(error => {
      console.error('Failed to initialize hook log manager in event service:', error);
    });
    
    // Initialize new file-based hook loader
    this.fileBasedHooks = new FileBasedHookLoader();
    this.useFileBasedHooks = true; // Flag to switch between systems
    
    // Event processing queue
    this.eventQueue = [];
    this.processing = false;
    
    // Statistics
    this.stats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      hooksExecuted: 0,
      errors: 0,
      lastEventTime: null
    };
    
    // Setup event processing
    this.setupEventProcessing();
    
    // Initialize file-based hooks
    this.initFileBasedHooks();
  }
  
  async initFileBasedHooks() {
    try {
      await this.fileBasedHooks.init();
      console.log('File-based hook system initialized');
    } catch (error) {
      console.error('Error initializing file-based hooks:', error);
      this.useFileBasedHooks = false; // Fall back to registry system
    }
  }

  // Setup automatic event processing
  setupEventProcessing() {
    // Process events every 100ms
    setInterval(() => {
      if (!this.processing && this.eventQueue.length > 0) {
        this.processNextEvent();
      }
    }, 100);
  }

  // Receive a hook event from Claude Code
  async receiveHookEvent(eventData) {
    try {
      // Validate event data
      const validatedEvent = this.validateEventData(eventData);
      
      // For PreToolUse events, process synchronously to potentially block
      if (validatedEvent.eventType === 'PreToolUse') {
        const event = {
          ...validatedEvent,
          receivedAt: Date.now(),
          id: this.generateEventId()
        };
        
        try {
          // Process hooks synchronously for blocking capability
          const result = await this.processEvent(event);
          
          this.stats.eventsReceived++;
          this.stats.lastEventTime = Date.now();
          
          // Emit event for real-time listeners
          this.emit('eventReceived', event);
          
          // Return result that can block tool execution
          return {
            success: true,
            eventId: event.id,
            continue: result.continue !== false, // Default to true unless explicitly blocked
            stopReason: result.stopReason || null,
            hookResults: result.hookResults || []
          };
          
        } catch (hookError) {
          console.error('Error processing PreToolUse hooks:', hookError);
          // On hook processing error, allow execution to continue
          return {
            success: true,
            eventId: event.id,
            continue: true,
            error: hookError.message
          };
        }
      } else {
        // For other event types, use async processing as before
        const event = {
          ...validatedEvent,
          receivedAt: Date.now(),
          id: this.generateEventId()
        };
        
        // Add to processing queue
        this.eventQueue.push(event);
        
        this.stats.eventsReceived++;
        this.stats.lastEventTime = Date.now();
        
        // Emit event for real-time listeners
        this.emit('eventReceived', event);
        
        return {
          success: true,
          eventId: event.id,
          continue: true, // Always continue for non-PreToolUse events
          queuePosition: this.eventQueue.length
        };
      }
      
    } catch (error) {
      console.error('Error receiving hook event:', error);
      this.stats.errors++;
      
      return {
        success: false,
        error: error.message,
        continue: true // Allow execution on validation errors
      };
    }
  }

  // Process the next event in the queue
  async processNextEvent() {
    if (this.processing || this.eventQueue.length === 0) {
      return;
    }

    this.processing = true;
    const event = this.eventQueue.shift();

    try {
      await this.processEvent(event);
      this.stats.eventsProcessed++;
    } catch (error) {
      console.error('Error processing event:', error);
      this.stats.errors++;
      this.emit('eventError', { event, error: error.message });
    } finally {
      this.processing = false;
    }
  }

  // Process a single hook event
  async processEvent(event) {
    const startTime = Date.now();
    
    try {
      // Find matching hooks using the appropriate system
      const matchingHooks = this.useFileBasedHooks 
        ? this.fileBasedHooks.getMatchingHooks(event.eventType, event.toolName, event.filePaths)
        : this.hookRegistry.getMatchingHooks(event.eventType, event.toolName, event.filePaths);

      if (matchingHooks.length === 0) {
        this.emit('eventProcessed', {
          event,
          hooksExecuted: 0,
          processingTime: Date.now() - startTime
        });
        return {
          continue: true,
          hookResults: [],
          hooksExecuted: 0
        };
      }

      // Get project information if needed
      const projectInfo = await this.getProjectInfoForEvent(event);

      // Execute matching hooks
      const results = [];
      let shouldBlock = false;
      let blockReason = null;
      
      for (const hook of matchingHooks) {
        try {
          const result = await this.hookExecutor.executeHook(hook, event, projectInfo);
          results.push(result);
          this.stats.hooksExecuted++;
          
          // Check if this hook wants to block execution
          if (result.result && result.result.continue === false) {
            shouldBlock = true;
            blockReason = result.result.stopReason || 'Hook blocked execution';
          }
          
          // Emit individual hook results
          this.emit('hookExecuted', { hook, event, result });
          
          // Emit hook log event for real-time updates
          this.emit('hookLogUpdated', {
            type: 'execution_result',
            hookId: hook.id,
            hookName: hook.name,
            result,
            timestamp: Date.now()
          });
          
        } catch (error) {
          const errorResult = {
            success: false,
            hookId: hook.id,
            hookName: hook.name,
            error: error.message,
            timestamp: Date.now()
          };
          
          results.push(errorResult);
          this.stats.errors++;
          this.emit('hookError', { hook, event, error: error.message });
          
          // Emit hook log event for errors
          this.emit('hookLogUpdated', {
            type: 'execution_error',
            hookId: hook.id,
            hookName: hook.name,
            error: error.message,
            timestamp: Date.now()
          });
        }
      }

      // Emit completion event
      this.emit('eventProcessed', {
        event,
        results,
        hooksExecuted: results.length,
        processingTime: Date.now() - startTime
      });

      // Return blocking response if any hook requested it
      return {
        continue: !shouldBlock,
        stopReason: blockReason,
        hookResults: results,
        hooksExecuted: results.length
      };

    } catch (error) {
      console.error('Error in event processing:', error);
      this.emit('eventError', { event, error: error.message });
      
      // On error, allow execution to continue
      return {
        continue: true,
        hookResults: [],
        error: error.message
      };
    }
  }

  // Validate incoming event data
  validateEventData(eventData) {
    if (!eventData || typeof eventData !== 'object') {
      throw new Error('Event data must be an object');
    }

    const requiredFields = ['eventType'];
    for (const field of requiredFields) {
      if (!eventData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate event type (temporarily allow "Unknown" for debugging)
    const validEventTypes = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop', 'UserPromptSubmit', 'Unknown'];
    if (!validEventTypes.includes(eventData.eventType)) {
      throw new Error(`Invalid event type: ${eventData.eventType}`);
    }

    // DEBUG: Log Unknown event types to understand the issue
    if (eventData.eventType === 'Unknown') {
      console.log('🔍 DEBUG: Unknown event received:', JSON.stringify({
        originalData: eventData.originalHookData,
        toolName: eventData.toolName,
        eventType: eventData.eventType
      }, null, 2));
    }

    // Extract command details from original hook data for enhanced hook processing
    const originalHookData = eventData.originalHookData || {};
    const commandDetails = this.extractCommandDetails(originalHookData, eventData.toolName);

    return {
      eventType: eventData.eventType,
      toolName: eventData.toolName || null,
      filePaths: Array.isArray(eventData.filePaths) ? eventData.filePaths : [],
      context: eventData.context || {},
      timestamp: eventData.timestamp || Date.now(),
      projectPath: eventData.projectPath || null,
      sessionId: eventData.sessionId || null,
      originalHookData: originalHookData,
      commandDetails: commandDetails
    };
  }

  // Extract command details from original Claude Code hook data
  extractCommandDetails(originalHookData, toolName) {
    if (!originalHookData || typeof originalHookData !== 'object') {
      return {};
    }

    const details = {
      toolName: toolName,
      fullCommand: null,
      commandArgs: [],
      detectedPatterns: []
    };

    try {
      // For Bash tools, extract the actual command
      const bashCommand = originalHookData.tool_input?.command || originalHookData.command;
      if (toolName === 'Bash' && bashCommand) {
        details.fullCommand = bashCommand;
        
        // Split command into parts for analysis
        const commandParts = bashCommand.split(/\s+/);
        details.commandArgs = commandParts;
        
        // Detect common patterns for hook decision making
        if (commandParts.length > 0) {
          const baseCommand = commandParts[0];
          
          // Detect npm commands
          if (baseCommand === 'npm' || baseCommand.includes('npm')) {
            details.detectedPatterns.push('npm_command');
            details.npmSubCommand = commandParts[1] || '';
          }
          
          // Detect yarn commands  
          if (baseCommand === 'yarn' || baseCommand.includes('yarn')) {
            details.detectedPatterns.push('yarn_command');
            details.yarnSubCommand = commandParts[1] || '';
          }
          
          // Detect bun commands
          if (baseCommand === 'bun' || baseCommand.includes('bun')) {
            details.detectedPatterns.push('bun_command');
            details.bunSubCommand = commandParts[1] || '';
          }
          
          // Detect potentially dangerous commands
          const dangerousPatterns = ['rm -rf', 'sudo rm', 'chmod 777', '> /etc/'];
          for (const pattern of dangerousPatterns) {
            if (details.fullCommand.includes(pattern)) {
              details.detectedPatterns.push('dangerous_command');
              break;
            }
          }
          
          // Detect git commands
          if (baseCommand === 'git') {
            details.detectedPatterns.push('git_command');
            details.gitSubCommand = commandParts[1] || '';
          }
        }
      }
      
      // For Write/Edit tools, extract file information
      else if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
        if (originalHookData.file_path) {
          details.targetFile = originalHookData.file_path;
          const ext = details.targetFile.split('.').pop()?.toLowerCase();
          if (ext) {
            details.detectedPatterns.push(`${ext}_file`);
          }
        }
        
        if (originalHookData.content) {
          // Check for sensitive patterns in file content
          const sensitivePatterns = [
            /sk-[a-zA-Z0-9]{48}/, // OpenAI API keys
            /ghp_[a-zA-Z0-9]{36}/, // GitHub tokens
            /AKIA[0-9A-Z]{16}/, // AWS access keys
          ];
          
          for (const pattern of sensitivePatterns) {
            if (pattern.test(originalHookData.content)) {
              details.detectedPatterns.push('sensitive_content');
              break;
            }
          }
        }
      }
      
      // Add original hook data for advanced hook processing
      details.originalData = originalHookData;
      
    } catch (error) {
      console.error('Error extracting command details:', error);
    }

    return details;
  }

  // Get project information for an event
  async getProjectInfoForEvent(event) {
    if (!event.projectPath) {
      return null;
    }

    try {
      // Find project by path
      const projects = this.projectService.getProjects();
      const projectEntry = Object.entries(projects).find(([name, project]) => 
        project.path === event.projectPath
      );

      if (!projectEntry) {
        return null;
      }

      const [projectName, projectData] = projectEntry;
      
      return {
        name: projectName,
        path: projectData.path,
        config: projectData.config || {}
      };
      
    } catch (error) {
      console.error('Error getting project info for event:', error);
      return null;
    }
  }

  // Generate unique event ID
  generateEventId() {
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Manual event processing for testing
  async processEventManually(eventData) {
    const event = {
      ...this.validateEventData(eventData),
      receivedAt: Date.now(),
      id: this.generateEventId()
    };

    return await this.processEvent(event);
  }

  // Register project with file-based hook system
  async registerProject(projectName, projectPath) {
    if (this.useFileBasedHooks) {
      await this.fileBasedHooks.loadProjectHooks(projectName, projectPath);
      await this.fileBasedHooks.setupProjectWatching(projectName, projectPath);
    }
  }
  
  // Unregister project from file-based hook system
  async unregisterProject(projectName, projectPath) {
    if (this.useFileBasedHooks) {
      await this.fileBasedHooks.unregisterProject(projectPath);
    }
  }
  
  // Test hook execution with mock event
  async testHook(hookId, scope, projectName, mockEventData = {}) {
    let hook;
    
    if (this.useFileBasedHooks) {
      // For file-based hooks, hookId is the filename
      const projectPath = this.projectService.getProject(projectName)?.path;
      hook = this.fileBasedHooks.getHook(scope, projectPath, hookId);
    } else {
      hook = this.hookRegistry.getHook(scope, projectName, hookId);
    }
    
    if (!hook) {
      throw new Error('Hook not found');
    }

    const testEvent = {
      eventType: mockEventData.eventType || 'test',
      toolName: mockEventData.toolName || 'test-tool',
      filePaths: mockEventData.filePaths || ['/test/file.js'],
      context: mockEventData.context || {},
      timestamp: Date.now()
    };

    const projectInfo = projectName ? {
      name: projectName,
      path: this.projectService.getProject(projectName)?.path || '/test/project',
      config: {}
    } : null;

    return await this.hookExecutor.executeHook(hook, testEvent, projectInfo);
  }

  // Get event processing statistics
  getStats() {
    const baseStats = {
      ...this.stats,
      queueLength: this.eventQueue.length,
      processing: this.processing,
      uptime: Date.now() - (this.startTime || Date.now()),
      useFileBasedHooks: this.useFileBasedHooks
    };
    
    if (this.useFileBasedHooks) {
      return {
        ...baseStats,
        hookStats: this.fileBasedHooks.getStats()
      };
    }
    
    return baseStats;
  }

  // Hook log access methods
  async getRecentHookLogs(limit = 50) {
    try {
      return this.hookLogManager.getRecentLogs(limit);
    } catch (error) {
      console.error('Error getting recent hook logs:', error);
      return [];
    }
  }

  async getHookLogsByHookId(hookId, limit = 100) {
    try {
      return this.hookLogManager.getLogsByHookId(hookId, limit);
    } catch (error) {
      console.error('Error getting hook logs by ID:', error);
      return [];
    }
  }

  async getHookLogStats() {
    try {
      return this.hookLogManager.getLogStats();
    } catch (error) {
      console.error('Error getting hook log stats:', error);
      return {
        totalLogs: 0,
        levelCounts: {},
        typeCounts: {},
        hookCounts: {},
        recentActivity: {}
      };
    }
  }

  async searchHookLogs(searchTerm, limit = 100) {
    try {
      return this.hookLogManager.searchLogs(searchTerm, limit);
    } catch (error) {
      console.error('Error searching hook logs:', error);
      return [];
    }
  }

  // Clear event queue
  clearQueue() {
    const clearedCount = this.eventQueue.length;
    this.eventQueue = [];
    return clearedCount;
  }

  // Update environment variables for hook executor
  updateEnvVars(newEnvVars) {
    this.hookExecutor.updateEnvVars(newEnvVars);
  }

  // Get recent events (for debugging/monitoring)
  getRecentEvents(limit = 10) {
    return this.eventQueue.slice(-limit);
  }

  // Force process all queued events
  async processAllEvents() {
    const results = [];
    
    while (this.eventQueue.length > 0 && !this.processing) {
      const result = await this.processNextEvent();
      results.push(result);
    }
    
    return results;
  }

  // Webhook endpoint handler
  createWebhookHandler() {
    return async (req, res) => {
      try {
        // Validate webhook authenticity (basic check)
        const userAgent = req.headers['user-agent'];
        if (!userAgent || !userAgent.includes('Claude')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Process the hook event
        const result = await this.receiveHookEvent(req.body);
        
        res.json(result);
      } catch (error) {
        console.error('Webhook handler error:', error);
        res.status(500).json({ error: error.message });
      }
    };
  }

  // WebSocket event handler
  handleWebSocketEvent(ws, eventData) {
    this.receiveHookEvent(eventData)
      .then(result => {
        ws.send(JSON.stringify({
          type: 'hookEventResult',
          data: result
        }));
      })
      .catch(error => {
        ws.send(JSON.stringify({
          type: 'hookEventError',
          error: error.message
        }));
      });
  }

  // Cleanup resources
  async cleanup() {
    this.removeAllListeners();
    this.eventQueue = [];
    this.processing = false;
    
    if (this.useFileBasedHooks && this.fileBasedHooks) {
      await this.fileBasedHooks.cleanup();
    }
  }
}

module.exports = HookEventService;