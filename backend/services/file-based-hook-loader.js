const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const EventEmitter = require('events');

/**
 * File-based hook loader that replaces the complex registry system.
 * Hooks are individual JavaScript files with JSDoc metadata that auto-discover and execute directly.
 */
class FileBasedHookLoader extends EventEmitter {
  constructor() {
    super();
    
    // Hook directories
    this.userHooksDir = path.join(os.homedir(), '.claude-manager', 'hooks');
    this.userDisabledDir = path.join(this.userHooksDir, 'disabled');
    
    // Loaded hooks cache
    this.hooks = {
      user: new Map(), // filename -> hook object
      project: new Map() // projectPath -> Map(filename -> hook object)
    };
    
    // File watchers
    this.watchers = new Map();
    
    // Metadata cache to avoid re-parsing files
    this.metadataCache = new Map();
  }

  async init() {
    // Ensure hook directories exist
    await fs.ensureDir(this.userHooksDir);
    await fs.ensureDir(this.userDisabledDir);
    
    // Load initial hooks
    await this.loadUserHooks();
    
    // Setup file watching
    await this.setupFileWatching();
  }

  /**
   * Load all user-level hooks from the hooks directory
   */
  async loadUserHooks() {
    try {
      const files = await fs.readdir(this.userHooksDir);
      const jsFiles = files.filter(file => file.endsWith('.js') && !file.startsWith('.'));
      
      console.log(`Loading ${jsFiles.length} user hooks from ${this.userHooksDir}`);
      
      for (const filename of jsFiles) {
        await this.loadHookFile('user', null, filename);
      }
      
      console.log(`Loaded ${this.hooks.user.size} user hooks`);
    } catch (error) {
      console.error('Error loading user hooks:', error);
    }
  }

  /**
   * Load project-level hooks for a specific project
   */
  async loadProjectHooks(projectName, projectPath) {
    const projectHooksDir = path.join(projectPath, '.claude', 'hooks');
    const projectDisabledDir = path.join(projectHooksDir, 'disabled');
    
    try {
      // Ensure project hook directories exist
      await fs.ensureDir(projectHooksDir);
      await fs.ensureDir(projectDisabledDir);
      
      if (await fs.pathExists(projectHooksDir)) {
        const files = await fs.readdir(projectHooksDir);
        const jsFiles = files.filter(file => file.endsWith('.js') && !file.startsWith('.'));
        
        console.log(`Loading ${jsFiles.length} project hooks for ${projectName}`);
        
        if (!this.hooks.project.has(projectPath)) {
          this.hooks.project.set(projectPath, new Map());
        }
        
        for (const filename of jsFiles) {
          await this.loadHookFile('project', projectPath, filename);
        }
        
        console.log(`Loaded ${this.hooks.project.get(projectPath)?.size || 0} hooks for project ${projectName}`);
      }
    } catch (error) {
      console.error(`Error loading project hooks for ${projectName}:`, error);
    }
  }

  /**
   * Load a single hook file and parse its metadata
   */
  async loadHookFile(scope, projectPath, filename) {
    const hookDir = scope === 'user' 
      ? this.userHooksDir 
      : path.join(projectPath, '.claude', 'hooks');
    
    const filePath = path.join(hookDir, filename);
    
    try {
      if (!await fs.pathExists(filePath)) {
        console.warn(`Hook file not found: ${filePath}`);
        return null;
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      const metadata = this.parseJSDocMetadata(content);
      
      if (!metadata.name || !metadata.event) {
        console.warn(`Hook file ${filename} missing required metadata (@hook and @event)`);
        return null;
      }
      
      const hook = {
        id: this.generateHookId(filename),
        filename,
        filePath,
        scope,
        projectPath,
        name: metadata.name,
        eventType: metadata.event,
        pattern: metadata.pattern || '*',
        description: metadata.description || '',
        enabled: metadata.enabled !== 'false', // Default to true unless explicitly false
        author: metadata.author || 'unknown',
        version: metadata.version || '1.0.0',
        code: content,
        loadedAt: Date.now(),
        metadata
      };
      
      // Cache the hook
      if (scope === 'user') {
        this.hooks.user.set(filename, hook);
      } else {
        if (!this.hooks.project.has(projectPath)) {
          this.hooks.project.set(projectPath, new Map());
        }
        this.hooks.project.get(projectPath).set(filename, hook);
      }
      
      // Update metadata cache
      this.metadataCache.set(filePath, {
        metadata,
        lastModified: (await fs.stat(filePath)).mtime.getTime()
      });
      
      console.log(`Loaded hook: ${hook.name} (${filename}) - ${hook.eventType}`);
      this.emit('hookLoaded', hook);
      
      return hook;
    } catch (error) {
      console.error(`Error loading hook file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Parse JSDoc metadata from hook file content
   */
  parseJSDocMetadata(content) {
    const metadata = {};
    
    // Extract JSDoc comment block at the top of the file
    const jsdocMatch = content.match(/^\s*\/\*\*\s*\n([\s\S]*?)\*\//);
    if (!jsdocMatch) {
      console.warn('No JSDoc metadata found in hook file');
      return metadata;
    }
    
    const jsdocContent = jsdocMatch[1];
    const lines = jsdocContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.replace(/^\s*\*\s?/, '').trim();
      
      // Parse @tag value pairs
      const tagMatch = trimmed.match(/^@(\w+)\s+(.+)$/);
      if (tagMatch) {
        const [, tag, value] = tagMatch;
        
        switch (tag) {
          case 'hook':
            metadata.name = value;
            break;
          case 'event':
            metadata.event = value;
            break;
          case 'pattern':
            metadata.pattern = value;
            break;
          case 'description':
            metadata.description = value;
            break;
          case 'scope':
            metadata.scope = value;
            break;
          case 'enabled':
            metadata.enabled = value.toLowerCase();
            break;
          case 'author':
            metadata.author = value;
            break;
          case 'version':
            metadata.version = value;
            break;
          default:
            // Store unknown tags for extensibility
            metadata[tag] = value;
        }
      }
    }
    
    return metadata;
  }

  /**
   * Setup file watching for automatic hook reloading
   */
  async setupFileWatching() {
    // Watch user hooks directory
    const userWatcher = chokidar.watch(path.join(this.userHooksDir, '*.js'), {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });
    
    userWatcher
      .on('add', async (filePath) => {
        const filename = path.basename(filePath);
        console.log(`New user hook detected: ${filename}`);
        await this.loadHookFile('user', null, filename);
      })
      .on('change', async (filePath) => {
        const filename = path.basename(filePath);
        console.log(`User hook changed: ${filename}`);
        await this.loadHookFile('user', null, filename);
      })
      .on('unlink', (filePath) => {
        const filename = path.basename(filePath);
        console.log(`User hook removed: ${filename}`);
        this.hooks.user.delete(filename);
        this.metadataCache.delete(filePath);
        this.emit('hookUnloaded', { scope: 'user', filename });
      });
    
    this.watchers.set('user', userWatcher);
  }

  /**
   * Setup file watching for a specific project
   */
  async setupProjectWatching(projectName, projectPath) {
    const projectHooksDir = path.join(projectPath, '.claude', 'hooks');
    
    if (this.watchers.has(projectPath)) {
      // Already watching this project
      return;
    }
    
    const projectWatcher = chokidar.watch(path.join(projectHooksDir, '*.js'), {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });
    
    projectWatcher
      .on('add', async (filePath) => {
        const filename = path.basename(filePath);
        console.log(`New project hook detected for ${projectName}: ${filename}`);
        await this.loadHookFile('project', projectPath, filename);
      })
      .on('change', async (filePath) => {
        const filename = path.basename(filePath);
        console.log(`Project hook changed for ${projectName}: ${filename}`);
        await this.loadHookFile('project', projectPath, filename);
      })
      .on('unlink', (filePath) => {
        const filename = path.basename(filePath);
        console.log(`Project hook removed for ${projectName}: ${filename}`);
        const projectHooks = this.hooks.project.get(projectPath);
        if (projectHooks) {
          projectHooks.delete(filename);
        }
        this.metadataCache.delete(filePath);
        this.emit('hookUnloaded', { scope: 'project', projectPath, filename });
      });
    
    this.watchers.set(projectPath, projectWatcher);
  }

  /**
   * Get all hooks matching a specific event
   */
  getMatchingHooks(eventType, toolName, filePaths = []) {
    const matchingHooks = [];
    
    // Check user hooks
    for (const hook of this.hooks.user.values()) {
      if (hook.enabled && this.hookMatches(hook, eventType, toolName, filePaths)) {
        matchingHooks.push(hook);
      }
    }
    
    // Check project hooks for all loaded projects
    for (const [projectPath, projectHooks] of this.hooks.project.entries()) {
      for (const hook of projectHooks.values()) {
        if (hook.enabled && this.hookMatches(hook, eventType, toolName, filePaths)) {
          matchingHooks.push(hook);
        }
      }
    }
    
    return matchingHooks;
  }

  /**
   * Hook matching logic
   */
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

  /**
   * Simple glob pattern matching
   */
  matchesGlobPattern(filePath, pattern) {
    if (pattern.includes('*')) {
      const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp(regex, 'i').test(filePath);
    }
    return false;
  }

  /**
   * Get all hooks for a specific scope
   */
  getHooks(scope, projectPath = null) {
    if (scope === 'user') {
      return Array.from(this.hooks.user.values());
    } else if (scope === 'project' && projectPath) {
      const projectHooks = this.hooks.project.get(projectPath);
      return projectHooks ? Array.from(projectHooks.values()) : [];
    } else if (scope === 'all') {
      const allHooks = [];
      
      // Add user hooks
      for (const hook of this.hooks.user.values()) {
        allHooks.push(hook);
      }
      
      // Add all project hooks
      for (const projectHooks of this.hooks.project.values()) {
        for (const hook of projectHooks.values()) {
          allHooks.push(hook);
        }
      }
      
      return allHooks;
    }
    
    return [];
  }

  /**
   * Get a specific hook by filename
   */
  getHook(scope, projectPath, filename) {
    if (scope === 'user') {
      return this.hooks.user.get(filename) || null;
    } else if (scope === 'project' && projectPath) {
      const projectHooks = this.hooks.project.get(projectPath);
      return projectHooks ? projectHooks.get(filename) || null : null;
    }
    return null;
  }

  /**
   * Enable a hook by moving it from disabled directory
   */
  async enableHook(scope, projectPath, filename) {
    const disabledDir = scope === 'user' 
      ? this.userDisabledDir 
      : path.join(projectPath, '.claude', 'hooks', 'disabled');
    
    const hookDir = scope === 'user' 
      ? this.userHooksDir 
      : path.join(projectPath, '.claude', 'hooks');
    
    const disabledPath = path.join(disabledDir, filename);
    const enabledPath = path.join(hookDir, filename);
    
    if (!await fs.pathExists(disabledPath)) {
      throw new Error(`Disabled hook file not found: ${filename}`);
    }
    
    await fs.move(disabledPath, enabledPath);
    console.log(`Enabled hook: ${filename}`);
    
    // Hook will be automatically loaded by file watcher
    return true;
  }

  /**
   * Disable a hook by moving it to disabled directory
   */
  async disableHook(scope, projectPath, filename) {
    const disabledDir = scope === 'user' 
      ? this.userDisabledDir 
      : path.join(projectPath, '.claude', 'hooks', 'disabled');
    
    const hookDir = scope === 'user' 
      ? this.userHooksDir 
      : path.join(projectPath, '.claude', 'hooks');
    
    const enabledPath = path.join(hookDir, filename);
    const disabledPath = path.join(disabledDir, filename);
    
    if (!await fs.pathExists(enabledPath)) {
      throw new Error(`Hook file not found: ${filename}`);
    }
    
    await fs.ensureDir(disabledDir);
    await fs.move(enabledPath, disabledPath);
    console.log(`Disabled hook: ${filename}`);
    
    // Remove from cache
    if (scope === 'user') {
      this.hooks.user.delete(filename);
    } else {
      const projectHooks = this.hooks.project.get(projectPath);
      if (projectHooks) {
        projectHooks.delete(filename);
      }
    }
    
    this.emit('hookUnloaded', { scope, projectPath, filename });
    return true;
  }

  /**
   * Create a new hook file from template
   */
  async createHookFromTemplate(scope, projectPath, filename, template) {
    const hookDir = scope === 'user' 
      ? this.userHooksDir 
      : path.join(projectPath, '.claude', 'hooks');
    
    const filePath = path.join(hookDir, filename);
    
    if (await fs.pathExists(filePath)) {
      throw new Error(`Hook file already exists: ${filename}`);
    }
    
    await fs.ensureDir(hookDir);
    await fs.writeFile(filePath, template, 'utf8');
    
    console.log(`Created new hook: ${filename}`);
    
    // Hook will be automatically loaded by file watcher
    return filePath;
  }

  /**
   * Update hook file content
   */
  async updateHookFile(scope, projectPath, filename, content) {
    const hookDir = scope === 'user' 
      ? this.userHooksDir 
      : path.join(projectPath, '.claude', 'hooks');
    
    const filePath = path.join(hookDir, filename);
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Hook file not found: ${filename}`);
    }
    
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`Updated hook: ${filename}`);
    
    // Hook will be automatically reloaded by file watcher
    return true;
  }

  /**
   * Delete a hook file permanently
   */
  async deleteHook(scope, projectPath, filename) {
    const hookDir = scope === 'user' 
      ? this.userHooksDir 
      : path.join(projectPath, '.claude', 'hooks');
    
    const filePath = path.join(hookDir, filename);
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Hook file not found: ${filename}`);
    }
    
    await fs.remove(filePath);
    console.log(`Deleted hook: ${filename}`);
    
    // Remove from cache
    if (scope === 'user') {
      this.hooks.user.delete(filename);
    } else {
      const projectHooks = this.hooks.project.get(projectPath);
      if (projectHooks) {
        projectHooks.delete(filename);
      }
    }
    
    this.emit('hookUnloaded', { scope, projectPath, filename });
    return true;
  }

  /**
   * Get statistics about loaded hooks
   */
  getStats() {
    let totalHooks = this.hooks.user.size;
    let enabledHooks = Array.from(this.hooks.user.values()).filter(h => h.enabled).length;
    
    for (const projectHooks of this.hooks.project.values()) {
      totalHooks += projectHooks.size;
      enabledHooks += Array.from(projectHooks.values()).filter(h => h.enabled).length;
    }
    
    const hooksByEventType = {};
    for (const hook of this.getHooks('all')) {
      hooksByEventType[hook.eventType] = (hooksByEventType[hook.eventType] || 0) + 1;
    }
    
    return {
      totalHooks,
      enabledHooks,
      disabledHooks: totalHooks - enabledHooks,
      userHooks: this.hooks.user.size,
      projectHooks: totalHooks - this.hooks.user.size,
      hooksByEventType,
      watchedProjects: this.hooks.project.size
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Close all file watchers
    for (const watcher of this.watchers.values()) {
      await watcher.close();
    }
    this.watchers.clear();
    
    // Clear caches
    this.hooks.user.clear();
    this.hooks.project.clear();
    this.metadataCache.clear();
    
    this.removeAllListeners();
  }

  /**
   * Unregister project hooks
   */
  async unregisterProject(projectPath) {
    // Close project watcher
    const watcher = this.watchers.get(projectPath);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(projectPath);
    }
    
    // Remove project hooks from cache
    this.hooks.project.delete(projectPath);
    
    console.log(`Unregistered project hooks: ${projectPath}`);
  }

  /**
   * Generate hook ID from filename
   */
  generateHookId(filename) {
    return 'file_' + filename.replace(/\.js$/, '').replace(/[^a-zA-Z0-9]/g, '_');
  }
}

module.exports = FileBasedHookLoader;