const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { parseEnvFile } = require('../utils/env-utils');
const { getProjectConfigPaths } = require('../utils/path-utils');

class ProjectService {
  constructor() {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.registryFile = path.join(this.registryPath, 'registry.json');
    
    // Initialize state
    this.state = {
      projects: {},
      projectEnvVars: {}
    };
  }

  async init() {
    await fs.ensureDir(this.registryPath);
    await this.loadRegistry();
  }

  // Registry Management
  async loadRegistry() {
    try {
      if (await fs.pathExists(this.registryFile)) {
        const data = await fs.readJson(this.registryFile);
        this.state.projects = data.projects || {};
      }
      
      // Load project configurations and environment variables
      for (const projectName of Object.keys(this.state.projects)) {
        await this.refreshProjectConfig(projectName);
        await this.refreshProjectEnvVars(projectName);
      }
      
      
    } catch (error) {
      console.error('Error loading project registry:', error);
    }
  }

  async saveRegistry() {
    try {
      await fs.ensureDir(this.registryPath);
      const registryData = {
        projects: this.state.projects,
        lastUpdate: Date.now()
      };
      await fs.writeJson(this.registryFile, registryData, { spaces: 2 });
    } catch (error) {
      console.error('Error saving project registry:', error);
      throw error;
    }
  }

  // Project Registration
  async registerProject(name, projectPath) {
    if (!name || !projectPath) {
      throw new Error('Name and path are required');
    }

    // Check if path exists
    if (!await fs.pathExists(projectPath)) {
      throw new Error('Project path does not exist');
    }

    this.state.projects[name] = {
      path: projectPath,
      registeredAt: Date.now()
    };

    await this.saveRegistry();
    await this.refreshProjectConfig(name);
    
    return this.state.projects[name];
  }

  async unregisterProject(name) {
    if (!name) {
      throw new Error('Project name is required');
    }

    if (!this.state.projects[name]) {
      throw new Error('Project not found');
    }

    // Remove project from registry
    delete this.state.projects[name];
    
    // Clean up project environment variables
    if (this.state.projectEnvVars[name]) {
      delete this.state.projectEnvVars[name];
    }


    await this.saveRegistry();
    
    return { success: true, message: `Project "${name}" unregistered successfully` };
  }

  // Project Configuration Management
  async refreshProjectConfig(projectName) {
    const project = this.state.projects[projectName];
    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    const projectPaths = getProjectConfigPaths(project.path);
    
    // Load all project config files
    const config = {
      settings: {},
      settingsLocal: {},
      memory: '',
      commands: {}
    };

    try {
      // Load settings.json
      if (await fs.pathExists(projectPaths.settings)) {
        config.settings = await fs.readJson(projectPaths.settings);
      }

      // Load settings.local.json  
      if (await fs.pathExists(projectPaths.settingsLocal)) {
        config.settingsLocal = await fs.readJson(projectPaths.settingsLocal);
      }


      // Don't load CLAUDE.md content into memory - load on-demand instead
      // Just track if the file exists
      config.hasClaudeMd = await fs.pathExists(projectPaths.memory);

      // Load custom commands
      if (await fs.pathExists(projectPaths.commands)) {
        config.commands = await this.loadCommands(projectPaths.commands);
      }

      this.state.projects[projectName].config = config;
      
    } catch (error) {
      console.error(`Error refreshing project config for ${projectName}:`, error);
      // Initialize empty config on error
      this.state.projects[projectName].config = config;
    }
  }

  async loadCommands(commandsPath) {
    const commands = {};
    
    try {
      const entries = await fs.readdir(commandsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const commandName = entry.name.replace('.md', '');
          const commandPath = path.join(commandsPath, entry.name);
          const content = await fs.readFile(commandPath, 'utf8');
          commands[commandName] = {
            name: commandName,
            content: content.trim(),
            path: commandPath
          };
        }
      }
    } catch (error) {
      console.error('Error loading commands:', error);
    }
    
    return commands;
  }

  // Environment Variables Management
  async refreshProjectEnvVars(projectName) {
    const project = this.state.projects[projectName];
    if (!project) return;

    try {
      const envPath = path.join(project.path, '.env');
      
      if (await fs.pathExists(envPath)) {
        const content = await fs.readFile(envPath, 'utf8');
        this.state.projectEnvVars[projectName] = parseEnvFile(content);
      } else {
        this.state.projectEnvVars[projectName] = {};
      }
    } catch (error) {
      console.error(`Error reading project env vars for ${projectName}:`, error);
      this.state.projectEnvVars[projectName] = {};
    }
  }

  async addEnvToProject(projectName, key, value) {
    const project = this.state.projects[projectName];
    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    const envPath = path.join(project.path, '.env');
    
    try {
      let content = '';
      let existingVars = {};
      
      if (await fs.pathExists(envPath)) {
        content = await fs.readFile(envPath, 'utf8');
        existingVars = parseEnvFile(content);
      }
      
      existingVars[key] = value;
      
      // Rebuild .env content
      const envLines = Object.entries(existingVars).map(([k, v]) => `${k}=${v}`);
      const newContent = envLines.join('\n') + '\n';
      
      await fs.writeFile(envPath, newContent, 'utf8');
      
      // Update in-memory state
      if (!this.state.projectEnvVars[projectName]) {
        this.state.projectEnvVars[projectName] = {};
      }
      this.state.projectEnvVars[projectName][key] = value;
      
      return this.state.projectEnvVars[projectName];
    } catch (error) {
      console.error(`Error adding env var to project ${projectName}:`, error);
      throw error;
    }
  }

  async deleteEnvFromProject(projectName, key) {
    const project = this.state.projects[projectName];
    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    const envPath = path.join(project.path, '.env');
    
    try {
      if (!await fs.pathExists(envPath)) {
        return this.state.projectEnvVars[projectName] || {};
      }
      
      const content = await fs.readFile(envPath, 'utf8');
      const existingVars = parseEnvFile(content);
      
      if (existingVars[key]) {
        delete existingVars[key];
        
        // Rebuild .env content
        const envLines = Object.entries(existingVars).map(([k, v]) => `${k}=${v}`);
        const newContent = envLines.join('\n') + (envLines.length > 0 ? '\n' : '');
        
        await fs.writeFile(envPath, newContent, 'utf8');
        
        // Update in-memory state
        if (this.state.projectEnvVars[projectName] && this.state.projectEnvVars[projectName][key]) {
          delete this.state.projectEnvVars[projectName][key];
        }
      }
      
      return this.state.projectEnvVars[projectName] || {};
    } catch (error) {
      console.error(`Error deleting env var from project ${projectName}:`, error);
      throw error;
    }
  }

  async copyEnvToUser(projectName, key, userEnvFile) {
    const projectEnvVars = this.state.projectEnvVars[projectName];
    if (!projectEnvVars || !projectEnvVars[key]) {
      throw new Error(`Environment variable ${key} not found in project ${projectName}`);
    }

    const value = projectEnvVars[key];
    
    try {
      let content = '';
      let existingVars = {};
      
      if (await fs.pathExists(userEnvFile)) {
        content = await fs.readFile(userEnvFile, 'utf8');
        existingVars = parseEnvFile(content);
      }
      
      existingVars[key] = value;
      
      // Rebuild user .env content
      const envLines = Object.entries(existingVars).map(([k, v]) => `${k}=${v}`);
      const newContent = envLines.join('\n') + '\n';
      
      await fs.ensureDir(path.dirname(userEnvFile));
      await fs.writeFile(userEnvFile, newContent, 'utf8');
      
      return { key, value, copiedTo: 'user' };
    } catch (error) {
      console.error(`Error copying env var to user level:`, error);
      throw error;
    }
  }

  async pushEnvToProject(projectName, key, value) {
    const project = this.state.projects[projectName];
    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    const envPath = path.join(project.path, '.env');
    
    try {
      let existingVars = {};
      let existingContent = '';
      
      // Check if .env file exists and load it
      if (await fs.pathExists(envPath)) {
        existingContent = await fs.readFile(envPath, 'utf8');
        existingVars = parseEnvFile(existingContent);
        
        // Check for conflict
        if (existingVars[key] !== undefined) {
          return {
            success: false,
            conflict: true,
            message: `Variable ${key} already exists in ${projectName}. Please overwrite manually with copy-paste.`
          };
        }
      }
      
      // Create or append to .env file
      let newContent;
      if (existingContent.trim() === '') {
        // Empty or non-existent file
        newContent = `${key}=${value}\n`;
      } else {
        // Append to existing content
        const trimmedContent = existingContent.trim();
        newContent = `${trimmedContent}\n${key}=${value}\n`;
      }
      
      // Ensure project directory exists
      await fs.ensureDir(path.dirname(envPath));
      
      // Write the file
      await fs.writeFile(envPath, newContent, 'utf8');
      
      // Update in-memory state
      if (!this.state.projectEnvVars[projectName]) {
        this.state.projectEnvVars[projectName] = {};
      }
      this.state.projectEnvVars[projectName][key] = value;
      
      return {
        success: true,
        message: `Successfully added ${key} to ${projectName}`,
        envVars: this.state.projectEnvVars[projectName]
      };
    } catch (error) {
      console.error(`Error pushing env var to project ${projectName}:`, error);
      throw error;
    }
  }


  // File Operations
  async saveProjectFile(projectName, fileType, content) {
    const project = this.state.projects[projectName];
    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    const projectPaths = getProjectConfigPaths(project.path);
    let filePath;

    switch (fileType) {
      case 'settings':
        filePath = projectPaths.settings;
        break;
      case 'memory':
        filePath = projectPaths.memory;
        break;
      default:
        throw new Error(`Unknown file type: ${fileType}`);
    }

    await fs.ensureDir(path.dirname(filePath));
    
    if (fileType === 'settings') {
      // JSON files
      const parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
      await fs.writeJson(filePath, parsedContent, { spaces: 2 });
    } else {
      // Text files
      await fs.writeFile(filePath, content, 'utf8');
    }

    // Refresh project config after saving
    await this.refreshProjectConfig(projectName);
    
    return { success: true, filePath };
  }

  // CLAUDE.md loading
  async getClaudeMdContent(projectName) {
    const project = this.state.projects[projectName];
    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    const projectPaths = getProjectConfigPaths(project.path);
    
    try {
      if (await fs.pathExists(projectPaths.memory)) {
        return await fs.readFile(projectPaths.memory, 'utf8');
      }
      return '';
    } catch (error) {
      console.error(`Error loading CLAUDE.md for ${projectName}:`, error);
      return '';
    }
  }

  // Getters and Utility Methods
  getProjects() {
    return { ...this.state.projects };
  }

  getProject(name) {
    return this.state.projects[name] || null;
  }

  getProjectEnvVars(name) {
    return this.state.projectEnvVars[name] || {};
  }

  getAllProjectEnvVars() {
    return { ...this.state.projectEnvVars };
  }

  getState() {
    return {
      projects: { ...this.state.projects },
      projectEnvVars: { ...this.state.projectEnvVars }
    };
  }

  // Project validation
  async validateProject(projectPath) {
    try {
      if (!await fs.pathExists(projectPath)) {
        return { valid: false, reason: 'Path does not exist' };
      }

      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        return { valid: false, reason: 'Path is not a directory' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  // Search and filtering
  searchProjects(query) {
    if (!query) return this.getProjects();
    
    const results = {};
    const lowerQuery = query.toLowerCase();
    
    for (const [name, project] of Object.entries(this.state.projects)) {
      if (name.toLowerCase().includes(lowerQuery) || 
          project.path.toLowerCase().includes(lowerQuery)) {
        results[name] = project;
      }
    }
    
    return results;
  }

  // Statistics
  getStats() {
    return {
      totalProjects: Object.keys(this.state.projects).length,
      projectsWithEnvVars: Object.keys(this.state.projectEnvVars).filter(
        name => Object.keys(this.state.projectEnvVars[name] || {}).length > 0
      ).length,
      totalEnvVars: Object.values(this.state.projectEnvVars).reduce(
        (total, vars) => total + Object.keys(vars || {}).length, 0
      )
    };
  }
}

module.exports = ProjectService;