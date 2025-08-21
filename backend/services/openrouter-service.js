const axios = require('axios');

class OpenRouterService {
    constructor(claudeManagerInstance = null) {
        this.baseUrl = "https://openrouter.ai/api/v1";
        this.model = "openai/gpt-5-mini";
        this.maxRetries = 3;
        this.retryDelay = 2000; // ms
        this.rateLimitDelay = 1000; // ms between requests
        this.lastRequestTime = 0;
        this.claudeManagerInstance = claudeManagerInstance;
        
        // Create axios client with better configuration
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://claude-manager.dev',
                'X-Title': 'Claude Manager'
            }
        });

        // Add response interceptor for better error handling
        this.client.interceptors.response.use(
            response => response,
            error => this.handleAxiosError(error)
        );
    }

    // Enhanced error handling for OpenRouter API errors
    handleAxiosError(error) {
        if (error.response?.status === 401) {
            throw new Error('Invalid OpenRouter API key. Please check your OPENROUTER_API_KEY environment variable.');
        } else if (error.response?.status === 429) {
            throw new Error('OpenRouter rate limit exceeded. Please wait before making more requests.');
        } else if (error.response?.status === 402) {
            throw new Error('OpenRouter credits exhausted. Please add credits to your account.');
        } else if (error.response?.status === 503) {
            throw new Error('OpenRouter service temporarily unavailable. Please try again later.');
        } else if (error.code === 'ENOTFOUND') {
            throw new Error('Cannot connect to OpenRouter. Please check your internet connection.');
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error('OpenRouter request timed out. The service may be overloaded.');
        }
        throw error;
    }

    // Retry logic with exponential backoff
    async withRetry(operation, context = '') {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Rate limiting
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                if (timeSinceLastRequest < this.rateLimitDelay) {
                    await new Promise(resolve => 
                        setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
                    );
                }
                this.lastRequestTime = Date.now();

                return await operation();
            } catch (error) {
                lastError = error;
                
                // Don't retry on certain errors
                if (error.message.includes('Invalid') || 
                    error.message.includes('credits exhausted') ||
                    error.response?.status === 401 || 
                    error.response?.status === 402) {
                    throw error;
                }
                
                if (attempt < this.maxRetries) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    console.log(`OpenRouter ${context} attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw new Error(`OpenRouter ${context} failed after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    validateApiKey() {
        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error('OPENROUTER_API_KEY environment variable is required');
        }
    }

    createCommandGenerationPrompt(commandName, instructions, category, projectContext = null) {
        const categoryPath = category ? `${category}/` : '';
        
        // Add project-specific context if available
        const contextSection = projectContext ? `
<project_context>
PROJECT INFORMATION:
- Name: ${projectContext.name || 'Unknown'}
- Tech Stack: ${projectContext.framework || 'Unknown'}
- Package Manager: ${projectContext.packageManager || 'npm'}
- Available Scripts: ${projectContext.scripts ? projectContext.scripts.join(', ') : 'Unknown'}
- Dependencies: ${projectContext.dependencies ? projectContext.dependencies.slice(0, 8).join(', ') : 'Unknown'}
- File Types: ${projectContext.fileTypes ? projectContext.fileTypes.join(', ') : 'Unknown'}

This context should inform your tool selections and implementation approach.
</project_context>` : '';
        
        return `<role>
You are an expert Claude Code slash command architect with deep knowledge of Anthropic's Claude Code CLI tool, its specific capabilities, tool permissions system, and command design patterns. You create professional, production-ready slash commands that leverage Claude Code's actual tools and follow Anthropic's documented best practices.
</role>

<claude_code_context>
Claude Code is Anthropic's official CLI tool for agentic coding assistance. It provides specific tools with granular permission controls:

AVAILABLE TOOLS & THEIR CAPABILITIES:
1. **Read** - Read file contents (supports glob patterns)
   - Permission syntax: Read(file-pattern) e.g., Read(src/**/*.js), Read(~/.config)
   - Use for: Examining code, configs, documentation

2. **Write** - Create new files with content
   - Permission syntax: Write(file-pattern) e.g., Write(src/new-file.js)  
   - Use for: Creating new files, initial implementations

3. **Edit** - Modify existing files with string replacement
   - Permission syntax: Edit(file-pattern) e.g., Edit(src/**/*.ts)
   - Use for: Code modifications, bug fixes, refactoring

4. **MultiEdit** - Edit multiple files simultaneously
   - Permission syntax: MultiEdit(file-pattern)
   - Use for: Cross-file refactoring, consistent changes

5. **Bash** - Execute shell commands with granular permissions
   - Permission syntax: Bash(command-pattern) e.g., Bash(git add:*), Bash(npm run test:*)
   - Common patterns:
     * Bash(git add:*, git commit:*, git push:*) - Git operations
     * Bash(npm run:*, yarn:*) - Package manager commands  
     * Bash(docker:*) - Docker operations
     * Bash(find:*, grep:*) - File search operations
   - Security: Avoid dangerous patterns like Bash(rm:*), Bash(sudo:*)

6. **Grep** - Search file contents with patterns
   - Permission syntax: Grep (no specific permissions needed)
   - Use for: Finding code patterns, searching codebases

7. **Glob** - Find files by patterns  
   - Permission syntax: Glob (no specific permissions needed)
   - Use for: File discovery, pattern matching

8. **LS** - List directory contents
   - Permission syntax: LS (no specific permissions needed)
   - Use for: Exploring project structure

9. **NotebookEdit** - Edit Jupyter notebooks
   - Permission syntax: NotebookEdit(file-pattern)
   - Use for: Data science, ML workflows

10. **WebFetch** - Fetch web content (restricted domains)
    - Permission syntax: WebFetch(domain:example.com)
    - Use for: API calls, documentation fetching

11. **MCP Tools** - Model Context Protocol servers
    - Permission syntax: mcp__server-name__tool-name or mcp__server-name
    - Examples: mcp__github__get_issue, mcp__supabase__query
    - Use for: External service integrations

PERMISSION BEST PRACTICES:
- Use specific command patterns instead of wildcards: Bash(git status) vs Bash(*)
- Combine related permissions: ["Bash(git add:*, git commit:*, git push:*)", "Read", "Edit(src/**)"]
- Include safety constraints: Avoid Bash(rm:*), Bash(sudo:*), Edit(/etc/**)
- Use file patterns: Edit(src/**/*.js) instead of Edit(*)
- Scope permissions to minimum required: Read(package.json) vs Read(*)

COMMAND STRUCTURE REQUIREMENTS:
1. YAML frontmatter with specific permissions
2. Clear H1 title using command name
3. Concise description paragraph  
4. ## Process section with numbered steps
5. ## Arguments section with $ARGUMENTS placeholder
6. ## Implementation section with detailed Claude instructions
7. ## Usage Notes with practical guidance
8. ## Examples with realistic command invocations

COMMAND EXECUTION CONTEXT:
- Commands run in project directories with access to git, npm/yarn, common dev tools
- Claude can read project files to understand context (package.json, README, etc.)
- File operations are persistent - changes are saved to disk
- Bash commands execute in the project's working directory
- Claude maintains context across multiple tool calls in a single command
</claude_code_context>

<task>
Create a high-quality Claude Code slash command that leverages Claude Code's specific tools and follows Anthropic's documented patterns and permission system.
</task>

${contextSection}

<input>
<command_name>${commandName}</command_name>
<category>${category || 'general'}</category>
<user_instructions>${instructions}</user_instructions>
</input>

<requirements>
1. Use ONLY Claude Code's actual tools with proper permission syntax
2. Include specific, minimal permissions (not generic wildcards)
3. Create step-by-step instructions that Claude can execute autonomously
4. Include $ARGUMENTS placeholder for dynamic parameters
5. Write actionable implementation steps with error handling
6. Add realistic usage examples with actual command syntax
7. Consider security implications and use safe permission patterns
8. Follow Anthropic's documented command structure patterns
</requirements>

<real_world_examples>
Based on Anthropic documentation, here are proven patterns:

DEVELOPMENT WORKFLOW COMMAND:
---
description: "Deploy feature branch with automated testing and rollback capability"
allowed-tools: ["Bash(git status, git add:*, git commit:*, git push:*)", "Bash(npm run test:*, npm run build:*)", "Read(package.json)", "Edit(package.json)"]
---

CODEBASE ANALYSIS COMMAND:
---  
description: "Analyze code quality and security with detailed reporting"
allowed-tools: ["Read(src/**)", "Grep", "Bash(npm run lint:*, npm audit:*)", "Write(reports/*.md)"]
---

FILE MANAGEMENT COMMAND:
---
description: "Refactor component structure with automatic import updates"  
allowed-tools: ["Read(src/**/*.tsx)", "Edit(src/**/*.tsx)", "MultiEdit", "Bash(find src:*)"]
---
</real_world_examples>

<implementation_guidance>
When writing the ## Implementation section:

1. **Context Reading**: Start with Read() to understand project structure
2. **Validation**: Use Bash() or Grep to validate preconditions  
3. **Core Logic**: Execute main operations with Edit/Write/MultiEdit
4. **Verification**: Use Read() or Bash() to verify results
5. **Error Handling**: Include fallback strategies and user messaging
6. **Cleanup**: Ensure consistent state with git operations if needed

Example Implementation Flow:
\\\`\\\`\\\`
1. Read package.json and project files to understand structure
2. Use Grep to find relevant code patterns  
3. Validate preconditions with Bash(git status)
4. Execute main changes with Edit() or MultiEdit()
5. Run tests with Bash(npm run test) to verify changes
6. Commit changes with Bash(git add:*, git commit:*)
\\\`\\\`\\\`
</implementation_guidance>

<output_format>
Respond with a JSON object using this exact structure. 

IMPORTANT: Ensure all string values are properly escaped for JSON:
- Escape all double quotes inside strings with \"
- Escape all backslashes with \\
- Escape all newlines with \n

Start your response with just the opening brace:

{
  "success": true,
  "data": {
    "description": "Concise description (10-50 words) of what this command accomplishes",
    "content": "Complete markdown content with proper YAML frontmatter, sections, and examples - ensure all quotes are escaped",
    "suggestedCategory": "Recommended category based on command purpose",
    "allowedTools": ["Specific Claude Code tools with granular permissions"],
    "argumentHint": "Optional hint about expected argument format",
    "metadata": {
      "complexity": "simple|moderate|advanced",
      "useCase": "Primary use case category", 
      "estimatedTime": "Expected execution time"
    }
  }
}
</output_format>`;
    }

    async generateSlashCommand(commandName, instructions, category = null, projectContext = null) {
        this.validateApiKey();

        return this.withRetry(async () => {
            const prompt = this.createCommandGenerationPrompt(commandName, instructions, category, projectContext);

            console.log('Generating slash command with OpenRouter...');
            
            const requestData = {
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 3000
            };

            const response = await this.client.post('/chat/completions', requestData, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'X-Title': 'Claude Manager Command Generator'
                }
            });

            const content = response.data.choices[0].message.content;
            console.log('Received response from OpenRouter, parsing JSON...');
            console.log('Raw response length:', content.length);
            console.log('Raw response preview:', content.substring(0, 500));

            // Parse the JSON response with improved error handling
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(content);
            } catch (parseError) {
                console.log('Direct JSON parse failed:', parseError.message);
                
                // The main issue is unescaped newlines in the content field
                // Let's fix this specific issue
                let fixedContent = content;
                
                // Fix the content field by properly escaping all problematic characters
                // The main issue is unescaped quotes and newlines in the JSON content field
                
                // First, let's try a completely different approach: use JSON.stringify to properly escape the content
                try {
                    // Parse the broken JSON by extracting and fixing the content field manually
                    const contentMatch = content.match(/"content":\s*"([\s\S]*?)"\s*,?\s*"suggestedCategory"/);
                    if (contentMatch) {
                        const rawContent = contentMatch[1];
                        // Properly escape the content using JSON.stringify, then remove outer quotes
                        const properlyEscapedContent = JSON.stringify(rawContent).slice(1, -1);
                        
                        // Replace the problematic content field with the properly escaped version
                        fixedContent = content.replace(
                            /"content":\s*"[\s\S]*?"\s*,?\s*"suggestedCategory"/,
                            `"content": "${properlyEscapedContent}", "suggestedCategory"`
                        );
                        
                        console.log('Applied JSON.stringify fix to content field');
                    } else {
                        throw new Error('Could not extract content field');
                    }
                } catch (extractError) {
                    console.log('JSON.stringify approach failed, trying manual escaping:', extractError.message);
                    
                    // Fallback to manual escaping
                    fixedContent = fixedContent.replace(
                        /("content":\s*")([^"]*)(")/gs,
                        (match, start, contentValue, end) => {
                            // Comprehensive escaping for JSON string content
                            const escapedContent = contentValue
                                .replace(/\\/g, '\\\\')     // Escape backslashes first
                                .replace(/"/g, '\\"')       // Escape quotes
                                .replace(/\n/g, '\\n')      // Escape newlines
                                .replace(/\r/g, '\\r')      // Escape carriage returns
                                .replace(/\t/g, '\\t')      // Escape tabs
                                .replace(/\f/g, '\\f')      // Escape form feeds
                                .replace(/\b/g, '\\b');     // Escape backspaces
                            
                            return start + escapedContent + end;
                        }
                    );
                }
                
                console.log('Applied content field fixes, trying to parse again...');
                
                try {
                    parsedResponse = JSON.parse(fixedContent);
                    console.log('Successfully parsed JSON after fixing bash quotes');
                } catch (secondParseError) {
                    console.log('Second parse attempt also failed:', secondParseError.message);
                    
                    // Try to extract JSON from markdown formatting if needed
                    let cleanResponse = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
                    
                    if (jsonMatch) {
                        try {
                            parsedResponse = JSON.parse(jsonMatch[0]);
                            console.log('Successfully parsed JSON from markdown extraction');
                        } catch (thirdParseError) {
                            console.log('Third parse attempt also failed:', thirdParseError.message);
                            
                            // Save the problematic content for debugging
                            console.log('Saving problematic content to debug file...');
                            require('fs').writeFileSync('/tmp/openrouter-debug.json', content);
                            
                            throw new Error(`JSON Parse error: ${parseError.message}. Content saved to /tmp/openrouter-debug.json`);
                        }
                    } else {
                        throw new Error(`OpenRouter returned non-JSON response: ${content.substring(0, 200)}...`);
                    }
                }
            }

            // Validate response structure
            if (!parsedResponse.success || !parsedResponse.data) {
                throw new Error(`Invalid response structure from OpenRouter: ${JSON.stringify(parsedResponse)}`);
            }

            const { description, content: cmdContent, suggestedCategory, allowedTools, argumentHint, metadata } = parsedResponse.data;

            if (!description || !cmdContent) {
                throw new Error('Missing required fields (description, content) in OpenRouter response');
            }

            return {
                success: true,
                description,
                content: cmdContent,
                suggestedCategory: suggestedCategory || category,
                allowedTools: allowedTools || ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
                argumentHint: argumentHint || null,
                metadata: metadata || {
                    complexity: 'moderate',
                    useCase: 'general',
                    estimatedTime: '2-5 minutes'
                }
            };

        }, `slash command generation for ${commandName}`).catch(error => {
            console.error('Error generating slash command with OpenRouter:', error);
            
            // Provide detailed error information for troubleshooting
            const errorDetails = {
                type: error.constructor.name,
                message: error.message,
                context: { commandName, category, instructions: instructions.substring(0, 100) }
            };

            let suggestions = [];
            if (error.message.includes('Invalid') && error.message.includes('API key')) {
                suggestions.push('Verify your OPENROUTER_API_KEY environment variable');
                suggestions.push('Check if the API key has the correct permissions');
            } else if (error.message.includes('credits exhausted')) {
                suggestions.push('Add credits to your OpenRouter account');
                suggestions.push('Check your OpenRouter account balance');
            } else if (error.message.includes('rate limit')) {
                suggestions.push('Wait before making more requests');
                suggestions.push('Consider upgrading your OpenRouter plan for higher limits');
            }

            return {
                success: false,
                error: error.message,
                details: errorDetails,
                suggestions,
                timestamp: Date.now()
            };
        });
    }

    // Generate JavaScript hook code using OpenRouter with enhanced context
    async generateHookCode(hookRequest) {
        const {
            eventType,
            pattern = '*',
            description,
            scope = 'user',
            projectInfo = null,
            userEnv = {},
            availableServices = {}
        } = hookRequest;

        this.validateApiKey();

        return this.withRetry(async () => {
            const { serviceConfig } = require('../utils/service-config');
            const serviceUrls = serviceConfig.getAllServiceUrls();
            const ollamaUrl = availableServices.ollama || serviceUrls.ollama;
            const ttsUrl = availableServices.tts || serviceUrls.tts;
            
            // Gather comprehensive context for better LLM generation
            const enhancedContext = await this.gatherEnhancedContext(hookRequest);

            const prompt = `You are generating JavaScript code for Claude Code's hook system.

${enhancedContext.projectContext}
${enhancedContext.environmentContext}
${enhancedContext.exampleContext}
${enhancedContext.eventSpecificContext}
${enhancedContext.securityContext}

CLAUDE CODE HOOK SYSTEM EXPLANATION:

Claude Code is Anthropic's CLI tool for software development. It has a hook system that allows users to execute custom JavaScript code in response to Claude's actions.

HOOK LIFECYCLE:
1. User works with Claude Code (AI assistant)
2. Claude uses tools like Write, Edit, Bash, Read, Grep, MultiEdit, etc.
3. Before/after each tool use, Claude Code triggers hook events
4. Your generated JavaScript code executes in a sandboxed Node.js VM
5. The code can perform actions like notifications, file operations, API calls

HOOK EVENT TYPES:
- PreToolUse: Runs BEFORE Claude executes a tool (validation, backups, warnings)
- PostToolUse: Runs AFTER Claude executes a tool (cleanup, formatting, git operations)
- Notification: Runs when Claude sends status messages
- Stop: Runs when Claude completes a task/conversation
- SubagentStop: Runs when a Claude subagent completes its work

EXECUTION ENVIRONMENT:
- Sandboxed Node.js VM (30-second timeout)
- No file system write access (security)
- Limited HTTP requests to approved domains
- Access to local services (Ollama LLM, TTS)

YOUR JAVASCRIPT CODE RECEIVES:

hookEvent = {
  type: '${eventType}', // The event type for this hook
  toolName: 'Write|Edit|Bash|Read|Grep|MultiEdit|etc', // Claude tool that triggered this
  filePaths: ['/path/to/affected/file.js'], // Files Claude is working with
  context: { /* Tool-specific data like file content, command args */ },
  timestamp: 1234567890
}

projectInfo = ${projectInfo ? `{
  name: '${projectInfo.name}',           // Name of the current project
  path: '${projectInfo.path}',          // Full project path
  config: { /* Claude project settings */ }
}` : 'null // null for user-level hooks'}

userEnv = { /* Safe environment variables - sensitive keys filtered */ }

hookMeta = {
  id: 'hook-uuid',
  name: 'Generated Hook',
  scope: '${scope}'
}

utils = {
  log(...args),                         // Console logging
  sleep(milliseconds),                  // Async delay
  fetch(url, options),                  // HTTP requests (restricted domains)
  playSound('success|error|warning|info'), // System sounds
  speak(text, options),                 // Text-to-speech via ${ttsUrl}
  askOllama(prompt, options),           // Query Ollama LLM at ${ollamaUrl}
  notify(message, type)                 // System notifications
}

console = {
  log(...args),   // Logging
  warn(...args),  // Warnings
  error(...args)  // Errors
}

USER REQUEST:
Event Type: ${eventType}
File Pattern: ${pattern}
Scope: ${scope}
Description: ${description}

GENERATE JAVASCRIPT CODE THAT:
1. Properly handles the ${eventType} event
2. Matches files/tools using pattern: ${pattern}
3. Implements: ${description}
4. Uses hookEvent data appropriately
5. Includes error handling and user feedback
6. Uses available utilities (utils.notify, utils.speak, etc.)
7. Returns a meaningful status message

CODE REQUIREMENTS:
- Must be valid JavaScript for Node.js VM
- Use async/await for asynchronous operations  
- Include try/catch error handling
- No file system writes, no dangerous operations
- Comment the code to explain the logic
- Return a string status message

CRITICAL REQUIREMENTS:
- Generate ONLY plain JavaScript code that can be executed directly in the VM context
- DO NOT wrap the code in a function definition
- DO NOT use function parameters  
- The variables (hookEvent, projectInfo, userEnv, hookMeta, utils, console) are available as globals
- DO NOT include markdown code blocks or explanations

RESPONSE FORMAT:
Return only the JavaScript code without markdown formatting or explanations. The code should be ready to execute in the hook system.`;

            console.log('Generating hook code with OpenRouter...');
            
            const requestData = {
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1, // Low temperature for consistent code
                max_tokens: 1500
            };

            const response = await this.client.post('/chat/completions', requestData, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'X-Title': 'Claude Manager Hook Generator'
                }
            });

            const generatedCode = response.data.choices[0].message.content.trim();
            
            // Validate we got actual code content
            if (!generatedCode) {
                throw new Error('OpenRouter returned empty code content');
            }
            
            // Clean the code (remove markdown if present)
            const cleanedCode = this.extractJavaScriptCode(generatedCode);

            return {
                success: true,
                code: cleanedCode,
                model: this.model,
                provider: 'openrouter',
                metadata: {
                    eventType,
                    pattern,
                    description,
                    scope,
                    generatedAt: Date.now()
                }
            };

        }, `hook code generation for ${eventType}`).catch(error => {
            console.error('Hook code generation failed with OpenRouter:', error);
            
            // Provide detailed error information for troubleshooting
            const errorDetails = {
                type: error.constructor.name,
                message: error.message,
                context: {
                    eventType,
                    description,
                    scope,
                    modelUsed: this.model
                }
            };

            let suggestions = [];
            if (error.message.includes('Invalid') && error.message.includes('API key')) {
                suggestions.push('Verify your OPENROUTER_API_KEY environment variable');
                suggestions.push('Check if the API key has the correct permissions');
            } else if (error.message.includes('credits exhausted')) {
                suggestions.push('Add credits to your OpenRouter account');
                suggestions.push('Check your OpenRouter account balance');
            } else if (error.message.includes('rate limit')) {
                suggestions.push('Wait before making more requests');
                suggestions.push('Consider upgrading your OpenRouter plan for higher limits');
            } else if (error.message.includes('empty code')) {
                suggestions.push('Try a different model or adjust generation parameters');
                suggestions.push('Check if the prompt is clear and specific enough');
            }

            return {
                success: false,
                error: error.message,
                details: errorDetails,
                suggestions,
                timestamp: Date.now()
            };
        });
    }

    // Gather comprehensive context for enhanced hook generation
    async gatherEnhancedContext(hookRequest) {
        const {
            eventType,
            pattern,
            scope,
            projectInfo,
            userEnv,
            availableServices
        } = hookRequest;

        let context = {
            projectContext: '',
            environmentContext: '',
            exampleContext: '',
            eventSpecificContext: '',
            securityContext: ''
        };

        try {
            // PROJECT CONTEXT
            if (projectInfo && projectInfo.path) {
                context.projectContext = await this.buildProjectContext(projectInfo);
            } else {
                context.projectContext = `PROJECT CONTEXT:
Scope: ${scope} (global user-level hook)
No specific project context available.`;
            }

            // ENVIRONMENT CONTEXT
            context.environmentContext = await this.buildEnvironmentContext(userEnv, availableServices);

            // EXAMPLE CONTEXT - Real hooks from the system
            context.exampleContext = await this.buildExampleContext(eventType, scope, projectInfo);

            // EVENT-SPECIFIC CONTEXT
            context.eventSpecificContext = this.buildEventSpecificContext(eventType, pattern);

            // SECURITY CONTEXT
            context.securityContext = this.buildSecurityContext(eventType);

        } catch (error) {
            console.warn('Error gathering enhanced context:', error.message);
        }

        return context;
    }

    // Build comprehensive project context
    async buildProjectContext(projectInfo) {
        const fs = require('fs-extra');
        const path = require('path');
        
        let context = `PROJECT CONTEXT:
Project: ${projectInfo.name}
Path: ${projectInfo.path}
`;

        try {
            // Read project's CLAUDE.md if it exists
            const claudeMdPath = path.join(projectInfo.path, 'CLAUDE.md');
            if (await fs.pathExists(claudeMdPath)) {
                const claudeMd = await fs.readFile(claudeMdPath, 'utf8');
                const preview = claudeMd.length > 500 ? claudeMd.substring(0, 500) + '...' : claudeMd;
                context += `\nProject Instructions (CLAUDE.md):\n${preview}\n`;
            }

            // Read package.json to understand tech stack
            const packageJsonPath = path.join(projectInfo.path, 'package.json');
            if (await fs.pathExists(packageJsonPath)) {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
                context += `\nTech Stack (package.json):\n`;
                context += `- Framework: ${this.detectFramework(packageJson)}\n`;
                if (packageJson.scripts) {
                    const keyScripts = Object.keys(packageJson.scripts)
                        .filter(script => ['dev', 'build', 'test', 'lint', 'start'].includes(script))
                        .slice(0, 5);
                    context += `- Available Scripts: ${keyScripts.join(', ')}\n`;
                }
                if (packageJson.dependencies) {
                    const keyDeps = Object.keys(packageJson.dependencies).slice(0, 10);
                    context += `- Key Dependencies: ${keyDeps.join(', ')}\n`;
                }
            }

            // Detect common file patterns in project
            const commonPatterns = await this.detectFilePatterns(projectInfo.path);
            if (commonPatterns.length > 0) {
                context += `\nCommon File Types: ${commonPatterns.join(', ')}\n`;
            }

            // Check for existing hooks in project
            const existingHooks = await this.getExistingProjectHooks(projectInfo.path);
            if (existingHooks.length > 0) {
                context += `\nExisting Project Hooks: ${existingHooks.length} hooks already configured\n`;
            }

        } catch (error) {
            context += `\nWarning: Could not read full project context: ${error.message}\n`;
        }

        return context;
    }

    // Build environment and services context
    async buildEnvironmentContext(userEnv, availableServices) {
        const { serviceConfig } = require('../utils/service-config');
        const serviceUrls = serviceConfig.getAllServiceUrls();
        
        let context = `ENVIRONMENT CONTEXT:\n`;
        context += `- Ollama Service: ${availableServices.ollama || serviceUrls.ollama} ${await this.checkServiceAvailability(serviceUrls.ollama) ? '✅' : '❌'}\n`;
        context += `- TTS Service: ${availableServices.tts || serviceUrls.tts} ${await this.checkServiceAvailability(serviceUrls.tts) ? '❌' : '❌'}\n`;
        
        // Check for active MCP servers if claudeManagerInstance is available
        if (this.claudeManagerInstance?.mcpService) {
            const mcpState = this.claudeManagerInstance.mcpService.getState();
            const activeMCPs = Object.keys(mcpState.userMCPs?.active || {});
            if (activeMCPs.length > 0) {
                context += `- Active MCP Servers: ${activeMCPs.join(', ')}\n`;
            }
        }
        
        // Safe environment variables (non-sensitive)
        const safeEnvVars = Object.keys(userEnv).filter(key => 
            !key.toUpperCase().includes('KEY') && 
            !key.toUpperCase().includes('TOKEN') && 
            !key.toUpperCase().includes('SECRET')
        );
        if (safeEnvVars.length > 0) {
            context += `- Available Environment Variables: ${safeEnvVars.slice(0, 5).join(', ')}\n`;
        }
        
        return context;
    }

    // Build examples from actual hooks in the system
    async buildExampleContext(eventType, scope, projectInfo) {
        let context = `REAL HOOK EXAMPLES:\n`;
        
        try {
            const fs = require('fs-extra');
            const path = require('path');
            const os = require('os');
            
            // Look for existing hooks that match the event type
            const hooksDir = scope === 'user' 
                ? path.join(os.homedir(), '.claude-manager', 'hooks')
                : projectInfo ? path.join(projectInfo.path, '.claude', 'hooks') : null;
                
            if (hooksDir && await fs.pathExists(hooksDir)) {
                const hookFiles = await fs.readdir(hooksDir);
                const relevantHooks = hookFiles.filter(file => 
                    file.endsWith('.js') && file.toLowerCase().includes(eventType.toLowerCase())
                ).slice(0, 2); // Limit to 2 examples
                
                for (const hookFile of relevantHooks) {
                    try {
                        const hookContent = await fs.readFile(path.join(hooksDir, hookFile), 'utf8');
                        const preview = hookContent.length > 300 ? hookContent.substring(0, 300) + '...' : hookContent;
                        context += `\nExample from ${hookFile}:\n\`\`\`javascript\n${preview}\n\`\`\`\n`;
                    } catch (error) {
                        // Skip unreadable hooks
                    }
                }
            }
            
            // If no real examples, provide targeted template
            if (!context.includes('```javascript')) {
                context += this.getTargetedTemplate(eventType);
            }
            
        } catch (error) {
            // Fallback to generic template
            context += this.getTargetedTemplate(eventType);
        }
        
        return context;
    }

    // Build event-specific context with common patterns
    buildEventSpecificContext(eventType, pattern) {
        let context = `EVENT-SPECIFIC CONTEXT:\n`;
        context += `Target Event: ${eventType}\n`;
        context += `Pattern Match: ${pattern}\n`;
        
        // Add event-specific guidance
        const eventGuidance = {
            'PreToolUse': {
                purpose: 'Runs BEFORE Claude executes a tool - perfect for validation, backups, warnings',
                commonPatterns: ['File backup before Write/Edit', 'Dangerous command validation', 'Environment checks'],
                dataAvailable: 'hookEvent.toolName, hookEvent.filePaths (intended targets), hookEvent.originalHookData (full command details)'
            },
            'PostToolUse': {
                purpose: 'Runs AFTER Claude completes a tool - perfect for cleanup, git operations, notifications',
                commonPatterns: ['Auto-commit after file changes', 'Format code after edits', 'Update documentation'],
                dataAvailable: 'hookEvent.toolName, hookEvent.filePaths (actual files modified), hookEvent.context (results)'
            },
            'Notification': {
                purpose: 'Runs when Claude sends status messages - perfect for user experience improvements',
                commonPatterns: ['Text-to-speech for all messages', 'Important message highlighting', 'External integrations'],
                dataAvailable: 'hookEvent.context.message (the notification text)'
            },
            'Stop': {
                purpose: 'Runs when Claude completes a task - perfect for completion feedback',
                commonPatterns: ['Success sounds', 'Session summaries', 'Task completion notifications'],
                dataAvailable: 'hookEvent.context (session summary), project info if available'
            }
        };
        
        const guidance = eventGuidance[eventType];
        if (guidance) {
            context += `Purpose: ${guidance.purpose}\n`;
            context += `Common Use Cases: ${guidance.commonPatterns.join(', ')}\n`;
            context += `Data Available: ${guidance.dataAvailable}\n`;
        }
        
        return context;
    }

    // Build security context and constraints
    buildSecurityContext(eventType) {
        let context = `SECURITY CONSTRAINTS:\n`;
        context += `- No file system writes (read-only except for logging)\n`;
        context += `- HTTP requests limited to approved domains (localhost, 127.0.0.1, 100.83.40.11, api.github.com)\n`;
        context += `- No access to sensitive environment variables\n`;
        context += `- 30-second execution timeout\n`;
        context += `- Sandboxed Node.js VM environment\n`;
        
        if (eventType === 'PreToolUse') {
            context += `- PreToolUse hooks can block execution by throwing errors\n`;
            context += `- Use this power responsibly - only block dangerous operations\n`;
        }
        
        return context;
    }

    // Utility functions
    detectFramework(packageJson) {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        if (deps.react) return 'React';
        if (deps.vue) return 'Vue';
        if (deps.angular) return 'Angular';
        if (deps.svelte) return 'Svelte';
        if (deps.express) return 'Express';
        if (deps['@nestjs/core']) return 'NestJS';
        if (deps.fastify) return 'Fastify';
        return 'Node.js';
    }

    async detectFilePatterns(projectPath) {
        const fs = require('fs-extra');
        const path = require('path');
        const patterns = new Set();
        
        try {
            const files = await fs.readdir(projectPath);
            for (const file of files.slice(0, 20)) { // Limit to first 20 files
                const ext = path.extname(file).toLowerCase();
                if (ext && !['.git', '.node_modules'].includes(file)) {
                    patterns.add(ext);
                }
            }
        } catch (error) {
            // Ignore errors
        }
        
        return Array.from(patterns).slice(0, 10);
    }

    async getExistingProjectHooks(projectPath) {
        const fs = require('fs-extra');
        const path = require('path');
        
        try {
            const hooksDir = path.join(projectPath, '.claude', 'hooks');
            if (await fs.pathExists(hooksDir)) {
                const files = await fs.readdir(hooksDir);
                return files.filter(f => f.endsWith('.js'));
            }
        } catch (error) {
            // Ignore errors
        }
        
        return [];
    }

    async checkServiceAvailability(serviceUrl) {
        try {
            const axios = require('axios');
            await axios.get(serviceUrl + '/health', { timeout: 1000 });
            return true;
        } catch (error) {
            return false;
        }
    }

    getTargetedTemplate(eventType) {
        const templates = {
            'PreToolUse': `\nTemplate for PreToolUse:\n\`\`\`javascript\ntry {\n  // Check if this is a tool we want to intercept\n  if (hookEvent.toolName === 'Bash' && hookEvent.originalHookData?.command) {\n    const command = hookEvent.originalHookData.command;\n    console.log('About to execute:', command);\n    \n    // Example: Block dangerous commands\n    if (command.includes('rm -rf')) {\n      await utils.notify('Dangerous command blocked!', 'warning');\n      throw new Error('Blocked potentially dangerous command');\n    }\n    \n    // Example: Backup before file operations\n    if (hookEvent.toolName === 'Write' && hookEvent.filePaths.length > 0) {\n      await utils.notify('Creating backup before file write', 'info');\n    }\n  }\n  \n  return 'Validation completed';\n} catch (error) {\n  console.error('Hook error:', error);\n  return 'Validation failed: ' + error.message;\n}\n\`\`\`\n`,
            
            'PostToolUse': `\nTemplate for PostToolUse:\n\`\`\`javascript\ntry {\n  // Process completed tool operation\n  if (hookEvent.toolName === 'Write' || hookEvent.toolName === 'Edit') {\n    console.log('Files modified:', hookEvent.filePaths);\n    \n    // Example: Auto-format after code changes\n    if (hookEvent.filePaths.some(f => f.endsWith('.js') || f.endsWith('.ts'))) {\n      await utils.notify('Code files modified - consider running formatter', 'info');\n    }\n    \n    // Example: Speak completion\n    await utils.speak('File operation completed');\n  }\n  \n  return 'Post-processing completed';\n} catch (error) {\n  console.error('Hook error:', error);\n  return 'Post-processing failed: ' + error.message;\n}\n\`\`\`\n`,
            
            'Notification': `\nTemplate for Notification:\n\`\`\`javascript\ntry {\n  const message = hookEvent.context?.message || 'Notification received';\n  console.log('Claude notification:', message);\n  \n  // Example: Speak important notifications\n  if (message.includes('error') || message.includes('warning')) {\n    await utils.speak('Alert: ' + message);\n    await utils.playSound('warning');\n  } else {\n    await utils.playSound('info');\n  }\n  \n  return 'Notification processed';\n} catch (error) {\n  console.error('Hook error:', error);\n  return 'Notification processing failed: ' + error.message;\n}\n\`\`\`\n`,
            
            'Stop': `\nTemplate for Stop:\n\`\`\`javascript\ntry {\n  console.log('Claude task completed at:', new Date().toISOString());\n  \n  // Example: Success feedback\n  await utils.playSound('success');\n  await utils.speak('Task completed successfully');\n  \n  // Example: Optional AI summary\n  if (projectInfo) {\n    const summary = await utils.askOllama(\n      \`Briefly summarize what was accomplished in this Claude session for project: \${projectInfo.name}\`,\n      { model: 'llama3.2:latest', max_tokens: 100 }\n    );\n    console.log('Session summary:', summary);\n    await utils.notify('Session complete: ' + summary, 'success');\n  }\n  \n  return 'Task completion processed';\n} catch (error) {\n  console.error('Hook error:', error);\n  return 'Completion processing failed: ' + error.message;\n}\n\`\`\`\n`
        };
        
        return templates[eventType] || '';
    }

    // Extract JavaScript code from LLM response
    extractJavaScriptCode(response) {
        if (!response || typeof response !== 'string') {
            throw new Error('Invalid response from OpenRouter');
        }

        // Remove markdown code blocks if present
        const codeBlockMatch = response.match(/```(?:javascript|js)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // If no code blocks, clean and return the response
        const cleaned = response.trim()
            .replace(/^```javascript\s*/i, '')
            .replace(/^```js\s*/i, '')
            .replace(/```\s*$/, '')
            .trim();

        if (cleaned.length === 0) {
            throw new Error('No JavaScript code found in OpenRouter response');
        }

        return cleaned;
    }


    createAgentGenerationPrompt(agentName, description, availableTools, scope) {
        return `<role>
You are an expert AI agent architect with deep knowledge of Anthropic's system prompt engineering, Constitutional AI principles, and Claude tool usage best practices. You create production-ready agent system messages following Anthropic's documented guidance on role definition, tool use protocols, and safety constraints.
</role>

<task>
Create a comprehensive agent system message based on the user's requirements, strictly following Anthropic's official guidance on system prompts, tool use, and agent design patterns for maximum effectiveness and safety.
</task>

<input>
<agent_name>${agentName}</agent_name>
<description>${description}</description>
<available_tools>${availableTools.join(', ')}</available_tools>
<scope>${scope}</scope>
</input>

<anthropic_guidance_integration>
Based on Anthropic's official documentation:

**System Prompt Design (from docs.anthropic.com/system-prompts):**
- Transform Claude "from a general assistant into your virtual domain expert"
- Use specific, nuanced role definitions (not generic "helpful assistant")
- Define precise expertise and professional perspective
- Align role closely with specific analytical/problem-solving needs

**Tool Use Best Practices (from docs.anthropic.com/tool-use):**
- Claude decides when to use tools based on clear descriptions
- Provide tool details: name, description, input schema
- Implement proper tool call workflow: decision → execution → result integration
- Handle tool failures gracefully with fallback strategies

**Prompt Engineering Principles (from docs.anthropic.com/prompt-engineering):**
- Be clear and direct in instructions
- Use XML tags for structure
- Define clear success criteria
- Employ chain of thought reasoning
- Consider constitutional AI safety principles
</anthropic_guidance_integration>

<agent_design_framework>
Following Anthropic's documented patterns:

1. **Specific Role Definition**: Nuanced professional identity (e.g., "data scientist specializing in customer insight analysis for Fortune 500 companies")
2. **Tool Usage Protocol**: Clear decision criteria for when/why/how to use each tool
3. **Validation Framework**: Input validation → processing → output verification
4. **Error Handling**: Primary approach → tool fallbacks → human escalation
5. **Safety Integration**: Constitutional AI principles embedded throughout
6. **Success Metrics**: Measurable effectiveness criteria
7. **Context Management**: What to preserve, summarize, and forget
8. **Capability Boundaries**: Explicit limitations and prohibited actions
</agent_design_framework>

<effective_patterns>
✅ **Domain Expert Role**: Specific professional identity vs generic assistant
✅ **Tool Decision Trees**: Clear criteria for tool selection and usage
✅ **Validation Chains**: Systematic quality control at each step
✅ **Graceful Degradation**: Maintains functionality when tools fail
✅ **Constitutional Safety**: Safety principles integrated into core behavior
✅ **Empirical Success**: Measurable performance criteria
✅ **Context Compression**: Efficient memory management
✅ **Progressive Complexity**: Simple to advanced operation flow
</effective_patterns>

<system_message_template>
You are a ${agentName} with specialized expertise in [DOMAIN]. Your role is to [SPECIFIC_PROFESSIONAL_FUNCTION] with precision and reliability.

## Professional Identity
[Specific professional role, expertise area, and unique value proposition]

## Core Capabilities
[3-5 specific capabilities with concrete examples and measurable outcomes]

## Tool Usage Protocol
For each available tool, you follow this decision framework:
- **When to use**: Specific triggers and conditions
- **Why to use**: Expected outcomes and value
- **How to use**: Step-by-step protocol with validation
- **Fallback**: Alternative approaches when tool fails

[Specific tool protocols for each available tool]

## Quality Assurance Framework
Before any response, you:
1. Validate input completeness and clarity
2. Verify tool results align with expectations
3. Check output meets success criteria
4. Ensure safety constraints are maintained

## Error Handling Protocol
- **Primary**: [Standard operating procedure]
- **Tool Failure**: [Specific fallback strategies for each tool]
- **Data Issues**: [Validation and correction procedures]
- **Escalation**: [When and how to request human intervention]

## Success Criteria
- [Measurable performance indicators]
- [Quality benchmarks]
- [User satisfaction metrics]

## Safety Constraints
Following Constitutional AI principles:
- [Domain-specific safety rules]
- [Prohibited actions and boundaries]
- [Ethical guidelines for tool use]
- [Privacy and security protocols]

## Context Management
- **Preserve**: [Critical information to maintain]
- **Summarize**: [Information to compress after use]
- **Forget**: [Irrelevant or sensitive data to discard]
- **Limits**: [Maximum context size and management strategies]

Remember: You are a domain expert, not a general assistant. Your responses should reflect deep professional knowledge while maintaining rigorous safety standards.
</system_message_template>

<output_format>
Respond with a JSON object using this exact structure. Use JSON prefilling - start your response with just the opening brace:

{
  "success": true,
  "data": {
    "systemMessage": "Complete, professional system message following Anthropic's guidance and the template structure above, with specific tool protocols for each available tool",
    "agentSummary": "2-3 sentence summary emphasizing the agent's specific professional identity and core value proposition",
    "recommendedTools": ["Most critical tools for this agent's professional function"],
    "suggestedTextFace": "ASCII face that reflects the agent's professional personality",
    "suggestedColor": "Professional color that matches the domain (e.g., '#4CAF50' for security, '#2196F3' for research, '#FF9800' for creative)",
    "complexity": "simple|moderate|advanced - based on tool usage and decision complexity",
    "domain": "Specific professional domain or field of expertise",
    "riskLevel": "low|medium|high - based on potential impact and tool capabilities",
    "validationChecks": ["Key validation steps following Anthropic's quality assurance patterns"],
    "commonFailures": ["Potential failure modes and their mitigation strategies"],
    "safeguards": ["Specific Constitutional AI safety measures for this agent type"]
  }
}
</output_format>`;
    }

    async generateAgent(agentName, description, availableTools, scope = 'user') {
        try {
            this.validateApiKey();

            const prompt = this.createAgentGenerationPrompt(agentName, description, availableTools, scope);

            console.log('Generating agent with OpenRouter...');
            
            const requestData = {
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 4000
            };

            const completion = await this.client.post('/chat/completions', requestData, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'X-Title': 'Claude Manager Agent Generator'
                }
            });

            const response = completion.data.choices[0].message.content;
            console.log('Received response from OpenRouter, parsing JSON...');

            // Parse the JSON response
            let parsedResponse;
            try {
                // First try direct parsing
                parsedResponse = JSON.parse(response);
            } catch (parseError) {
                // Fallback: try to extract JSON from code blocks or other formatting
                let cleanResponse = response;
                
                // Remove markdown code blocks
                cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                
                // Try to find JSON object
                const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsedResponse = JSON.parse(jsonMatch[0]);
                        console.log('Successfully parsed JSON from markdown code blocks');
                    } catch (secondParseError) {
                        console.error('Failed to parse extracted JSON:', secondParseError);
                        throw new Error('Invalid JSON response from OpenRouter');
                    }
                } else {
                    console.error('Could not find JSON in response:', response.substring(0, 200));
                    throw new Error('Invalid JSON response from OpenRouter');
                }
            }

            // Validate response structure
            if (!parsedResponse.success || !parsedResponse.data) {
                throw new Error('Invalid response structure from OpenRouter');
            }

            const { 
                systemMessage, 
                agentSummary, 
                recommendedTools, 
                suggestedTextFace, 
                suggestedColor,
                complexity,
                domain,
                riskLevel,
                validationChecks,
                commonFailures,
                safeguards
            } = parsedResponse.data;

            if (!systemMessage || !agentSummary) {
                throw new Error('Missing required fields in OpenRouter response');
            }

            return {
                success: true,
                systemMessage,
                agentSummary,
                recommendedTools: recommendedTools || availableTools.slice(0, 5),
                suggestedTextFace: suggestedTextFace || '(◕‿◕)',
                suggestedColor: suggestedColor || '#4CAF50',
                complexity: complexity || 'moderate',
                domain: domain || 'general',
                riskLevel: riskLevel || 'medium',
                validationChecks: validationChecks || [],
                commonFailures: commonFailures || [],
                safeguards: safeguards || []
            };

        } catch (error) {
            console.error('Error generating agent with OpenRouter:', error);
            
            // Return a structured error response
            return {
                success: false,
                error: error.message || 'Failed to generate agent with OpenRouter'
            };
        }
    }

    async testConnection() {
        try {
            this.validateApiKey();
            
            const requestData = {
                model: this.model,
                messages: [{ role: "user", content: "Reply with just 'OK' if you can receive this message." }],
                max_tokens: 10
            };

            const completion = await this.client.post('/chat/completions', requestData, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'X-Title': 'Claude Manager Connection Test'
                }
            });

            return {
                success: true,
                response: completion.data.choices[0].message.content
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = OpenRouterService;