const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class SessionDataManager {
  constructor() {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.sessionTrackingFile = path.join(this.registryPath, 'session-tracking.json');
    
    this.state = {
      enabled: false,
      currentSessionStart: null,
      billingDate: 1,
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

  isSessionActiveAtTime(sessionStartTime, currentTime = Date.now()) {
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
    await this.load();
  }

  async load() {
    try {
      if (await fs.pathExists(this.sessionTrackingFile)) {
        const sessionData = await fs.readJson(this.sessionTrackingFile);
        this.state = { ...this.state, ...sessionData };
      }
    } catch (error) {
      console.error('Error loading session tracking:', error);
    }
  }

  async save() {
    try {
      await fs.writeJson(this.sessionTrackingFile, this.state, { spaces: 2 });
    } catch (error) {
      console.error('Error saving session tracking:', error);
    }
  }

  // State management
  setEnabled(enabled) {
    this.state.enabled = enabled;
  }

  setCurrentSessionStart(timestamp) {
    this.state.currentSessionStart = timestamp;
  }

  setBillingDate(date) {
    this.state.billingDate = date;
  }

  setMonthlySessions(count) {
    this.state.monthlySessions = count;
  }

  setSessionHistory(sessions) {
    this.state.sessionHistory = sessions;
  }

  setLastScannedTimestamp(timestamp) {
    this.state.lastScannedTimestamp = timestamp;
  }

  // Getters
  getState() {
    return { ...this.state };
  }

  isEnabled() {
    return this.state.enabled;
  }

  getCurrentSessionStart() {
    return this.state.currentSessionStart;
  }

  getBillingDate() {
    return this.state.billingDate;
  }

  getMonthlySessions() {
    return this.state.monthlySessions;
  }

  getSessionHistory() {
    return this.state.sessionHistory || [];
  }

  getLastScannedTimestamp() {
    return this.state.lastScannedTimestamp;
  }

  // Session statistics
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
        max: 50
      },
      estimatedCosts: {
        pro: { monthly: 20, perSession: 20 / 50 },
        'max-5x': { monthly: 100, perSession: 100 / 50 },
        'max-20x': { monthly: 400, perSession: 400 / 50 }
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

  // Current session helper
  getCurrentSession() {
    if (!this.state.currentSessionStart) return null;
    
    const now = Date.now();
    const sessionStart = this.state.currentSessionStart;
    
    if (!this.isSessionActiveAtTime(sessionStart, now)) return null;
    
    return {
      start: sessionStart,
      remaining: this.getSessionTimeRemaining(sessionStart, now)
    };
  }

  // Session validation
  isSessionActive() {
    if (!this.state.currentSessionStart) return false;
    
    const now = Date.now();
    return this.isSessionActiveAtTime(this.state.currentSessionStart, now);
  }

  // Reset methods
  clearCurrentSession() {
    this.state.currentSessionStart = null;
  }

  resetSessionHistory() {
    this.state.sessionHistory = [];
    this.state.monthlySessions = 0;
  }
}

module.exports = SessionDataManager;