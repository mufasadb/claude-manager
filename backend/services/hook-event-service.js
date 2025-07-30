const EventEmitter = require('events');
const HookExecutor = require('./operations/hook-executor');

class HookEventService extends EventEmitter {
  constructor(hookRegistry, projectService, userEnvVars = {}) {
    super();
    
    this.hookRegistry = hookRegistry;
    this.projectService = projectService;
    this.hookExecutor = new HookExecutor(userEnvVars);
    
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
      
      // Add to processing queue
      this.eventQueue.push({
        ...validatedEvent,
        receivedAt: Date.now(),
        id: this.generateEventId()
      });
      
      this.stats.eventsReceived++;
      this.stats.lastEventTime = Date.now();
      
      // Emit event for real-time listeners
      this.emit('eventReceived', validatedEvent);
      
      return {
        success: true,
        eventId: validatedEvent.id,
        queuePosition: this.eventQueue.length
      };
      
    } catch (error) {
      console.error('Error receiving hook event:', error);
      this.stats.errors++;
      
      return {
        success: false,
        error: error.message
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
      // Find matching hooks
      const matchingHooks = this.hookRegistry.getMatchingHooks(
        event.eventType,
        event.toolName,
        event.filePaths
      );

      if (matchingHooks.length === 0) {
        this.emit('eventProcessed', {
          event,
          hooksExecuted: 0,
          processingTime: Date.now() - startTime
        });
        return;
      }

      // Get project information if needed
      const projectInfo = await this.getProjectInfoForEvent(event);

      // Execute matching hooks
      const results = [];
      for (const hook of matchingHooks) {
        try {
          const result = await this.hookExecutor.executeHook(hook, event, projectInfo);
          results.push(result);
          this.stats.hooksExecuted++;
          
          // Emit individual hook results
          this.emit('hookExecuted', { hook, event, result });
          
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
        }
      }

      // Emit completion event
      this.emit('eventProcessed', {
        event,
        results,
        hooksExecuted: results.length,
        processingTime: Date.now() - startTime
      });

    } catch (error) {
      console.error('Error in event processing:', error);
      this.emit('eventError', { event, error: error.message });
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

    // Validate event type
    const validEventTypes = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop'];
    if (!validEventTypes.includes(eventData.eventType)) {
      throw new Error(`Invalid event type: ${eventData.eventType}`);
    }

    return {
      eventType: eventData.eventType,
      toolName: eventData.toolName || null,
      filePaths: Array.isArray(eventData.filePaths) ? eventData.filePaths : [],
      context: eventData.context || {},
      timestamp: eventData.timestamp || Date.now(),
      projectPath: eventData.projectPath || null,
      sessionId: eventData.sessionId || null
    };
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

  // Test hook execution with mock event
  async testHook(hookId, scope, projectName, mockEventData = {}) {
    const hook = this.hookRegistry.getHook(scope, projectName, hookId);
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
    return {
      ...this.stats,
      queueLength: this.eventQueue.length,
      processing: this.processing,
      uptime: Date.now() - (this.startTime || Date.now())
    };
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
  cleanup() {
    this.removeAllListeners();
    this.eventQueue = [];
    this.processing = false;
  }
}

module.exports = HookEventService;