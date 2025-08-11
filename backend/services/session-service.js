const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const os = require('os');

class SessionService {
  constructor() {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.sessionTrackingFile = path.join(this.registryPath, 'session-tracking.json');
    this.claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
    this.sessionWatcher = null;
    this.sessionCountdownInterval = null;
    
    // Initialize session tracking state
    this.state = {
      enabled: false,
      currentSessionStart: null,
      billingDate: 1, // Default to 1st of the month
      monthlySessions: 0,
      lastScannedTimestamp: null,
      sessionHistory: []
    };
  }

  // Session timing utilities
  calculateSessionEndTime(sessionStartTime) {
    const startTime = new Date(sessionStartTime);
    
    // Find the next full hour after the session started
    const nextHour = new Date(startTime);
    nextHour.setHours(startTime.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    
    // Add 4 hours to the next full hour
    const sessionEnd = new Date(nextHour.getTime() + (4 * 60 * 60 * 1000));
    
    return sessionEnd.getTime();
  }

  isSessionActive(sessionStartTime, currentTime = Date.now()) {
    if (!sessionStartTime) return false;
    const sessionEndTime = this.calculateSessionEndTime(sessionStartTime);
    return currentTime <= sessionEndTime;
  }

  getSessionTimeRemaining(sessionStartTime, currentTime = Date.now()) {
    if (!sessionStartTime) return 0;
    const sessionEndTime = this.calculateSessionEndTime(sessionStartTime);
    return Math.max(0, sessionEndTime - currentTime);
  }

  async init() {
    await fs.ensureDir(this.registryPath);
    await this.loadSessionTracking();
    await this.setupSessionWatcher();
    
    // Update session tracking to get current state before starting countdown
    if (this.state.enabled) {
      await this.updateSessionTracking();
    }
  }

  // State Management
  async loadSessionTracking() {
    try {
      if (await fs.pathExists(this.sessionTrackingFile)) {
        const sessionData = await fs.readJson(this.sessionTrackingFile);
        this.state = { ...this.state, ...sessionData };
      }
    } catch (error) {
      console.error('Error loading session tracking:', error);
    }
  }

  async saveSessionTracking() {
    try {
      await fs.writeJson(this.sessionTrackingFile, this.state, { spaces: 2 });
    } catch (error) {
      console.error('Error saving session tracking:', error);
    }
  }

  // File Parsing
  async parseJSONLFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      const messages = [];
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            
            // Extract relevant data based on the structure
            let timestamp, role, content, usage = null;
            
            if (data.timestamp) {
              timestamp = new Date(data.timestamp).getTime();
            } else if (data.created_at) {
              timestamp = new Date(data.created_at).getTime();
            } else {
              // Try to extract from filename or use file mtime
              const stats = await fs.stat(filePath);
              timestamp = stats.mtime.getTime();
            }
            
            if (data.role) {
              role = data.role;
              content = data.content || '';
            } else if (data.message && data.message.role) {
              role = data.message.role;
              content = data.message.content || '';
            } else if (data.type) {
              // Handle cases where type is 'user' or 'assistant'
              role = data.type === 'user' ? 'user' : data.type === 'assistant' ? 'assistant' : data.type;
              content = data.message ? (data.message.content || '') : (data.content || '');
            } else {
              role = 'unknown';
              content = JSON.stringify(data);
            }
            
            // Check if this is a tool result message (should not count as user turn)
            if (role === 'user' && data.message && Array.isArray(data.message.content)) {
              const hasToolResult = data.message.content.some(item => 
                item && typeof item === 'object' && item.type === 'tool_result'
              );
              if (hasToolResult) {
                role = 'tool_result'; // Mark as tool result, not user message
              }
            }
            
            // Extract usage information if available
            if (data.usage) {
              usage = data.usage;
            } else if (data.message && data.message.usage) {
              usage = data.message.usage;
            }
            
            messages.push({
              timestamp,
              role,
              content,
              usage,
              file: filePath
            });
          } catch (parseError) {
            // Skip malformed JSON lines
            console.warn(`Skipping malformed JSON in ${filePath}:`, parseError.message);
          }
        }
      }
      
      return messages;
    } catch (error) {
      console.error(`Error parsing JSONL file ${filePath}:`, error);
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

  // Session Calculation
  calculateSessions(messages, billingDate) {
    if (!messages.length) return { sessions: [], count: 0 };
    
    const sessions = [];
    let currentSessionStart = null;
    let currentSessionData = null;
    
    // Calculate billing period start
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let billingPeriodStart;
    if (now.getDate() >= billingDate) {
      billingPeriodStart = new Date(currentYear, currentMonth, billingDate);
    } else {
      billingPeriodStart = new Date(currentYear, currentMonth - 1, billingDate);
    }
    
    // Filter messages to only include those in current billing period
    const billingMessages = messages.filter(msg => msg.timestamp >= billingPeriodStart.getTime());
    
    for (const message of billingMessages) {
      const messageTime = new Date(message.timestamp);
      
      // Start new session if:
      // 1. No current session
      // 2. Message falls outside current session window (next hour + 4 hours)
      if (!currentSessionStart || !this.isSessionActive(currentSessionStart.getTime(), messageTime.getTime())) {
        // Save previous session
        if (currentSessionData) {
          sessions.push(currentSessionData);
        }
        
        // Start new session
        currentSessionStart = messageTime;
        currentSessionData = {
          start: messageTime.getTime(),
          end: messageTime.getTime(),
          messageCount: 1,
          userTurns: 0, // Will be calculated based on user-assistant pairs
          userMessages: message.role === 'user' ? 1 : 0,
          assistantMessages: message.role === 'assistant' ? 1 : 0,
          tokens: message.usage ? 
            (message.usage.input_tokens || 0) + 
            (message.usage.output_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0) : 0,
          inputTokens: message.usage ? 
            (message.usage.input_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0) : 0,
          outputTokens: message.usage ? (message.usage.output_tokens || 0) : 0,
          files: new Set([message.file])
        };
      } else {
        // Extend current session
        currentSessionData.end = messageTime.getTime();
        currentSessionData.messageCount++;
        if (message.role === 'user') {
          currentSessionData.userMessages++;
        } else if (message.role === 'assistant') {
          currentSessionData.assistantMessages++;
        }
        if (message.usage) {
          currentSessionData.tokens += 
            (message.usage.input_tokens || 0) + 
            (message.usage.output_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0);
          currentSessionData.inputTokens += 
            (message.usage.input_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0);
          currentSessionData.outputTokens += (message.usage.output_tokens || 0);
        }
        currentSessionData.files.add(message.file);
      }
    }
    
    // Don't forget the last session
    if (currentSessionData) {
      sessions.push(currentSessionData);
    }
    
    // Calculate user turns and convert file sets to arrays for JSON serialization
    sessions.forEach(session => {
      // User turns = number of times the user initiated a conversation/question
      // Each user message represents one turn where the human asked something
      session.userTurns = session.userMessages || 0;
      session.files = Array.from(session.files);
    });
    
    return { sessions, count: sessions.length };
  }

  // Calculate sessions for lifetime stats (no billing period filtering)
  calculateSessionsLifetime(messages) {
    if (!messages.length) return { sessions: [], count: 0 };
    
    const sessions = [];
    let currentSessionStart = null;
    let currentSessionData = null;
    
    // Process ALL messages without billing period filtering
    for (const message of messages) {
      const messageTime = new Date(message.timestamp);
      
      // Start new session if message falls outside current session window
      if (!currentSessionStart || !this.isSessionActive(currentSessionStart.getTime(), messageTime.getTime())) {
        // Save previous session
        if (currentSessionData) {
          sessions.push(currentSessionData);
        }
        
        // Start new session
        currentSessionStart = messageTime;
        currentSessionData = {
          start: messageTime.getTime(),
          end: messageTime.getTime(),
          messageCount: 1,
          userTurns: 0,
          userMessages: message.role === 'user' ? 1 : 0,
          assistantMessages: message.role === 'assistant' ? 1 : 0,
          tokens: message.usage ? 
            (message.usage.input_tokens || 0) + 
            (message.usage.output_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0) : 0,
          inputTokens: message.usage ? 
            (message.usage.input_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0) : 0,
          outputTokens: message.usage ? (message.usage.output_tokens || 0) : 0,
          files: new Set([message.file])
        };
      } else {
        // Extend current session
        currentSessionData.end = messageTime.getTime();
        currentSessionData.messageCount++;
        if (message.role === 'user') {
          currentSessionData.userMessages++;
        } else if (message.role === 'assistant') {
          currentSessionData.assistantMessages++;
        }
        if (message.usage) {
          currentSessionData.tokens += 
            (message.usage.input_tokens || 0) + 
            (message.usage.output_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0);
          currentSessionData.inputTokens += 
            (message.usage.input_tokens || 0) + 
            (message.usage.cache_creation_input_tokens || 0) + 
            (message.usage.cache_read_input_tokens || 0);
          currentSessionData.outputTokens += (message.usage.output_tokens || 0);
        }
        currentSessionData.files.add(message.file);
      }
    }
    
    // Don't forget the last session
    if (currentSessionData) {
      sessions.push(currentSessionData);
    }
    
    // Calculate user turns and convert file sets to arrays for JSON serialization
    sessions.forEach(session => {
      session.userTurns = session.userMessages || 0;
      session.files = Array.from(session.files);
    });
    
    return { sessions, count: sessions.length };
  }

  // Session Statistics
  async getSessionStats() {
    const now = new Date();
    
    // Get all messages for lifetime calculations
    const messages = await this.scanAllJSONLFiles();
    
    // Calculate billing period start
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let currentPeriodStart;
    if (now.getDate() >= this.state.billingDate) {
      currentPeriodStart = new Date(currentYear, currentMonth, this.state.billingDate);
    } else {
      currentPeriodStart = new Date(currentYear, currentMonth - 1, this.state.billingDate);
    }

    // Calculate next period start
    let nextPeriodStart;
    if (now.getDate() >= this.state.billingDate) {
      nextPeriodStart = new Date(currentYear, currentMonth + 1, this.state.billingDate);
    } else {
      nextPeriodStart = new Date(currentYear, currentMonth, this.state.billingDate);
    }

    // Calculate days in current billing period and days elapsed
    const totalDaysInPeriod = Math.ceil((nextPeriodStart.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.ceil((now.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = totalDaysInPeriod - daysElapsed;

    // Calculate projected sessions based on current usage
    const sessionsPerDay = daysElapsed > 0 ? this.state.monthlySessions / daysElapsed : 0;
    const projectedSessions = Math.round(sessionsPerDay * totalDaysInPeriod);

    // Calculate sessions needed per day to reach exactly 50
    const sessionsRemaining = Math.max(0, 50 - this.state.monthlySessions);
    const sessionsPerDayNeeded = daysRemaining > 0 ? Math.ceil(sessionsRemaining / daysRemaining) : 0;

    // Calculate period totals (current billing period only)
    const currentPeriodSessions = (this.state.sessionHistory || []).filter(session => {
      const sessionDate = new Date(session.start);
      return sessionDate >= currentPeriodStart;
    });

    const periodTotals = currentPeriodSessions.reduce((totals, session) => {
      return {
        tokens: totals.tokens + (session.tokens || 0),
        inputTokens: totals.inputTokens + (session.inputTokens || 0),
        outputTokens: totals.outputTokens + (session.outputTokens || 0),
        userTurns: totals.userTurns + (session.userTurns || 0),
        messageCount: totals.messageCount + (session.messageCount || 0)
      };
    }, { tokens: 0, inputTokens: 0, outputTokens: 0, userTurns: 0, messageCount: 0 });

    // Calculate lifetime totals (all sessions ever, not just current billing period)
    // Use a very old billing date to ensure we get ALL sessions ever
    const { sessions: allTimeSessions } = this.calculateSessionsLifetime(messages);
    
    const lifetimeTotals = allTimeSessions.reduce((totals, session) => {
      return {
        tokens: totals.tokens + (session.tokens || 0),
        inputTokens: totals.inputTokens + (session.inputTokens || 0),
        outputTokens: totals.outputTokens + (session.outputTokens || 0),
        userTurns: totals.userTurns + (session.userTurns || 0),
        messageCount: totals.messageCount + (session.messageCount || 0),
        sessions: totals.sessions + 1
      };
    }, { tokens: 0, inputTokens: 0, outputTokens: 0, userTurns: 0, messageCount: 0, sessions: 0 });

    // Calculate costs (Claude API pricing for Sonnet 4 and Opus 4 - 2025)
    const sonnet4InputPrice = 3.00 / 1000000;  // $3.00 per million input tokens
    const sonnet4OutputPrice = 15.00 / 1000000; // $15.00 per million output tokens
    const opus4InputPrice = 15.00 / 1000000;   // $15.00 per million input tokens  
    const opus4OutputPrice = 75.00 / 1000000;  // $75.00 per million output tokens

    const lifetimeCosts = {
      sonnet4: (lifetimeTotals.inputTokens * sonnet4InputPrice) + (lifetimeTotals.outputTokens * sonnet4OutputPrice),
      opus4: (lifetimeTotals.inputTokens * opus4InputPrice) + (lifetimeTotals.outputTokens * opus4OutputPrice)
    };

    // Format session history for frontend with proper duration calculation
    const formattedHistory = (this.state.sessionHistory || []).map(session => {
      try {
        const startTime = session.start ? new Date(session.start) : new Date();
        const endTime = session.end ? new Date(session.end) : new Date();
        const duration = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / (60 * 60 * 1000) * 10) / 10);
        
        return {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          duration: duration,
          tokens: session.tokens || 0,
          inputTokens: session.inputTokens || 0,
          outputTokens: session.outputTokens || 0,
          userTurns: session.userTurns || 0,
          userMessages: session.userMessages || 0,
          assistantMessages: session.assistantMessages || 0,
          messageCount: session.messageCount || 0
        };
      } catch (error) {
        console.error('Error formatting session history entry:', error, session);
        return {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          duration: 0,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          userTurns: 0,
          userMessages: 0,
          assistantMessages: 0,
          messageCount: 0
        };
      }
    }).filter(session => session !== null);

    const stats = {
      enabled: this.state.enabled,
      currentPeriodStart: currentPeriodStart.toISOString(),
      nextPeriodStart: nextPeriodStart.toISOString(),
      billingDate: this.state.billingDate,
      monthlySessions: this.state.monthlySessions,
      sessionHistory: formattedHistory,
      timeRemaining: null,
      planLimits: {
        max: 50
      },
      estimatedCosts: {
        pro: { monthly: 20, perSession: 20 / 50 },
        maxFive: { monthly: 100, perSession: 100 / 50 },
        maxTwenty: { monthly: 400, perSession: 400 / 50 }
      },
      // New enhanced metrics
      periodMetrics: {
        totalDaysInPeriod,
        daysElapsed,
        daysRemaining,
        projectedSessions,
        sessionsPerDay: Math.round(sessionsPerDay * 10) / 10, // Round to 1 decimal
        sessionsRemaining,
        sessionsPerDayNeeded
      },
      // Period totals for current billing period
      periodTotals: {
        tokens: periodTotals.tokens,
        inputTokens: periodTotals.inputTokens, 
        outputTokens: periodTotals.outputTokens,
        userTurns: periodTotals.userTurns,
        messageCount: periodTotals.messageCount
      },
      // Lifetime statistics
      lifetimeStats: {
        totalSessions: lifetimeTotals.sessions,
        totalTokens: lifetimeTotals.tokens,
        totalInputTokens: lifetimeTotals.inputTokens,
        totalOutputTokens: lifetimeTotals.outputTokens,
        totalUserTurns: lifetimeTotals.userTurns,
        totalMessages: lifetimeTotals.messageCount,
        costs: {
          sonnet4: Math.round(lifetimeCosts.sonnet4 * 100) / 100, // Round to 2 decimal places
          opus4: Math.round(lifetimeCosts.opus4 * 100) / 100
        }
      }
    };

    // Calculate time remaining in current session if active
    if (this.state.enabled && this.state.currentSessionStart) {
      const remaining = this.getSessionTimeRemaining(this.state.currentSessionStart, now.getTime());
      
      stats.timeRemaining = {
        milliseconds: remaining,
        hours: Math.floor(remaining / (60 * 60 * 1000)),
        minutes: Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000)),
        seconds: Math.floor((remaining % (60 * 1000)) / 1000),
        expired: remaining === 0
      };
    }

    return stats;
  }

  // Session Updates
  async updateSessionTracking() {
    if (!this.state.enabled) return;

    try {
      const messages = await this.scanAllJSONLFiles();
      const { sessions, count } = this.calculateSessions(messages, this.state.billingDate);
      
      // Update state
      this.state.monthlySessions = count;
      this.state.sessionHistory = sessions;
      
      // Determine current session (find the most recent active session)
      const now = Date.now();
      let activeSession = null;
      
      for (const session of sessions) {
        if (this.isSessionActive(session.start, now)) {
          // Keep the most recent active session
          if (!activeSession || session.end > activeSession.end) {
            activeSession = session;
          }
        }
      }
      
      if (activeSession) {
        this.state.currentSessionStart = activeSession.start;
        if (!this.sessionCountdownInterval) {
          this.startSessionCountdown();
        }
      } else {
        this.state.currentSessionStart = null;
        if (this.sessionCountdownInterval) {
          clearInterval(this.sessionCountdownInterval);
          this.sessionCountdownInterval = null;
        }
      }
      
      // Set last scanned timestamp
      this.state.lastScannedTimestamp = now;
      
      await this.saveSessionTracking();
      
      // Session tracking updated - no longer broadcasting
      
    } catch (error) {
      console.error('Error updating session tracking:', error);
    }
  }

  // Real-time Countdown
  startSessionCountdown() {
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
    }
    
    this.sessionCountdownInterval = setInterval(() => {
      if (!this.state.enabled || !this.state.currentSessionStart) {
        clearInterval(this.sessionCountdownInterval);
        this.sessionCountdownInterval = null;
        return;
      }
      
      const now = Date.now();
      const sessionStart = this.state.currentSessionStart;
      const remaining = this.getSessionTimeRemaining(sessionStart, now);
      
      const countdown = {
        totalMs: remaining,
        hours: Math.floor(remaining / (60 * 60 * 1000)),
        minutes: Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000)),
        seconds: Math.floor((remaining % (60 * 1000)) / 1000),
        expired: remaining === 0
      };
      
      // Countdown updated - no longer broadcasting
      
      // Clean up if expired
      if (remaining === 0) {
        this.state.currentSessionStart = null;
        clearInterval(this.sessionCountdownInterval);
        this.sessionCountdownInterval = null;
        this.saveSessionTracking();
        
        // Session ended - no longer broadcasting
      }
    }, 1000);
  }

  // File System Monitoring
  async setupSessionWatcher() {
    if (!await fs.pathExists(this.claudeProjectsPath)) {
      return;
    }

    // Optimize: Skip watcher setup to avoid performance issues with large directories
    console.log('Session watcher disabled to prevent blocking on large ~/.claude/projects directory');
    return;

    // Clean up existing watcher
    if (this.sessionWatcher) {
      await this.sessionWatcher.close();
    }

    // Watch for changes in Claude projects directory
    this.sessionWatcher = chokidar.watch(this.claudeProjectsPath, {
      ignored: /node_modules/,
      persistent: true,
      ignoreInitial: true,
      depth: 3
    });

    let updateTimeout;
    let lastUpdate = 0;
    
    const scheduleUpdate = () => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(async () => {
        const now = Date.now();
        // Rate limit updates to no more than once every 5 seconds
        if (now - lastUpdate < 5000) {
          return;
        }
        lastUpdate = now;
        console.log('Session files changed, updating tracking...');
        await this.updateSessionTracking();
      }, 5000); // Increased debounce to 5 seconds
    };

    this.sessionWatcher
      .on('add', (filePath) => {
        if (filePath.endsWith('.jsonl')) {
          scheduleUpdate();
        }
      })
      .on('change', (filePath) => {
        if (filePath.endsWith('.jsonl')) {
          scheduleUpdate();
        }
      })
      .on('error', error => console.error('Session watcher error:', error));
  }

  // State Control
  async toggleTracking(enabled) {
    this.state.enabled = enabled;
    
    if (enabled) {
      await this.updateSessionTracking();
    } else {
      // Clear active session and stop countdown
      this.state.currentSessionStart = null;
      if (this.sessionCountdownInterval) {
        clearInterval(this.sessionCountdownInterval);
        this.sessionCountdownInterval = null;
      }
    }
    
    await this.saveSessionTracking();
    return this.state;
  }

  async setBillingDate(date) {
    this.state.billingDate = date;
    await this.saveSessionTracking();
    
    if (this.state.enabled) {
      await this.updateSessionTracking();
    }
    
    return this.state;
  }

  // Getters
  getState() {
    return { ...this.state };
  }

  isEnabled() {
    return this.state.enabled;
  }

  async getCurrentSession() {
    // If no current session or current session is expired, try to refresh first
    if (!this.state.currentSessionStart || !this.isSessionActive(this.state.currentSessionStart)) {
      await this.updateSessionTracking();
    }
    
    if (!this.state.currentSessionStart) return null;
    
    const now = Date.now();
    const sessionStart = this.state.currentSessionStart;
    
    if (!this.isSessionActive(sessionStart, now)) return null;
    
    return {
      start: sessionStart,
      remaining: this.getSessionTimeRemaining(sessionStart, now)
    };
  }

  // Cleanup
  async shutdown() {
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
      this.sessionCountdownInterval = null;
    }
    
    if (this.sessionWatcher) {
      await this.sessionWatcher.close();
      this.sessionWatcher = null;
    }
  }
}

module.exports = SessionService;