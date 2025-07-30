const path = require('path');
const os = require('os');

function getUserConfigPaths() {
  return {
    settings: path.join(os.homedir(), '.claude', 'settings.json'),
    settingsLocal: path.join(os.homedir(), '.claude', 'settings.local.json'),
    memory: path.join(os.homedir(), '.claude', 'CLAUDE.md'),
    commands: path.join(os.homedir(), '.claude', 'commands')
  };
}

function getProjectConfigPaths(projectPath) {
  return {
    settings: path.join(projectPath, '.claude', 'settings.json'),
    settingsLocal: path.join(projectPath, '.claude', 'settings.local.json'),
    memory: path.join(projectPath, 'CLAUDE.md'),
    commands: path.join(projectPath, '.claude', 'commands')
  };
}

function validatePath(filePath, allowedBasePaths) {
  const resolvedPath = path.resolve(filePath);
  return allowedBasePaths.some(basePath => {
    const resolvedBasePath = path.resolve(basePath);
    return resolvedPath.startsWith(resolvedBasePath);
  });
}

module.exports = {
  getUserConfigPaths,
  getProjectConfigPaths,
  validatePath
};