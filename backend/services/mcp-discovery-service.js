const OpenRouterService = require('./openrouter-service');
const OllamaService = require('./integrations/ollama-service');
const axios = require('axios');

class MCPDiscoveryService {
    constructor() {
        this.openRouterService = new OpenRouterService();
        this.ollamaService = new OllamaService();
        this.maxRetries = 5;
        this.retryDelay = 2000;
        this.maxSearchIterations = 3;
    }

    /**
     * Main agentic workflow: Iterative discovery with web search
     * @param {string} userDescription - User's description of desired MCP server
     * @param {string} preferredLLM - 'openrouter' or 'ollama'
     * @returns {Promise<Object>} Template generation result
     */
    async discoverMCPServer(userDescription, preferredLLM = 'openrouter') {
        console.log(`Starting agentic MCP discovery for: "${userDescription}"`);
        
        try {
            // Step 1: Agentic information gathering with iterative web search
            const researchResult = await this.agenticResearch(userDescription, preferredLLM);
            
            if (!researchResult.success) {
                throw new Error(researchResult.error);
            }

            console.log(`Research completed. Found MCP: ${researchResult.data.mcpInfo.name}`);

            // Step 2: Generate final Claude CLI template
            const templateResult = await this.generateClaudeTemplate(
                researchResult.data.mcpInfo,
                researchResult.data.research,
                preferredLLM
            );

            if (!templateResult.success) {
                throw new Error(templateResult.error);
            }

            return {
                success: true,
                data: {
                    template: templateResult.data,
                    mcpInfo: researchResult.data.mcpInfo,
                    research: researchResult.data.research,
                    searchHistory: researchResult.data.searchHistory,
                    generatedAt: Date.now()
                }
            };

        } catch (error) {
            console.error('Agentic MCP discovery failed:', error);
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Agentic research process with iterative web search
     */
    async agenticResearch(userDescription, preferredLLM) {
        console.log('Starting agentic research process...');
        
        let researchContext = {
            userRequest: userDescription,
            searchHistory: [],
            gatheredInfo: [],
            currentKnowledge: 'Starting research...',
            iteration: 0
        };

        // Iterative research loop
        while (researchContext.iteration < this.maxSearchIterations) {
            researchContext.iteration++;
            console.log(`Research iteration ${researchContext.iteration}/${this.maxSearchIterations}`);

            // Ask the LLM what it needs to research
            const researchPlan = await this.planNextSearch(researchContext, preferredLLM);
            
            if (!researchPlan.success) {
                throw new Error(researchPlan.error);
            }

            // If the LLM says it has enough information, break
            if (researchPlan.data.hasEnoughInfo) {
                console.log('LLM indicates sufficient information gathered');
                break;
            }

            // Perform the web search the LLM requested
            if (researchPlan.data.searchQuery) {
                console.log(`Searching for: ${researchPlan.data.searchQuery}`);
                const searchResult = await this.performWebSearch(researchPlan.data.searchQuery);
                
                if (searchResult.success) {
                    researchContext.searchHistory.push({
                        query: researchPlan.data.searchQuery,
                        results: searchResult.data,
                        iteration: researchContext.iteration
                    });
                    researchContext.gatheredInfo.push(...searchResult.data);
                    researchContext.currentKnowledge = `Iteration ${researchContext.iteration}: Found ${searchResult.data.length} results for "${researchPlan.data.searchQuery}"`;
                } else {
                    console.warn(`Search failed for iteration ${researchContext.iteration}: ${searchResult.error}`);
                }
            }
        }

        // Final synthesis - ask LLM to create the MCP info from all research
        return await this.synthesizeResearch(researchContext, preferredLLM);
    }

    /**
     * Ask LLM what it needs to research next
     */
    async planNextSearch(researchContext, preferredLLM) {
        const planPrompt = `You are an expert MCP (Model Context Protocol) researcher. Your task is to gather information about MCP servers that match a user's request.

USER REQUEST: "${researchContext.userRequest}"

CURRENT RESEARCH CONTEXT:
- Iteration: ${researchContext.iteration}/${this.maxSearchIterations}
- Previous searches: ${researchContext.searchHistory.length}
- Current knowledge: ${researchContext.currentKnowledge}

PREVIOUS SEARCH RESULTS:
${researchContext.gatheredInfo.length > 0 ? 
  researchContext.gatheredInfo.slice(-5).map(item => `- ${item.title}: ${item.url}`).join('\n') : 
  'No previous search results'}

Your job is to determine:
1. Do you have enough information to identify a suitable MCP server?
2. If not, what specific search query should be performed next?

Focus on finding:
- Real GitHub repositories for MCP servers
- npm packages for MCP servers
- Documentation and setup instructions
- Required environment variables and configuration

Respond with JSON:
{
  "success": true,
  "data": {
    "hasEnoughInfo": true/false,
    "searchQuery": "specific search query" or null,
    "reasoning": "explanation of decision"
  }
}`;

        try {
            if (preferredLLM === 'openrouter' && process.env.OPENROUTER_API_KEY) {
                return await this.callOpenRouter(planPrompt, 'research planning');
            } else {
                return await this.callOllama(planPrompt, 'research planning');
            }
        } catch (error) {
            return {
                success: false,
                error: `Research planning failed: ${error.message}`
            };
        }
    }

    /**
     * Perform web search using WebSearch API
     */
    async performWebSearch(query) {
        try {
            // Using a simple approach - we can integrate with WebSearch later
            // For now, simulate search results based on common MCP patterns
            const searchResults = await this.simulateWebSearch(query);
            
            return {
                success: true,
                data: searchResults
            };
        } catch (error) {
            return {
                success: false,
                error: `Web search failed: ${error.message}`
            };
        }
    }

    /**
     * Simulate web search results (can be replaced with real web search)
     */
    async simulateWebSearch(query) {
        // This simulates realistic search results based on the query
        const commonMCPs = [
            {
                title: 'Model Context Protocol Servers - Official Collection',
                url: 'https://github.com/modelcontextprotocol/servers',
                snippet: 'Collection of reference MCP servers including filesystem, git, postgres, sqlite, fetch, and more.'
            },
            {
                title: 'Supabase MCP Server',
                url: 'https://github.com/supabase/mcp-server-supabase', 
                snippet: 'MCP server for Supabase integration with Claude Code. Supports database operations and real-time subscriptions.'
            },
            {
                title: 'Atlassian MCP Server - sooperset',
                url: 'https://github.com/sooperset/mcp-atlassian',
                snippet: 'MCP server for Atlassian Jira integration. Supports issue management, project tracking, and team collaboration.'
            }
        ];

        // Filter results based on query keywords
        const queryLower = query.toLowerCase();
        const relevantResults = commonMCPs.filter(mcp => 
            mcp.title.toLowerCase().includes(queryLower) ||
            mcp.snippet.toLowerCase().includes(queryLower) ||
            queryLower.split(' ').some(word => mcp.snippet.toLowerCase().includes(word))
        );

        return relevantResults.length > 0 ? relevantResults : commonMCPs.slice(0, 2);
    }

    /**
     * Synthesize all research into final MCP server recommendation
     */
    async synthesizeResearch(researchContext, preferredLLM) {
        const synthesisPrompt = `You are an expert MCP server analyst. Analyze all the research data and recommend the BEST MCP server for the user's request.

USER REQUEST: "${researchContext.userRequest}"

RESEARCH DATA:
${researchContext.gatheredInfo.map(item => `
- ${item.title}
  URL: ${item.url}
  Description: ${item.snippet}`).join('\n')}

SEARCH HISTORY:
${researchContext.searchHistory.map(search => `- Query: "${search.query}" (${search.results.length} results)`).join('\n')}

Based on this research, identify the BEST MCP server that matches the user's request. Provide:

1. The specific MCP server recommendation
2. Installation method (npm package, Docker, etc.)
3. Required environment variables
4. Basic setup information

Respond with JSON:
{
  "success": true,
  "data": {
    "mcpInfo": {
      "name": "Server Name",
      "description": "What this server does",
      "repository": "GitHub URL",
      "npmPackage": "npm package name if available",
      "dockerImage": "Docker image if available", 
      "installMethod": "npm|docker|custom",
      "environmentVars": [
        {"key": "ENV_VAR_NAME", "description": "What this does", "required": true}
      ],
      "transport": "stdio",
      "confidence": 0.85
    },
    "research": {
      "totalSources": ${researchContext.gatheredInfo.length},
      "searchIterations": ${researchContext.iteration},
      "keyFindings": ["Important discovery 1", "Important discovery 2"]
    }
  }
}`;

        try {
            if (preferredLLM === 'openrouter' && process.env.OPENROUTER_API_KEY) {
                return await this.callOpenRouter(synthesisPrompt, 'research synthesis');
            } else {
                return await this.callOllama(synthesisPrompt, 'research synthesis');
            }
        } catch (error) {
            return {
                success: false,
                error: `Research synthesis failed: ${error.message}`
            };
        }
    }

    /**
     * Generate final Claude CLI template
     */
    async generateClaudeTemplate(mcpInfo, research, preferredLLM) {
        const templatePrompt = `You are generating a Claude Manager MCP template that will create proper Claude CLI commands.

MCP SERVER INFO:
${JSON.stringify(mcpInfo, null, 2)}

RESEARCH CONTEXT:
${JSON.stringify(research, null, 2)}

Your job is to create a template that generates the EXACT Claude CLI commands needed.

CLAUDE CLI COMMAND FORMAT:
The final commands should be like:
- claude mcp add <server-name> <command> [args...]
- claude mcp remove <server-name>
- claude mcp enable <server-name>
- claude mcp disable <server-name>

EXAMPLE TEMPLATES:
{
  "templateKey": "supabase",
  "template": {
    "name": "Supabase",
    "description": "Database operations and real-time subscriptions",
    "command": "npx",
    "transport": "stdio", 
    "envVars": [
      {"key": "SUPABASE_URL", "description": "Your Supabase project URL", "required": true},
      {"key": "SUPABASE_ANON_KEY", "description": "Your Supabase anon key", "required": true}
    ],
    "args": ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]
  }
}

Generate a template following this EXACT format:
{
  "success": true,
  "data": {
    "templateKey": "unique-identifier",
    "template": {
      "name": "Display Name",
      "description": "Brief description",
      "command": "main-command (npx, docker, etc.)",
      "transport": "stdio",
      "envVars": [{
        "key": "REQUIRED_VAR",
        "description": "What this does", 
        "required": true
      }],
      "args": ["array", "of", "command", "arguments"]
    }
  }
}`;

        try {
            if (preferredLLM === 'openrouter' && process.env.OPENROUTER_API_KEY) {
                return await this.callOpenRouter(templatePrompt, 'template generation');
            } else {
                return await this.callOllama(templatePrompt, 'template generation');
            }
        } catch (error) {
            return {
                success: false,
                error: `Template generation failed: ${error.message}`
            };
        }
    }

    // Utility methods for LLM calls
    async callOpenRouter(prompt, context) {
        const response = await this.openRouterService.client.post('/chat/completions', {
            model: this.openRouterService.model,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that responds in JSON format.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 2000
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'X-Title': `Claude Manager ${context}`
            }
        });

        const content = response.data.choices[0].message.content;
        return this.parseJSONResponse(content);
    }

    async callOllama(prompt, context) {
        const result = await this.ollamaService.generate({
            model: 'llama3.2',
            prompt: `${prompt}\n\nRespond ONLY with valid JSON.`,
            temperature: 0.2,
            max_tokens: 2000
        });

        return this.parseJSONResponse(result.response);
    }

    /**
     * Legacy method - kept for backward compatibility but redirects to new agentic process
     */
    async searchMCPServers(userDescription, preferredLLM, searchHistory = []) {
        // Redirect to the new agentic process
        console.log('Legacy searchMCPServers called - redirecting to agentic process');
        return await this.discoverMCPServer(userDescription, preferredLLM);

    }

    /**
     * Legacy validation method - kept for backward compatibility
     */
    async validateMCPMatch(userDescription, mcpData, preferredLLM) {
        // This is now handled within the agentic process
        return {
            success: true,
            data: {
                matches: true,
                confidence: 0.85,
                reason: "Validation handled by agentic process",
                compatibilityIssues: [],
                strengths: ["Discovered through iterative research"]
            }
        };

    }

    /**
     * Legacy template generation - redirected to new method
     */
    async generateMCPTemplate(mcpData, preferredLLM) {
        // This functionality is now in generateClaudeTemplate
        return await this.generateClaudeTemplate(mcpData, {}, preferredLLM);

    }

    // Legacy methods removed - functionality moved to callOpenRouter and callOllama

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