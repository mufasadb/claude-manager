const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class HookLogManager {
  constructor() {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.logFile = path.join(this.registryPath, 'hook-logs.json');
    this.maxLogEntries = 1000; // Keep last 1000 log entries
    this.rotateThreshold = 1200; // Rotate when we exceed this
    
    this.logs = [];
  }

  async init() {
    await fs.ensureDir(this.registryPath);
    await this.load();
  }

  async load() {
    try {
      if (await fs.pathExists(this.logFile)) {
        const logData = await fs.readJson(this.logFile);
        this.logs = Array.isArray(logData.logs) ? logData.logs : [];
        
        // Ensure logs don't exceed max entries on load
        if (this.logs.length > this.maxLogEntries) {
          this.logs = this.logs.slice(-this.maxLogEntries);
          await this.save();
        }
      }
    } catch (error) {
      console.error('Error loading hook logs:', error);
      this.logs = [];
    }
  }

  async save() {
    try {
      const logData = {
        logs: this.logs,
        metadata: {
          lastUpdated: Date.now(),
          totalEntries: this.logs.length,
          maxEntries: this.maxLogEntries
        }
      };
      
      await fs.writeJson(this.logFile, logData, { spaces: 2 });
    } catch (error) {
      console.error('Error saving hook logs:', error);
    }
  }

  // Add a new log entry
  async addLog(logEntry) {
    const entry = {
      id: this.generateLogId(),
      timestamp: Date.now(),
      ...logEntry
    };

    this.logs.push(entry);

    // Rotate logs if we exceed threshold
    if (this.logs.length > this.rotateThreshold) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }

    await this.save();
    return entry;
  }

  // Log hook execution start
  async logHookExecution(hookId, hookName, eventType, eventData, level = 'info') {
    return await this.addLog({
      type: 'execution',
      hookId,
      hookName,
      eventType,
      level,
      message: `Hook execution started`,
      context: {
        toolName: eventData.toolName,
        filePaths: eventData.filePaths,
        projectPath: eventData.projectPath
      }
    });
  }

  // Log hook execution result
  async logHookResult(hookId, hookName, result) {
    return await this.addLog({
      type: 'result',
      hookId,
      hookName,
      level: result.success ? 'info' : 'error',
      message: result.success ? 'Hook executed successfully' : `Hook execution failed: ${result.error}`,
      context: {
        success: result.success,
        executionTime: result.executionTime,
        error: result.error,
        result: result.result
      }
    });
  }

  // Log general hook message (from hook code itself)
  async logHookMessage(hookId, hookName, level, message, context = {}) {
    return await this.addLog({
      type: 'message',
      hookId,
      hookName,
      level,
      message,
      context
    });
  }

  // Query methods
  getRecentLogs(limit = 50) {
    return this.logs.slice(-limit).reverse(); // Most recent first
  }

  getLogsByHookId(hookId, limit = 100) {
    return this.logs
      .filter(log => log.hookId === hookId)
      .slice(-limit)
      .reverse();
  }

  getLogsByTimeRange(startTime, endTime) {
    return this.logs
      .filter(log => log.timestamp >= startTime && log.timestamp <= endTime)
      .reverse();
  }

  getLogsByLevel(level, limit = 100) {
    return this.logs
      .filter(log => log.level === level)
      .slice(-limit)
      .reverse();
  }

  getLogsByEventType(eventType, limit = 100) {
    return this.logs
      .filter(log => log.eventType === eventType)
      .slice(-limit)
      .reverse();
  }

  // Statistics
  getLogStats() {
    const stats = {
      totalLogs: this.logs.length,
      maxEntries: this.maxLogEntries,
      levelCounts: {},
      typeCounts: {},
      hookCounts: {},
      recentActivity: {}
    };

    // Count by level
    this.logs.forEach(log => {
      stats.levelCounts[log.level] = (stats.levelCounts[log.level] || 0) + 1;
      stats.typeCounts[log.type] = (stats.typeCounts[log.type] || 0) + 1;
      stats.hookCounts[log.hookId] = (stats.hookCounts[log.hookId] || 0) + 1;
    });

    // Recent activity (last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentLogs = this.logs.filter(log => log.timestamp >= oneDayAgo);
    
    stats.recentActivity = {
      total: recentLogs.length,
      errors: recentLogs.filter(log => log.level === 'error').length,
      warnings: recentLogs.filter(log => log.level === 'warn').length,
      executions: recentLogs.filter(log => log.type === 'execution').length
    };

    return stats;
  }

  // Cleanup old logs beyond retention period
  async cleanupOldLogs(retentionDays = 30) {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const originalCount = this.logs.length;
    
    this.logs = this.logs.filter(log => log.timestamp >= cutoffTime);
    
    if (this.logs.length !== originalCount) {
      await this.save();
      return originalCount - this.logs.length;
    }
    
    return 0;
  }

  // Export logs for analysis
  async exportLogs(format = 'json') {
    const exportData = {
      exported: new Date().toISOString(),
      totalLogs: this.logs.length,
      logs: this.logs,
      stats: this.getLogStats()
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    }
    
    // CSV format
    if (format === 'csv') {
      const csvHeaders = 'timestamp,id,type,hookId,hookName,level,message,eventType\n';
      const csvRows = this.logs.map(log => {
        const timestamp = new Date(log.timestamp).toISOString();
        const message = `"${(log.message || '').replace(/"/g, '""')}"`;
        return `${timestamp},${log.id},${log.type},${log.hookId},${log.hookName},${log.level},${message},${log.eventType || ''}`;
      }).join('\n');
      
      return csvHeaders + csvRows;
    }

    return exportData;
  }

  // Generate unique log ID
  generateLogId() {
    return 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Clear all logs
  async clearLogs() {
    this.logs = [];
    await this.save();
  }

  // Get logs count
  getLogsCount() {
    return this.logs.length;
  }

  // Search logs by message content
  searchLogs(searchTerm, limit = 100) {
    const term = searchTerm.toLowerCase();
    return this.logs
      .filter(log => 
        (log.message && log.message.toLowerCase().includes(term)) ||
        (log.hookName && log.hookName.toLowerCase().includes(term)) ||
        (log.hookId && log.hookId.toLowerCase().includes(term))
      )
      .slice(-limit)
      .reverse();
  }
}

module.exports = HookLogManager;