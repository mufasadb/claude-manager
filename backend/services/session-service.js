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
            } else {
              role = 'unknown';
              content = JSON.stringify(data);
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
      // 2. More than 5 hours since last activity
      if (!currentSessionStart || (messageTime.getTime() - currentSessionStart.getTime()) > (5 * 60 * 60 * 1000)) {
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
          tokens: message.usage ? (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0) : 0,
          files: new Set([message.file])
        };
      } else {
        // Extend current session
        currentSessionData.end = messageTime.getTime();
        currentSessionData.messageCount++;
        if (message.usage) {
          currentSessionData.tokens += (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0);
        }
        currentSessionData.files.add(message.file);
      }
    }
    
    // Don't forget the last session
    if (currentSessionData) {
      sessions.push(currentSessionData);
    }
    
    // Convert file sets to arrays for JSON serialization
    sessions.forEach(session => {
      session.files = Array.from(session.files);
    });
    
    return { sessions, count: sessions.length };
  }

  // Session Statistics
  getSessionStats() {
    const now = new Date();
    const stats = {
      enabled: this.state.enabled,
      currentSessionStart: this.state.currentSessionStart,
      billingDate: this.state.billingDate,
      monthlySessions: this.state.monthlySessions,
      sessionHistory: this.state.sessionHistory || [],
      timeRemaining: null,
      planLimits: {
        pro: 45,
        'max-5x': 225,
        'max-20x': 900
      },
      estimatedCosts: {
        pro: { monthly: 20, perSession: 20 / 45 },
        'max-5x': { monthly: 100, perSession: 100 / 225 },
        'max-20x': { monthly: 400, perSession: 400 / 900 }
      }
    };

    // Calculate time remaining in current session if active
    if (this.state.enabled && this.state.currentSessionStart) {
      const sessionStart = new Date(this.state.currentSessionStart);
      const sessionEnd = new Date(sessionStart.getTime() + (5 * 60 * 60 * 1000)); // 5 hours
      const remaining = Math.max(0, sessionEnd.getTime() - now.getTime());
      
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
        const sessionEnd = session.end + (5 * 60 * 60 * 1000); // 5 hours after last activity
        if (now <= sessionEnd) {
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
      const sessionEnd = sessionStart + (5 * 60 * 60 * 1000); // 5 hours
      const remaining = Math.max(0, sessionEnd - now);
      
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
    if (!this.state.currentSessionStart || (Date.now() > (this.state.currentSessionStart + (5 * 60 * 60 * 1000)))) {
      await this.updateSessionTracking();
    }
    
    if (!this.state.currentSessionStart) return null;
    
    const now = Date.now();
    const sessionStart = this.state.currentSessionStart;
    const sessionEnd = sessionStart + (5 * 60 * 60 * 1000);
    
    if (now > sessionEnd) return null;
    
    return {
      start: sessionStart,
      remaining: sessionEnd - now
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