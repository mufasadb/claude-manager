const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { validatePath } = require('../utils/path-utils');
const OpenRouterService = require('./openrouter-service');

class CommandService {
    constructor() {
        this.validNamePattern = /^[a-zA-Z0-9_-]+$/;
        this.openRouterService = new OpenRouterService();
    }

    validateCommandName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Command name is required' };
        }
        
        if (!this.validNamePattern.test(name)) {
            return { valid: false, error: 'Command name can only contain letters, numbers, hyphens, and underscores' };
        }
        
        if (name.length < 2) {
            return { valid: false, error: 'Command name must be at least 2 characters long' };
        }
        
        if (name.length > 50) {
            return { valid: false, error: 'Command name must be 50 characters or less' };
        }
        
        return { valid: true };
    }

    getCommandsDirectory(scope, projectName = null) {
        if (scope === 'user') {
            return path.join(require('os').homedir(), '.claude', 'commands');
        } else if (scope === 'project' && projectName) {
            // Get project path from registry
            const registryPath = path.join(require('os').homedir(), '.claude-manager', 'registry.json');
            if (fs.existsSync(registryPath)) {
                const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
                const project = registry.projects[projectName];
                if (project && project.path) {
                    return path.join(project.path, '.claude', 'commands');
                }
            }
            throw new Error(`Project ${projectName} not found in registry`);
        } else {
            throw new Error('Invalid scope or missing project name');
        }
    }

    async createSlashCommand(commandName, instructions, scope, category = null, projectName = null) {
        try {
            // Validate inputs
            const nameValidation = this.validateCommandName(commandName);
            if (!nameValidation.valid) {
                throw new Error(nameValidation.error);
            }

            if (!instructions || instructions.trim().length < 10) {
                throw new Error('Instructions must be at least 10 characters long');
            }

            if (!['user', 'project'].includes(scope)) {
                throw new Error('Scope must be either "user" or "project"');
            }

            if (scope === 'project' && !projectName) {
                throw new Error('Project name is required for project scope');
            }

            // Get target directory
            const baseCommandsDir = this.getCommandsDirectory(scope, projectName);
            const targetDir = category 
                ? path.join(baseCommandsDir, category)
                : baseCommandsDir;

            // Ensure directory exists
            await fs.ensureDir(targetDir);

            // Check if command already exists
            const commandFile = path.join(targetDir, `${commandName}.md`);
            if (await fs.pathExists(commandFile)) {
                throw new Error(`Command "${commandName}" already exists in ${category ? `${category}/` : ''}${commandName}.md`);
            }

            // Validate path security
            if (!validatePath(commandFile, [baseCommandsDir])) {
                throw new Error('Invalid command file path');
            }

            // Generate command content using OpenRouter
            console.log(`Generating slash command with OpenRouter: ${commandName}`);
            const generationResult = await this.openRouterService.generateSlashCommand(
                commandName, 
                instructions, 
                category
            );

            if (!generationResult.success) {
                throw new Error(generationResult.error || 'Failed to generate command content with OpenRouter');
            }

            // Write the command file
            await fs.writeFile(commandFile, generationResult.content, 'utf8');

            return {
                success: true,
                commandPath: commandFile,
                relativePath: category ? `${category}/${commandName}.md` : `${commandName}.md`,
                output: 'Slash command created successfully with AI generation',
                description: generationResult.description,
                allowedTools: generationResult.allowedTools,
                suggestedCategory: generationResult.suggestedCategory
            };

        } catch (error) {
            console.error('Error creating slash command:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    generateClaudePrompt(commandName, description, category, commandFile) {
        const categoryPath = category ? `${category}/` : '';
        const relativePath = path.relative(process.cwd(), commandFile);
        
        return `Create a new Claude slash command with the following requirements:

Command Name: ${commandName}
Description: ${description}
Category: ${category || 'none'}
Target File: ${relativePath}

Create a markdown file at the specified path with the following structure:

1. YAML frontmatter with:
   - description field containing the provided description
   - allowed-tools array with common tools like ["Bash", "Write", "Read", "Edit"]
   
2. A clear, actionable prompt that:
   - Has a descriptive title using the command name
   - Explains what the command does in detail
   - Includes step-by-step process if applicable
   - Uses proper markdown formatting
   - Includes $ARGUMENTS placeholder for command arguments
   - Provides examples or usage notes where helpful

3. Follow Claude Code slash command best practices:
   - Make the prompt clear and specific
   - Include proper error handling guidance
   - Use markdown headers for organization
   - Ensure the command is self-contained and actionable

The file should be immediately usable as a Claude Code slash command.`;
    }

    generateSlashCommandContent(commandName, description, category) {
        const title = commandName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        return `---
description: "${description}"
allowed-tools: ["Bash", "Write", "Read", "Edit", "Glob", "Grep"]
---

# ${title}

${description}

## Process

1. Analyze the current situation and requirements
2. Plan the necessary steps to accomplish the task
3. Execute the implementation with proper error handling
4. Verify the results and provide feedback

## Arguments

$ARGUMENTS

## Usage Notes

- This command was generated by Claude Manager
- Customize the implementation based on your specific needs
- Follow security best practices and validate all inputs
- Test thoroughly before using in production environments

## Examples

\`\`\`bash
# Example usage:
/${category ? `${category}:${commandName}` : commandName} [your-arguments-here]
\`\`\`
`;
    }

    executeClaudeCommand(prompt, workingDir) {
        return new Promise((resolve, reject) => {
            const claude = spawn('claude', [prompt], {
                cwd: workingDir,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            claude.stdout.on('data', (data) => {
                output += data.toString();
            });

            claude.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            claude.on('close', (code) => {
                if (code === 0) {
                    resolve({ output, exitCode: code });
                } else {
                    reject(new Error(`Claude command failed with exit code ${code}: ${errorOutput}`));
                }
            });

            claude.on('error', (error) => {
                reject(new Error(`Failed to execute Claude command: ${error.message}`));
            });

            // Set timeout for command execution
            setTimeout(() => {
                claude.kill('SIGTERM');
                reject(new Error('Claude command timed out after 60 seconds'));
            }, 60000);
        });
    }

    async listExistingCommands(scope, projectName = null) {
        try {
            const commandsDir = this.getCommandsDirectory(scope, projectName);
            
            if (!await fs.pathExists(commandsDir)) {
                return [];
            }

            const commands = [];
            await this.scanCommandsDirectory(commandsDir, '', commands);
            
            return commands.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Error listing existing commands:', error);
            return [];
        }
    }

    async scanCommandsDirectory(dir, prefix, commands) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
                await this.scanCommandsDirectory(fullPath, newPrefix, commands);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const commandName = entry.name.replace('.md', '');
                const category = prefix || null;
                
                try {
                    const content = await fs.readFile(fullPath, 'utf8');
                    const description = this.extractDescriptionFromMarkdown(content);
                    
                    commands.push({
                        name: commandName,
                        category,
                        description,
                        path: fullPath,
                        relativePath: category ? `${category}/${commandName}.md` : `${commandName}.md`
                    });
                } catch (error) {
                    console.warn(`Error reading command file ${fullPath}:`, error.message);
                }
            }
        }
    }

    extractDescriptionFromMarkdown(content) {
        // Try to extract description from YAML frontmatter
        const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (yamlMatch) {
            const yamlContent = yamlMatch[1];
            const descMatch = yamlContent.match(/description:\s*["']?(.*?)["']?\s*$/m);
            if (descMatch) {
                return descMatch[1].trim();
            }
        }
        
        // Fallback: try to get first paragraph after the first header
        const lines = content.split('\n');
        let foundHeader = false;
        for (const line of lines) {
            if (line.startsWith('#') && !foundHeader) {
                foundHeader = true;
                continue;
            }
            if (foundHeader && line.trim() && !line.startsWith('#')) {
                return line.trim();
            }
        }
        
        return 'No description available';
    }

    async deleteSlashCommand(scope, relativePath, projectName = null) {
        try {
            if (!['user', 'project'].includes(scope)) {
                throw new Error('Scope must be either "user" or "project"');
            }

            if (scope === 'project' && !projectName) {
                throw new Error('Project name is required for project scope');
            }

            if (!relativePath || !relativePath.endsWith('.md')) {
                throw new Error('Invalid command file path');
            }

            // Get target directory
            const baseCommandsDir = this.getCommandsDirectory(scope, projectName);
            const commandFile = path.join(baseCommandsDir, relativePath);

            // Validate path security
            if (!validatePath(commandFile, [baseCommandsDir])) {
                throw new Error('Invalid command file path');
            }

            // Check if command file exists
            if (!await fs.pathExists(commandFile)) {
                throw new Error(`Command file ${relativePath} does not exist`);
            }

            // Delete the command file
            await fs.remove(commandFile);

            // Check if we need to clean up empty directories
            const commandDir = path.dirname(commandFile);
            if (commandDir !== baseCommandsDir) {
                try {
                    // Check if directory is empty and remove if so
                    const files = await fs.readdir(commandDir);
                    if (files.length === 0) {
                        await fs.rmdir(commandDir);
                    }
                } catch (error) {
                    // Ignore errors when cleaning up directories
                    console.warn('Warning: Could not clean up empty directory:', error.message);
                }
            }

            return {
                success: true,
                message: `Successfully deleted command: ${relativePath}`,
                commandPath: commandFile
            };

        } catch (error) {
            console.error('Error deleting slash command:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = CommandService;