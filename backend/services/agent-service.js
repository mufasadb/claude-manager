const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { validatePath } = require('../utils/path-utils');

class AgentService {
    constructor() {
        this.validNamePattern = /^[a-zA-Z0-9_-]+$/;
        this.asciiPresets = [
            { face: '( ͡° ͜ʖ ͡°)', name: 'Mischievous', description: 'Playful problem solver' },
            { face: '¯\\_(ツ)_/¯', name: 'Casual', description: 'Relaxed and easy-going' },
            { face: '(╯°□°）╯', name: 'Frustrated', description: 'Intense bug hunter' },
            { face: 'ಠ_ಠ', name: 'Skeptical', description: 'Critical code reviewer' },
            { face: '(つ◉益◉)つ', name: 'Aggressive', description: 'Determined optimizer' },
            { face: 'ᕕ( ᐛ )ᕗ', name: 'Enthusiastic', description: 'Energetic helper' },
            { face: '(◕‿◕)', name: 'Friendly', description: 'Helpful assistant' },
            { face: '(⌐■_■)', name: 'Cool', description: 'Smooth operator' },
            { face: '(づ｡◕‿‿◕｡)づ', name: 'Supportive', description: 'Encouraging mentor' },
            { face: '(╬ಠ益ಠ)', name: 'Intense', description: 'Focused specialist' },
            { face: '٩(◕‿◕)۶', name: 'Happy', description: 'Cheerful collaborator' },
            { face: '(｡◕‿◕｡)', name: 'Sweet', description: 'Kind helper' },
            { face: '(°o°)', name: 'Surprised', description: 'Discovery specialist' },
            { face: '(¬‿¬)', name: 'Clever', description: 'Smart strategist' },
            { face: '(ಥ﹏ಥ)', name: 'Emotional', description: 'Empathetic debugger' }
        ];
        
        this.colorPresets = [
            { color: '#ff0000', name: 'Red', hex: '#ff0000' },
            { color: '#00ff00', name: 'Green', hex: '#00ff00' },
            { color: '#0000ff', name: 'Blue', hex: '#0000ff' },
            { color: '#ffff00', name: 'Yellow', hex: '#ffff00' },
            { color: '#ff00ff', name: 'Magenta', hex: '#ff00ff' },
            { color: '#00ffff', name: 'Cyan', hex: '#00ffff' },
            { color: '#ffffff', name: 'White', hex: '#ffffff' },
            { color: '#ffa500', name: 'Orange', hex: '#ffa500' }
        ];

        this.defaultTools = [
            'Bash', 'Write', 'Read', 'Edit', 'Glob', 'Grep', 'Task', 
            'WebFetch', 'WebSearch', 'TodoWrite'
        ];
    }

    validateAgentName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Agent name is required' };
        }
        
        if (!this.validNamePattern.test(name)) {
            return { valid: false, error: 'Agent name can only contain letters, numbers, hyphens, and underscores' };
        }
        
        if (name.length < 2) {
            return { valid: false, error: 'Agent name must be at least 2 characters long' };
        }
        
        if (name.length > 50) {
            return { valid: false, error: 'Agent name must be 50 characters or less' };
        }
        
        return { valid: true };
    }

    getAgentsDirectory(scope, projectName = null) {
        if (scope === 'user') {
            return path.join(require('os').homedir(), '.claude', 'agents');
        } else if (scope === 'project' && projectName) {
            // Get project path from registry
            const registryPath = path.join(require('os').homedir(), '.claude-manager', 'registry.json');
            if (fs.existsSync(registryPath)) {
                const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
                const project = registry.projects[projectName];
                if (project && project.path) {
                    return path.join(project.path, '.claude', 'agents');
                }
            }
            throw new Error(`Project ${projectName} not found in registry`);
        } else {
            throw new Error('Invalid scope or missing project name');
        }
    }

    async createAgent(agentName, description, scope, projectName = null, textFace = '(◕‿◕)', textColor = '#00ff00', tools = null) {
        try {
            // Validate inputs
            const nameValidation = this.validateAgentName(agentName);
            if (!nameValidation.valid) {
                throw new Error(nameValidation.error);
            }

            if (!description || description.trim().length < 20) {
                throw new Error('Description must be at least 20 characters long for good agent generation');
            }

            if (!['user', 'project'].includes(scope)) {
                throw new Error('Scope must be either "user" or "project"');
            }

            if (scope === 'project' && !projectName) {
                throw new Error('Project name is required for project scope');
            }

            // Validate text face and color
            const validFace = this.asciiPresets.find(preset => preset.face === textFace);
            if (!validFace) {
                throw new Error('Invalid text face selected');
            }

            // Use default tools if none provided
            if (!tools || !Array.isArray(tools)) {
                tools = [...this.defaultTools];
            }

            // Get target directory
            const agentsDir = this.getAgentsDirectory(scope, projectName);
            await fs.ensureDir(agentsDir);

            // Check if agent already exists
            const agentFile = path.join(agentsDir, `${agentName}.md`);
            if (await fs.pathExists(agentFile)) {
                throw new Error(`Agent "${agentName}" already exists`);
            }

            // Validate path security
            if (!validatePath(agentFile, [agentsDir])) {
                throw new Error('Invalid agent file path');
            }

            // Generate agent content using Claude Code
            const agentContent = await this.generateAgentContent(agentName, description, textFace, textColor, tools);
            
            // Write the agent file
            await fs.writeFile(agentFile, agentContent, 'utf8');

            return {
                success: true,
                agentPath: agentFile,
                relativePath: `${agentName}.md`,
                output: 'Agent created successfully'
            };

        } catch (error) {
            console.error('Error creating agent:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async generateAgentContent(agentName, description, textFace, textColor, tools) {
        // For now, generate content directly
        // In production, you could call Claude Code to generate more sophisticated agent prompts
        
        const title = agentName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        const personalityNote = this.asciiPresets.find(preset => preset.face === textFace)?.description || 'helpful assistant';
        
        const toolsList = tools.join(', ');

        return `---
name: ${agentName}
description: ${description}
tools: [${tools.map(tool => `"${tool}"`).join(', ')}]
textFace: "${textFace}"
textColor: "${textColor}"
---

You are ${textFace} ${title}, a specialized ${personalityNote} for Claude Code.

## Your Role
${description}

## Your Personality
- Express yourself with the text face ${textFace} when appropriate
- Maintain a ${personalityNote} demeanor
- Be helpful, focused, and efficient
- Stay in character while being professional

## Your Capabilities
You have access to these tools: ${toolsList}

## Guidelines
1. Always greet the user with your text face when starting a conversation
2. Focus on your specialized area while being helpful
3. Provide clear, actionable guidance
4. Use your personality to make interactions engaging
5. Be concise but thorough in your responses

## Example Introduction
${textFace} Hello! I'm ${title}, your ${personalityNote}. I'm here to help with: ${description}

How can I assist you today?
`;
    }

    async listExistingAgents(scope, projectName = null) {
        try {
            const agentsDir = this.getAgentsDirectory(scope, projectName);
            
            if (!await fs.pathExists(agentsDir)) {
                return [];
            }

            const agents = [];
            const entries = await fs.readdir(agentsDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.md')) {
                    const agentName = entry.name.replace('.md', '');
                    const fullPath = path.join(agentsDir, entry.name);
                    
                    try {
                        const content = await fs.readFile(fullPath, 'utf8');
                        const metadata = this.extractAgentMetadata(content);
                        
                        agents.push({
                            name: agentName,
                            description: metadata.description || 'No description available',
                            textFace: metadata.textFace || '(◕‿◕)',
                            textColor: metadata.textColor || '#00ff00',
                            tools: metadata.tools || [],
                            path: fullPath,
                            relativePath: `${agentName}.md`
                        });
                    } catch (error) {
                        console.warn(`Error reading agent file ${fullPath}:`, error.message);
                    }
                }
            }
            
            return agents.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Error listing existing agents:', error);
            return [];
        }
    }

    extractAgentMetadata(content) {
        const metadata = {
            description: null,
            textFace: null,
            textColor: null,
            tools: []
        };

        // Try to extract metadata from YAML frontmatter
        const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (yamlMatch) {
            const yamlContent = yamlMatch[1];
            
            // Extract description
            const descMatch = yamlContent.match(/description:\s*["']?(.*?)["']?\s*$/m);
            if (descMatch) {
                metadata.description = descMatch[1].trim();
            }
            
            // Extract textFace
            const faceMatch = yamlContent.match(/textFace:\s*["']?(.*?)["']?\s*$/m);
            if (faceMatch) {
                metadata.textFace = faceMatch[1].trim();
            }
            
            // Extract textColor
            const colorMatch = yamlContent.match(/textColor:\s*["']?(.*?)["']?\s*$/m);
            if (colorMatch) {
                metadata.textColor = colorMatch[1].trim();
            }
            
            // Extract tools array
            const toolsMatch = yamlContent.match(/tools:\s*\[(.*?)\]/s);
            if (toolsMatch) {
                try {
                    const toolsString = '[' + toolsMatch[1] + ']';
                    metadata.tools = JSON.parse(toolsString);
                } catch (e) {
                    // Fallback: parse manually
                    const toolsList = toolsMatch[1].split(',').map(tool => 
                        tool.trim().replace(/["']/g, '')
                    ).filter(tool => tool.length > 0);
                    metadata.tools = toolsList;
                }
            }
        }

        // Try to extract text face from content (look for common patterns)
        const faceMatch = content.match(/([（(][^)）]*[)）])/);
        if (faceMatch) {
            metadata.textFace = faceMatch[1];
        }

        return metadata;
    }

    async deleteAgent(agentName, scope, projectName = null) {
        try {
            const agentsDir = this.getAgentsDirectory(scope, projectName);
            const agentFile = path.join(agentsDir, `${agentName}.md`);

            if (!await fs.pathExists(agentFile)) {
                throw new Error(`Agent "${agentName}" not found`);
            }

            // Validate path security
            if (!validatePath(agentFile, [agentsDir])) {
                throw new Error('Invalid agent file path');
            }

            await fs.remove(agentFile);

            return {
                success: true,
                message: `Agent "${agentName}" deleted successfully`
            };
        } catch (error) {
            console.error('Error deleting agent:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getTemplates() {
        return {
            asciiPresets: this.asciiPresets,
            colorPresets: this.colorPresets,
            defaultTools: this.defaultTools
        };
    }

    getAvailableTools() {
        // In a real implementation, this could dynamically discover available tools
        // For now, return the default set plus common MCP tools
        return [
            ...this.defaultTools,
            // Add common MCP tools that might be available
            'mcp__context7__resolve-library-id',
            'mcp__context7__get-library-docs',
            'mcp__puppeteer__puppeteer_navigate',
            'mcp__puppeteer__puppeteer_screenshot',
            'mcp__notion__API-post-search',
            'mcp__figma__add_figma_file'
        ];
    }
}

module.exports = AgentService;