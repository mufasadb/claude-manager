const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class HookRegistry {
  constructor() {
    this.userHooksPath = path.join(os.homedir(), '.claude-manager', 'user-hooks.json');
    this.projectHooksPaths = new Map(); // projectName -> hookFilePath
    
    // Initialize state
    this.state = {
      userHooks: [],
      projectHooks: {} // projectName -> hooks array
    };
  }

  async init() {
    await this.loadUserHooks();
  }

  // User-level hooks management
  async loadUserHooks() {
    try {
      await fs.ensureDir(path.dirname(this.userHooksPath));
      
      if (await fs.pathExists(this.userHooksPath)) {
        const data = await fs.readJson(this.userHooksPath);
        this.state.userHooks = data.hooks || [];
      }
    } catch (error) {
      console.error('Error loading user hooks:', error);
      this.state.userHooks = [];
    }
  }

  async saveUserHooks() {
    try {
      await fs.ensureDir(path.dirname(this.userHooksPath));
      const data = {
        hooks: this.state.userHooks,
        lastUpdated: Date.now(),
        version: '1.0'
      };
      await fs.writeJson(this.userHooksPath, data, { spaces: 2 });
    } catch (error) {
      console.error('Error saving user hooks:', error);
      throw error;
    }
  }

  // Project-level hooks management
  async loadProjectHooks(projectName, projectPath) {
    const hookFilePath = path.join(projectPath, '.claude', 'custom-hooks.json');
    this.projectHooksPaths.set(projectName, hookFilePath);

    try {
      if (await fs.pathExists(hookFilePath)) {
        const data = await fs.readJson(hookFilePath);
        this.state.projectHooks[projectName] = data.hooks || [];
      } else {
        this.state.projectHooks[projectName] = [];
      }
    } catch (error) {
      console.error(`Error loading project hooks for ${projectName}:`, error);
      this.state.projectHooks[projectName] = [];
    }
  }

  async saveProjectHooks(projectName) {
    const hookFilePath = this.projectHooksPaths.get(projectName);
    if (!hookFilePath) {
      throw new Error(`Project ${projectName} not registered with hook registry`);
    }

    try {
      await fs.ensureDir(path.dirname(hookFilePath));
      const data = {
        hooks: this.state.projectHooks[projectName] || [],
        lastUpdated: Date.now(),
        version: '1.0'
      };
      await fs.writeJson(hookFilePath, data, { spaces: 2 });
    } catch (error) {
      console.error(`Error saving project hooks for ${projectName}:`, error);
      throw error;
    }
  }

  // Hook CRUD operations
  async addHook(scope, projectName, hookConfig) {
    const hook = {
      id: this.generateHookId(),
      name: hookConfig.name,
      eventType: hookConfig.eventType,
      pattern: hookConfig.pattern || '*',
      code: hookConfig.code,
      enabled: hookConfig.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      generatedBy: hookConfig.generatedBy || 'manual',
      description: hookConfig.description || ''
    };

    if (scope === 'user') {
      this.state.userHooks.push(hook);
      await this.saveUserHooks();
    } else if (scope === 'project') {
      if (!projectName) {
        throw new Error('Project name required for project scope');
      }
      if (!this.state.projectHooks[projectName]) {
        this.state.projectHooks[projectName] = [];
      }
      this.state.projectHooks[projectName].push(hook);
      await this.saveProjectHooks(projectName);
    } else {
      throw new Error('Invalid scope. Must be "user" or "project"');
    }

    return hook;
  }

  async updateHook(scope, projectName, hookId, updates) {
    let hook;
    
    if (scope === 'user') {
      hook = this.state.userHooks.find(h => h.id === hookId);
      if (!hook) {
        throw new Error('Hook not found in user scope');
      }
      Object.assign(hook, updates, { updatedAt: Date.now() });
      await this.saveUserHooks();
    } else if (scope === 'project') {
      if (!projectName || !this.state.projectHooks[projectName]) {
        throw new Error('Project not found');
      }
      hook = this.state.projectHooks[projectName].find(h => h.id === hookId);
      if (!hook) {
        throw new Error('Hook not found in project scope');
      }
      Object.assign(hook, updates, { updatedAt: Date.now() });
      await this.saveProjectHooks(projectName);
    } else {
      throw new Error('Invalid scope');
    }

    return hook;
  }

  async deleteHook(scope, projectName, hookId) {
    if (scope === 'user') {
      const index = this.state.userHooks.findIndex(h => h.id === hookId);
      if (index === -1) {
        throw new Error('Hook not found in user scope');
      }
      const deleted = this.state.userHooks.splice(index, 1)[0];
      await this.saveUserHooks();
      return deleted;
    } else if (scope === 'project') {
      if (!projectName || !this.state.projectHooks[projectName]) {
        throw new Error('Project not found');
      }
      const index = this.state.projectHooks[projectName].findIndex(h => h.id === hookId);
      if (index === -1) {
        throw new Error('Hook not found in project scope');
      }
      const deleted = this.state.projectHooks[projectName].splice(index, 1)[0];
      await this.saveProjectHooks(projectName);
      return deleted;
    } else {
      throw new Error('Invalid scope');
    }
  }

  // Hook retrieval
  getHooks(scope, projectName) {
    if (scope === 'user') {
      return [...this.state.userHooks];
    } else if (scope === 'project') {
      return [...(this.state.projectHooks[projectName] || [])];
    } else if (scope === 'all') {
      // Return all hooks with scope information
      const allHooks = [];
      
      // Add user hooks
      this.state.userHooks.forEach(hook => {
        allHooks.push({ ...hook, scope: 'user' });
      });
      
      // Add project hooks
      Object.entries(this.state.projectHooks).forEach(([projName, hooks]) => {
        hooks.forEach(hook => {
          allHooks.push({ ...hook, scope: 'project', projectName: projName });
        });
      });
      
      return allHooks;
    } else {
      throw new Error('Invalid scope');
    }
  }

  getHook(scope, projectName, hookId) {
    if (scope === 'user') {
      return this.state.userHooks.find(h => h.id === hookId) || null;
    } else if (scope === 'project') {
      if (!this.state.projectHooks[projectName]) return null;
      return this.state.projectHooks[projectName].find(h => h.id === hookId) || null;
    } else {
      throw new Error('Invalid scope');
    }
  }

  // Get hooks that match a specific event
  getMatchingHooks(eventType, toolName, filePaths = []) {
    const matchingHooks = [];
    
    // Check user hooks
    this.state.userHooks.forEach(hook => {
      if (this.hookMatches(hook, eventType, toolName, filePaths)) {
        matchingHooks.push({ ...hook, scope: 'user' });
      }
    });
    
    // Check project hooks for all projects
    Object.entries(this.state.projectHooks).forEach(([projectName, hooks]) => {
      hooks.forEach(hook => {
        if (this.hookMatches(hook, eventType, toolName, filePaths)) {
          matchingHooks.push({ ...hook, scope: 'project', projectName });
        }
      });
    });
    
    return matchingHooks.filter(hook => hook.enabled);
  }

  // Hook matching logic
  hookMatches(hook, eventType, toolName, filePaths) {
    // Check event type match
    if (hook.eventType !== eventType && hook.eventType !== '*') {
      return false;
    }
    
    // Check pattern match
    if (hook.pattern === '*') {
      return true;
    }
    
    // Pattern can match tool names or file patterns
    const pattern = hook.pattern.toLowerCase();
    
    // Check tool name match
    if (toolName && toolName.toLowerCase().includes(pattern)) {
      return true;
    }
    
    // Check file path matches
    if (filePaths && filePaths.length > 0) {
      return filePaths.some(filePath => 
        filePath.toLowerCase().includes(pattern) ||
        this.matchesGlobPattern(filePath, pattern)
      );
    }
    
    return false;
  }

  matchesGlobPattern(filePath, pattern) {
    // Simple glob pattern matching for common cases
    if (pattern.includes('*')) {
      const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp(regex, 'i').test(filePath);
    }
    return false;
  }

  // Project cleanup
  async unregisterProject(projectName) {
    delete this.state.projectHooks[projectName];
    this.projectHooksPaths.delete(projectName);
  }

  // Utility methods
  generateHookId() {
    return 'hook_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getStats() {
    const userHooksCount = this.state.userHooks.length;
    const projectHooksCount = Object.values(this.state.projectHooks).reduce(
      (total, hooks) => total + hooks.length, 0
    );
    
    return {
      totalHooks: userHooksCount + projectHooksCount,
      userHooks: userHooksCount,
      projectHooks: projectHooksCount,
      enabledHooks: this.getHooks('all').filter(h => h.enabled).length,
      hooksByEventType: this.getHooksByEventType()
    };
  }

  getHooksByEventType() {
    const counts = {};
    this.getHooks('all').forEach(hook => {
      counts[hook.eventType] = (counts[hook.eventType] || 0) + 1;
    });
    return counts;
  }

  getState() {
    return {
      userHooks: [...this.state.userHooks],
      projectHooks: { ...this.state.projectHooks }
    };
  }
}

module.exports = HookRegistry;