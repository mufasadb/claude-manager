const OpenRouterService = require('./openrouter-service');
const OllamaService = require('./integrations/ollama-service');

class MCPDiscoveryService {
    constructor() {
        this.openRouterService = new OpenRouterService();
        this.ollamaService = new OllamaService();
        this.maxRetries = 5;
        this.retryDelay = 2000;
    }

    /**
     * Main workflow: Discover, validate, and generate MCP template
     * @param {string} userDescription - User's description of desired MCP server
     * @param {string} preferredLLM - 'openrouter' or 'ollama'
     * @returns {Promise<Object>} Template generation result
     */
    async discoverMCPServer(userDescription, preferredLLM = 'openrouter') {
        console.log(`Starting MCP discovery for: "${userDescription}"`);
        
        let attempt = 0;
        let lastError = null;
        let searchHistory = [];

        while (attempt < this.maxRetries) {
            attempt++;
            
            try {
                console.log(`Discovery attempt ${attempt}/${this.maxRetries}`);
                
                // Step 1: Search for MCP servers
                const searchResult = await this.searchMCPServers(
                    userDescription, 
                    preferredLLM, 
                    searchHistory
                );
                
                if (!searchResult.success) {
                    throw new Error(searchResult.error);
                }

                console.log(`Found potential MCP: ${searchResult.data.name}`);
                searchHistory.push(searchResult.data.name);

                // Step 2: Validate if the found server matches criteria
                const validationResult = await this.validateMCPMatch(
                    userDescription,
                    searchResult.data,
                    preferredLLM
                );

                if (!validationResult.success) {
                    throw new Error(validationResult.error);
                }

                if (!validationResult.data.matches) {
                    console.log(`MCP ${searchResult.data.name} doesn't match criteria: ${validationResult.data.reason}`);
                    lastError = new Error(`No match: ${validationResult.data.reason}`);
                    continue;
                }

                console.log(`MCP ${searchResult.data.name} validated successfully`);

                // Step 3: Generate template
                const templateResult = await this.generateMCPTemplate(
                    searchResult.data,
                    preferredLLM
                );

                if (!templateResult.success) {
                    throw new Error(templateResult.error);
                }

                return {
                    success: true,
                    data: {
                        template: templateResult.data,
                        mcpInfo: searchResult.data,
                        attempts: attempt,
                        searchHistory,
                        generatedAt: Date.now()
                    }
                };

            } catch (error) {
                console.log(`Attempt ${attempt} failed: ${error.message}`);
                lastError = error;
                
                if (attempt < this.maxRetries) {
                    console.log(`Waiting ${this.retryDelay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }

        return {
            success: false,
            error: `Could not find suitable MCP server after ${this.maxRetries} attempts`,
            lastError: lastError?.message,
            searchHistory,
            attempts: this.maxRetries
        };
    }

    /**
     * Step 1: Search for MCP servers based on user description
     */
    async searchMCPServers(userDescription, preferredLLM, searchHistory = []) {
        const excludeList = searchHistory.length > 0 
            ? `\n\nDO NOT suggest these already tried servers: ${searchHistory.join(', ')}`
            : '';

        const searchPrompt = `You are an expert in Model Context Protocol (MCP) servers for Claude Code with access to real-time web search. Your task is to find the BEST MCP server that matches the user's requirements by searching the web.

USER REQUEST: "${userDescription}"

CRITICAL INSTRUCTIONS:
1. You MUST search the web for REAL MCP servers - do not make up or hallucinate repositories
2. Search GitHub for repositories containing "mcp" and the relevant technology/service mentioned
3. Look for official MCP server repositories, documentation, and npm packages
4. Check if the repository exists and is actively maintained

SPECIFIC SEARCH AREAS:
- GitHub: Search for "mcp [technology]" (e.g., "mcp atlassian", "mcp postgres")
- Look for repositories like "@modelcontextprotocol/", "mcp-server-", "mcp-[service]"
- Check for official company MCP servers (Atlassian, Supabase, etc.)
- Verify the repository exists and has recent commits

EXAMPLE REAL MCP SERVERS TO REFERENCE:
- https://github.com/sooperset/mcp-atlassian (Atlassian/Jira)
- https://github.com/modelcontextprotocol/servers (Official collection)
- @modelcontextprotocol/server-* packages on npm

FOR ATLASSIAN SPECIFICALLY:
- The official Atlassian MCP server is at: https://github.com/sooperset/mcp-atlassian
- It requires JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN environment variables
- It uses Docker: "docker run -i --rm ghcr.io/sooperset/mcp-atlassian:latest"

${excludeList}

SEARCH THE WEB NOW and respond with REAL information about an ACTUAL MCP server:

{
  "success": true,
  "data": {
    "name": "Actual server name from repository",
    "description": "Real description from the repository",
    "repository": "Real GitHub URL that exists",
    "npmPackage": "Real npm package if it exists", 
    "command": "Real installation/run command from docs",
    "transport": "stdio/sse/websocket - check the actual transport used",
    "environmentVars": [
      {"key": "REAL_ENV_VAR", "description": "Actual description from docs", "required": true}
    ],
    "args": ["real", "arguments", "from", "repository"],
    "documentation": "Real documentation URL",
    "confidence": 0.85
  }
}`;

        try {
            if (preferredLLM === 'openrouter' && process.env.OPENROUTER_API_KEY) {
                return await this.searchWithOpenRouter(searchPrompt);
            } else {
                return await this.searchWithOllama(searchPrompt);
            }
        } catch (error) {
            console.error('Search failed:', error);
            return {
                success: false,
                error: `Search failed: ${error.message}`
            };
        }
    }

    /**
     * Step 2: Validate if found MCP server matches user criteria
     */
    async validateMCPMatch(userDescription, mcpData, preferredLLM) {
        const validationPrompt = `You are an expert validator for MCP server recommendations.

USER'S ORIGINAL REQUEST: "${userDescription}"

FOUND MCP SERVER:
Name: ${mcpData.name}
Description: ${mcpData.description}
Command: ${mcpData.command}
Repository: ${mcpData.repository || 'N/A'}
NPM Package: ${mcpData.npmPackage || 'N/A'}
Documentation: ${mcpData.documentation || 'N/A'}

VALIDATION CRITERIA:
1. Does this MCP server actually fulfill the user's request?
2. Is it compatible with Claude Code (stdio transport preferred)?
3. Does it seem legitimate and well-maintained?
4. Are the capabilities clearly matching what the user wants?

RESPOND WITH JSON:
{
  "success": true,
  "data": {
    "matches": true/false,
    "confidence": 0.85,
    "reason": "Explanation of why it matches or doesn't match",
    "compatibilityIssues": ["Any potential issues"],
    "strengths": ["What makes this a good match"]
  }
}`;

        try {
            if (preferredLLM === 'openrouter' && process.env.OPENROUTER_API_KEY) {
                return await this.validateWithOpenRouter(validationPrompt);
            } else {
                return await this.validateWithOllama(validationPrompt);
            }
        } catch (error) {
            console.error('Validation failed:', error);
            return {
                success: false,
                error: `Validation failed: ${error.message}`
            };
        }
    }

    /**
     * Step 3: Generate MCP template compatible with existing system
     */
    async generateMCPTemplate(mcpData, preferredLLM) {
        const templatePrompt = `You are generating an MCP server template for Claude Manager's template system.

MCP SERVER DATA:
${JSON.stringify(mcpData, null, 2)}

REQUIRED TEMPLATE FORMAT (must match exactly):
{
  "success": true,
  "data": {
    "templateKey": "unique-key-for-this-server",
    "template": {
      "name": "Display Name",
      "description": "Brief description for UI",
      "command": "main-command-to-run",
      "transport": "stdio",
      "envVars": [
        {
          "key": "REQUIRED_ENV_VAR",
          "description": "What this env var does",
          "required": true
        }
      ],
      "args": ["additional", "arguments", "if", "needed"]
    }
  }
}

TEMPLATE REQUIREMENTS:
1. templateKey: lowercase, hyphenated unique identifier
2. name: Human-readable name for UI
3. description: Clear, concise description (50-100 chars)
4. command: Primary command (npx, docker, etc.)
5. transport: Always "stdio" for Claude Code compatibility
6. envVars: Array of required environment variables with descriptions
7. args: Additional command arguments as array

EXISTING TEMPLATE EXAMPLES:
- supabase uses: command: "npx", args: ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]
- github uses: command: "npx", args: ["-y", "@modelcontextprotocol/server-github"]
- postgresql uses: command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"]

Generate a template that follows these exact patterns.`;

        try {
            if (preferredLLM === 'openrouter' && process.env.OPENROUTER_API_KEY) {
                return await this.generateWithOpenRouter(templatePrompt);
            } else {
                return await this.generateWithOllama(templatePrompt);
            }
        } catch (error) {
            console.error('Template generation failed:', error);
            return {
                success: false,
                error: `Template generation failed: ${error.message}`
            };
        }
    }

    // OpenRouter implementations
    async searchWithOpenRouter(prompt) {
        const response = await this.openRouterService.client.post('/chat/completions', {
            model: this.openRouterService.model,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that searches for MCP servers and responds in JSON format.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 2000
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'X-Title': 'Claude Manager MCP Search'
            }
        });

        const content = response.data.choices[0].message.content;
        return this.parseJSONResponse(content);
    }

    async validateWithOpenRouter(prompt) {
        const response = await this.openRouterService.client.post('/chat/completions', {
            model: this.openRouterService.model,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that validates MCP servers and responds in JSON format.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'X-Title': 'Claude Manager MCP Validation'
            }
        });

        const content = response.data.choices[0].message.content;
        return this.parseJSONResponse(content);
    }

    async generateWithOpenRouter(prompt) {
        const response = await this.openRouterService.client.post('/chat/completions', {
            model: this.openRouterService.model,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that generates MCP templates and responds in JSON format.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 1500
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'X-Title': 'Claude Manager MCP Template Generator'
            }
        });

        const content = response.data.choices[0].message.content;
        return this.parseJSONResponse(content);
    }

    // Ollama implementations
    async searchWithOllama(prompt) {
        const result = await this.ollamaService.generate({
            model: 'llama3.2',
            prompt: `${prompt}\n\nRespond ONLY with valid JSON.`,
            temperature: 0.3,
            max_tokens: 2000
        });

        return this.parseJSONResponse(result.response);
    }

    async validateWithOllama(prompt) {
        const result = await this.ollamaService.generate({
            model: 'llama3.2',
            prompt: `${prompt}\n\nRespond ONLY with valid JSON.`,
            temperature: 0.2,
            max_tokens: 1000
        });

        return this.parseJSONResponse(result.response);
    }

    async generateWithOllama(prompt) {
        const result = await this.ollamaService.generate({
            model: 'llama3.2',
            prompt: `${prompt}\n\nRespond ONLY with valid JSON.`,
            temperature: 0.1,
            max_tokens: 1500
        });

        return this.parseJSONResponse(result.response);
    }

    // Utility methods
    parseJSONResponse(content) {
        try {
            // First try direct parsing
            return JSON.parse(content);
        } catch (parseError) {
            // Try to extract JSON from code blocks or other formatting
            let cleanContent = content.trim()
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .replace(/^.*?(\{)/s, '$1')
                .replace(/(\}).*?$/s, '$1');

            try {
                return JSON.parse(cleanContent);
            } catch (secondError) {
                // Try to find JSON object in the response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                
                throw new Error(`Invalid JSON response: ${content.substring(0, 200)}...`);
            }
        }
    }

    async healthCheck() {
        const results = {
            openrouter: { available: false, error: null },
            ollama: { available: false, error: null }
        };

        // Check OpenRouter
        try {
            if (process.env.OPENROUTER_API_KEY) {
                this.openRouterService.validateApiKey();
                results.openrouter.available = true;
            } else {
                results.openrouter.error = 'API key not configured';
            }
        } catch (error) {
            results.openrouter.error = error.message;
        }

        // Check Ollama
        try {
            const ollamaHealth = await this.ollamaService.healthCheck();
            results.ollama = ollamaHealth;
        } catch (error) {
            results.ollama.error = error.message;
        }

        return {
            status: (results.openrouter.available || results.ollama.available) ? 'healthy' : 'unhealthy',
            services: results,
            recommendedService: results.openrouter.available ? 'openrouter' : 
                              results.ollama.available ? 'ollama' : null
        };
    }
}

module.exports = MCPDiscoveryService;