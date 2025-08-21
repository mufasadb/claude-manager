const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { parseEnvFile } = require('../../utils/env-utils');
const { getProjectConfigPaths } = require('../../utils/path-utils');

class ProjectRegistry {
  constructor() {
    this.registryPath = path.join(os.homedir(), '.claude-manager');
    this.registryFile = path.join(this.registryPath, 'registry.json');
    
    this.state = {
      projects: {},
      projectEnvVars: {}
    };
  }

  async init() {
    await fs.ensureDir(this.registryPath);
    await this.load();
  }

  async load() {
    try {
      if (await fs.pathExists(this.registryFile)) {
        const data = await fs.readJson(this.registryFile);
        this.state.projects = data.projects || {};
      }
      
      // Load project configurations and environment variables
      for (const projectName of Object.keys(this.state.projects)) {
        await this.loadProjectConfig(projectName);
        await this.loadProjectEnvVars(projectName);
      }
    } catch (error) {
      console.error('Error loading project registry:', error);
    }
  }

  async save() {
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

  // Project management
  async addProject(name, projectPath, interfaceUrl = null) {
    if (!name || !projectPath) {
      throw new Error('Name and path are required');
    }

    if (!await fs.pathExists(projectPath)) {
      throw new Error('Project path does not exist');
    }

    this.state.projects[name] = {
      path: projectPath,
      registeredAt: Date.now(),
      interfaceUrl: interfaceUrl
    };

    await this.loadProjectConfig(name);
    return this.state.projects[name];
  }

  removeProject(name) {
    if (!name) {
      throw new Error('Project name is required');
    }

    if (!this.state.projects[name]) {
      throw new Error('Project not found');
    }

    delete this.state.projects[name];
    
    if (this.state.projectEnvVars[name]) {
      delete this.state.projectEnvVars[name];
    }

    return { success: true, message: `Project "${name}" unregistered successfully` };
  }

  // Configuration loading
  async loadProjectConfig(projectName) {
    const project = this.state.projects[projectName];
    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    const projectPaths = getProjectConfigPaths(project.path);
    
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

      // Don't load CLAUDE.md content into registry - load on-demand instead
      // Just track if the file exists
      config.hasClaudeMd = await fs.pathExists(projectPaths.memory);

      // Load custom commands
      if (await fs.pathExists(projectPaths.commands)) {
        config.commands = await this.loadCommands(projectPaths.commands);
      }

      this.state.projects[projectName].config = config;
      
    } catch (error) {
      console.error(`Error loading project config for ${projectName}:`, error);
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

  // Environment variables
  async loadProjectEnvVars(projectName) {
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

  updateProjectEnvVar(projectName, key, value) {
    if (!this.state.projectEnvVars[projectName]) {
      this.state.projectEnvVars[projectName] = {};
    }
    this.state.projectEnvVars[projectName][key] = value;
  }

  removeProjectEnvVar(projectName, key) {
    if (this.state.projectEnvVars[projectName] && this.state.projectEnvVars[projectName][key]) {
      delete this.state.projectEnvVars[projectName][key];
    }
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

  // Getters
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

  // Interface URL management
  getProjectByPath(projectPath) {
    for (const [name, project] of Object.entries(this.state.projects)) {
      if (project.path === projectPath) {
        return { name, ...project };
      }
    }
    return null;
  }

  getInterfaceUrlByPath(projectPath) {
    const project = this.getProjectByPath(projectPath);
    return project?.interfaceUrl || null;
  }

  async updateInterfaceUrl(projectName, interfaceUrl) {
    if (!this.state.projects[projectName]) {
      throw new Error(`Project ${projectName} not found`);
    }
    
    this.state.projects[projectName].interfaceUrl = interfaceUrl;
    await this.save();
    return this.state.projects[projectName];
  }

  // Validation
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

module.exports = ProjectRegistry;