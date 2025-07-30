const fs = require('fs-extra');
const path = require('path');
const { parseEnvFile } = require('../../utils/env-utils');
const { getProjectConfigPaths } = require('../../utils/path-utils');

class ProjectOperations {
  constructor() {}

  // File operations
  async saveProjectFile(projectPath, fileType, content) {
    const projectPaths = getProjectConfigPaths(projectPath);
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

    return { success: true, filePath };
  }

  // Environment variable operations
  async addEnvToProject(projectPath, key, value) {
    const envPath = path.join(projectPath, '.env');
    
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
      
      return existingVars;
    } catch (error) {
      console.error(`Error adding env var to project:`, error);
      throw error;
    }
  }

  async deleteEnvFromProject(projectPath, key) {
    const envPath = path.join(projectPath, '.env');
    
    try {
      if (!await fs.pathExists(envPath)) {
        return {};
      }
      
      const content = await fs.readFile(envPath, 'utf8');
      const existingVars = parseEnvFile(content);
      
      if (existingVars[key]) {
        delete existingVars[key];
        
        // Rebuild .env content
        const envLines = Object.entries(existingVars).map(([k, v]) => `${k}=${v}`);
        const newContent = envLines.join('\n') + (envLines.length > 0 ? '\n' : '');
        
        await fs.writeFile(envPath, newContent, 'utf8');
      }
      
      return existingVars;
    } catch (error) {
      console.error(`Error deleting env var from project:`, error);
      throw error;
    }
  }

  async copyEnvToUser(projectPath, key, value, userEnvFile) {
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

  // Configuration analysis
  async analyzeProjectConfig(projectPath) {
    const projectPaths = getProjectConfigPaths(projectPath);
    const analysis = {
      hasSettings: await fs.pathExists(projectPaths.settings),
      hasSettingsLocal: await fs.pathExists(projectPaths.settingsLocal),
      hasClaudeMd: await fs.pathExists(projectPaths.memory),
      hasCommands: await fs.pathExists(projectPaths.commands),
      hasEnvFile: await fs.pathExists(path.join(projectPath, '.env'))
    };

    // Get file sizes and modification times
    for (const [key, exists] of Object.entries(analysis)) {
      if (exists && key !== 'hasCommands') {
        const pathKey = key.replace('has', '').toLowerCase();
        const filePath = pathKey === 'envfile' ? 
          path.join(projectPath, '.env') : 
          projectPaths[pathKey === 'claudemd' ? 'memory' : pathKey];
        
        try {
          const stats = await fs.stat(filePath);
          analysis[`${pathKey}Stats`] = {
            size: stats.size,
            modified: stats.mtime,
            accessed: stats.atime
          };
        } catch (error) {
          // Ignore stat errors
        }
      }
    }

    return analysis;
  }

  // Project cleanup operations
  async cleanupProjectFiles(projectPath, options = {}) {
    const {
      removeSettings = false,
      removeSettingsLocal = false,
      removeClaudeMd = false,
      removeEnvFile = false,
      removeCommands = false
    } = options;

    const projectPaths = getProjectConfigPaths(projectPath);
    const results = {
      removed: [],
      errors: []
    };

    const filesToRemove = [];

    if (removeSettings) filesToRemove.push({ name: 'settings', path: projectPaths.settings });
    if (removeSettingsLocal) filesToRemove.push({ name: 'settingsLocal', path: projectPaths.settingsLocal });
    if (removeClaudeMd) filesToRemove.push({ name: 'claudeMd', path: projectPaths.memory });
    if (removeEnvFile) filesToRemove.push({ name: 'envFile', path: path.join(projectPath, '.env') });
    if (removeCommands) filesToRemove.push({ name: 'commands', path: projectPaths.commands });

    for (const file of filesToRemove) {
      try {
        if (await fs.pathExists(file.path)) {
          await fs.remove(file.path);
          results.removed.push(file.name);
        }
      } catch (error) {
        results.errors.push({ file: file.name, error: error.message });
      }
    }

    return results;
  }

  // Directory operations
  async ensureProjectDirectories(projectPath) {
    const projectPaths = getProjectConfigPaths(projectPath);
    
    try {
      await fs.ensureDir(path.dirname(projectPaths.settings)); // .claude directory
      await fs.ensureDir(projectPaths.commands); // commands directory
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to create project directories: ${error.message}`);
    }
  }
}

module.exports = ProjectOperations;