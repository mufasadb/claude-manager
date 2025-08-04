const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const os = require('os');

class SessionCalculator {
  constructor() {
    this.claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
    this.sessionWatcher = null;
    this.sessionCountdownInterval = null;
    this.onSessionUpdate = null;
    this.onSessionCountdown = null;
  }

  // File parsing operations
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
            
            // Debug logging for token extraction
            if (usage && (usage.input_tokens > 0 || usage.output_tokens > 0)) {
              console.log(`Token data found: role=${role}, input=${usage.input_tokens || 0}, output=${usage.output_tokens || 0}, cache_creation=${usage.cache_creation_input_tokens || 0}, cache_read=${usage.cache_read_input_tokens || 0}`);
            }
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

  // Session calculation
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

  // Active session detection
  findActiveSession(sessions) {
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
    
    return activeSession;
  }

  // Countdown operations
  calculateCountdown(sessionStart) {
    if (!sessionStart) return null;

    const now = Date.now();
    const sessionEnd = sessionStart + (5 * 60 * 60 * 1000); // 5 hours
    const remaining = Math.max(0, sessionEnd - now);

    return {
      totalMs: remaining,
      hours: Math.floor(remaining / (60 * 60 * 1000)),
      minutes: Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000)),
      seconds: Math.floor((remaining % (60 * 1000)) / 1000),
      expired: remaining === 0
    };
  }

  startCountdown(sessionStart, onUpdate) {
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
    }
    
    this.sessionCountdownInterval = setInterval(() => {
      const countdown = this.calculateCountdown(sessionStart);
      
      if (!countdown || countdown.expired) {
        this.stopCountdown();
        if (onUpdate) onUpdate(null, true); // expired = true
        return;
      }
      
      if (onUpdate) onUpdate(countdown, false);
    }, 1000);
  }

  stopCountdown() {
    if (this.sessionCountdownInterval) {
      clearInterval(this.sessionCountdownInterval);
      this.sessionCountdownInterval = null;
    }
  }

  // File system monitoring
  async setupSessionWatcher(onUpdate) {
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
        console.log('Session files changed, triggering update...');
        if (onUpdate) onUpdate();
      }, 5000); // 5 second debounce
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

  // Session analysis
  analyzeSessionHistory(sessions) {
    if (!sessions.length) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        totalTokens: 0,
        averageSessionLength: 0,
        longestSession: null,
        shortestSession: null
      };
    }

    const totalMessages = sessions.reduce((sum, session) => sum + session.messageCount, 0);
    const totalTokens = sessions.reduce((sum, session) => sum + session.tokens, 0);
    
    const sessionLengths = sessions.map(session => session.end - session.start);
    const averageSessionLength = sessionLengths.reduce((sum, length) => sum + length, 0) / sessions.length;
    
    const longestSession = sessions.reduce((longest, session) => {
      const sessionLength = session.end - session.start;
      const longestLength = longest ? (longest.end - longest.start) : 0;
      return sessionLength > longestLength ? session : longest;
    }, null);
    
    const shortestSession = sessions.reduce((shortest, session) => {
      const sessionLength = session.end - session.start;
      const shortestLength = shortest ? (shortest.end - shortest.start) : Infinity;
      return sessionLength < shortestLength ? session : shortest;
    }, null);

    return {
      totalSessions: sessions.length,
      totalMessages,
      totalTokens,
      averageSessionLength,
      longestSession,
      shortestSession
    };
  }

  // Cleanup
  async shutdown() {
    this.stopCountdown();
    
    if (this.sessionWatcher) {
      await this.sessionWatcher.close();
      this.sessionWatcher = null;
    }
  }
}

module.exports = SessionCalculator;