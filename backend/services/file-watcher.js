const chokidar = require('chokidar');
const path = require('path');
const os = require('os');
const { getUserConfigPaths, getProjectConfigPaths } = require('../utils/path-utils');

class FileWatcher {
  constructor() {
    this.watchers = [];
    this.onFileChange = null; // Callback function
    this.debounceTimeouts = new Map();
  }

  // Set up file watchers for user and project configurations
  setupFileWatchers(projects, onChangeCallback) {
    this.onFileChange = onChangeCallback;
    
    // Clean up existing watchers
    this.watchers.forEach(watcher => watcher.close());
    this.watchers = [];

    // Watch user config files
    const userPaths = getUserConfigPaths();
    const watchPaths = [
      userPaths.settings,
      userPaths.settingsLocal, 
      userPaths.memory,
      path.join(userPaths.commands, '**/*.md') // Watch all markdown files in commands directory recursively
    ];
    const userWatcher = chokidar.watch(watchPaths, {
      ignored: /node_modules/,
      persistent: true,
      ignoreInitial: true
    });

    userWatcher.on('change', (filePath) => {
      this.handleFileChange('user', filePath);
    });

    userWatcher.on('add', (filePath) => {
      this.handleFileChange('user', filePath);
    });

    userWatcher.on('unlink', (filePath) => {
      this.handleFileChange('user', filePath);
    });

    userWatcher.on('error', error => console.error('User config watcher error:', error));
    this.watchers.push(userWatcher);

    // Watch project configs
    Object.entries(projects).forEach(([name, config]) => {
      const projectPaths = getProjectConfigPaths(config.path);
      const projectWatchPaths = [
        projectPaths.settings,
        projectPaths.settingsLocal,
        projectPaths.memory,
        path.join(projectPaths.commands, '**/*.md') // Watch all markdown files in project commands directory recursively
      ];
      
      const projectWatcher = chokidar.watch(projectWatchPaths, {
        ignored: /node_modules/,
        persistent: true,
        ignoreInitial: true
      });

      projectWatcher.on('change', (filePath) => {
        this.handleFileChange('project', filePath, name);
      });

      projectWatcher.on('add', (filePath) => {
        this.handleFileChange('project', filePath, name);
      });

      projectWatcher.on('unlink', (filePath) => {
        this.handleFileChange('project', filePath, name);
      });

      projectWatcher.on('error', error => 
        console.error(`Project ${name} watcher error:`, error)
      );
      
      this.watchers.push(projectWatcher);
    });
  }

  // Handle file change events with debouncing
  handleFileChange(scope, filePath, projectName = null) {
    if (!this.onFileChange) return;

    const debounceKey = `${scope}:${filePath}:${projectName || ''}`;
    
    // Clear existing timeout
    if (this.debounceTimeouts.has(debounceKey)) {
      clearTimeout(this.debounceTimeouts.get(debounceKey));
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      try {
        console.log(`File changed: ${filePath} (scope: ${scope}${projectName ? `, project: ${projectName}` : ''})`);
        await this.onFileChange(scope, filePath, projectName);
        this.debounceTimeouts.delete(debounceKey);
      } catch (error) {
        console.error('Error handling file change:', error);
        this.debounceTimeouts.delete(debounceKey);
      }
    }, 2000); // 2 second debounce

    this.debounceTimeouts.set(debounceKey, timeout);
  }

  // Add watcher for specific directory
  addDirectoryWatcher(directoryPath, callback, options = {}) {
    const defaultOptions = {
      ignored: /node_modules/,
      persistent: true,
      ignoreInitial: true,
      depth: options.depth || 2
    };

    const watcher = chokidar.watch(directoryPath, { ...defaultOptions, ...options });
    
    watcher.on('all', (event, filePath) => {
      try {
        callback(event, filePath);
      } catch (error) {
        console.error(`Error in directory watcher callback for ${directoryPath}:`, error);
      }
    });

    watcher.on('error', error => 
      console.error(`Directory watcher error for ${directoryPath}:`, error)
    );

    this.watchers.push(watcher);
    return watcher;
  }

  // Add watcher for specific file patterns
  addPatternWatcher(patterns, callback, options = {}) {
    const defaultOptions = {
      ignored: /node_modules/,
      persistent: true,
      ignoreInitial: true
    };

    const watcher = chokidar.watch(patterns, { ...defaultOptions, ...options });
    
    watcher.on('all', (event, filePath) => {
      try {
        callback(event, filePath);
      } catch (error) {
        console.error(`Error in pattern watcher callback:`, error);
      }
    });

    watcher.on('error', error => 
      console.error(`Pattern watcher error:`, error)
    );

    this.watchers.push(watcher);
    return watcher;
  }

  // Update watchers when projects change
  updateProjectWatchers(projects) {
    if (!this.onFileChange) return;
    
    // Remove all existing watchers except the first one (user config watcher)
    const userWatcher = this.watchers[0];
    this.watchers.slice(1).forEach(watcher => watcher.close());
    this.watchers = userWatcher ? [userWatcher] : [];

    // Add new project watchers
    Object.entries(projects).forEach(([name, config]) => {
      const projectPaths = getProjectConfigPaths(config.path);
      
      const projectWatcher = chokidar.watch(Object.values(projectPaths), {
        ignored: /node_modules/,
        persistent: true,
        ignoreInitial: true
      });

      projectWatcher.on('change', (filePath) => {
        this.handleFileChange('project', filePath, name);
      });

      projectWatcher.on('error', error => 
        console.error(`Project ${name} watcher error:`, error)
      );
      
      this.watchers.push(projectWatcher);
    });
  }

  // Get information about active watchers
  getWatcherInfo() {
    return {
      totalWatchers: this.watchers.length,
      activePaths: this.watchers.map(watcher => watcher.getWatched()),
      pendingDebounces: this.debounceTimeouts.size
    };
  }

  // Clean up all watchers
  closeAllWatchers() {
    // Clear all debounce timeouts
    this.debounceTimeouts.forEach(timeout => clearTimeout(timeout));
    this.debounceTimeouts.clear();

    // Close all watchers
    this.watchers.forEach(watcher => {
      try {
        watcher.close();
      } catch (error) {
        console.error('Error closing watcher:', error);
      }
    });
    
    this.watchers = [];
    this.onFileChange = null;
  }

  // Remove specific watcher
  removeWatcher(watcher) {
    const index = this.watchers.indexOf(watcher);
    if (index > -1) {
      try {
        watcher.close();
        this.watchers.splice(index, 1);
      } catch (error) {
        console.error('Error removing watcher:', error);
      }
    }
  }

  // Helper method to determine file type from path
  getFileType(filePath) {
    const basename = path.basename(filePath);
    const dirname = path.basename(path.dirname(filePath));
    
    if (basename === 'settings.json') return 'settings';
    if (basename === 'settings.local.json') return 'settingsLocal';
    if (basename === 'CLAUDE.md') return 'memory';
    if (basename === '.mcp.json') return 'mcp';
    if (dirname === 'commands') return 'commands';
    if (basename === '.env') return 'env';
    
    return 'unknown';
  }

  // Helper method to determine scope from file path
  getScope(filePath) {
    const normalizedPath = path.normalize(filePath);
    const homedir = os.homedir();
    
    if (normalizedPath.startsWith(path.join(homedir, '.claude'))) {
      return 'user';
    }
    
    return 'project';
  }

  // Check if a path is being watched
  isPathWatched(targetPath) {
    return this.watchers.some(watcher => {
      const watched = watcher.getWatched();
      return Object.keys(watched).some(dir => 
        targetPath.startsWith(dir) || 
        Object.values(watched[dir] || {}).some(file => 
          path.join(dir, file) === targetPath
        )
      );
    });
  }
}

module.exports = FileWatcher;