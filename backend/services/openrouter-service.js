const axios = require('axios');

class OpenRouterService {
    constructor() {
        this.baseUrl = "https://openrouter.ai/api/v1";
        this.model = "openai/gpt-5-mini";
        this.maxRetries = 3;
        this.retryDelay = 2000; // ms
        this.rateLimitDelay = 1000; // ms between requests
        this.lastRequestTime = 0;
        
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

    createCommandGenerationPrompt(commandName, instructions, category) {
        const categoryPath = category ? `${category}/` : '';
        
        return `<role>
You are an expert Claude Code slash command architect with deep knowledge of software development workflows, prompt engineering, and command design patterns. You create professional, production-ready slash commands that follow Anthropic's best practices and community standards.
</role>

<task>
Create a high-quality Claude Code slash command based on the user's requirements.
</task>

<input>
<command_name>${commandName}</command_name>
<category>${category || 'general'}</category>
<user_instructions>${instructions}</user_instructions>
</input>

<requirements>
1. Follow Claude Code slash command best practices from Anthropic documentation
2. Use proper YAML frontmatter with specific tool permissions (not generic tools)
3. Create actionable, step-by-step instructions that Claude can execute
4. Include $ARGUMENTS placeholder for dynamic parameters
5. Write clear, professional descriptions that explain the command's value
6. Structure commands for consistency and reusability
7. Include proper error handling and validation guidance
8. Add relevant usage examples and best practices
</requirements>

<best_practices>
- Use specific allowed-tools like ["Bash(git add:*, git commit:*, git push:*)", "Read", "Write", "Edit"] instead of generic tool lists
- Write descriptions that are concise but complete (10-50 words)
- Create commands that work well with $ARGUMENTS substitution
- Include proper markdown structure with H1 title, H2 sections
- Add usage examples that show realistic scenarios
- Consider security implications and include safety notes
- Make commands self-contained and context-aware
- Follow naming conventions from professional command collections
</best_practices>

<examples>
<example_frontmatter>
---
description: "Perform comprehensive code review with security analysis and suggestions"
allowed-tools: ["Read", "Grep", "Bash(npm run lint:*, npm run test:*)", "Write"]
argument-hint: "[file-pattern or 'all']"
---
</example_frontmatter>

<example_structure>
# Code Review Assistant

Performs a thorough code review including security analysis, best practices validation, and improvement suggestions.

## Process

1. Analyze code structure and patterns
2. Check for security vulnerabilities and anti-patterns
3. Validate coding standards and conventions
4. Generate actionable improvement recommendations
5. Create summary report with findings

## Arguments

Review target: $ARGUMENTS

## Implementation

[Detailed step-by-step instructions for Claude to follow]

## Usage Notes

- Works best with specific file patterns or 'all' for full codebase review
- Automatically detects project type and applies relevant standards
- Includes both automated checks and manual analysis

## Examples

\`\`\`bash
/dev:code-review src/components/*.tsx
/dev:code-review all
\`\`\`
</example_structure>
</examples>

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
    "allowedTools": ["Specific tools with permissions rather than generic tools"],
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

    async generateSlashCommand(commandName, instructions, category = null) {
        this.validateApiKey();

        return this.withRetry(async () => {
            const prompt = this.createCommandGenerationPrompt(commandName, instructions, category);

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

    // Generate JavaScript hook code using OpenRouter
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

            const prompt = `You are generating JavaScript code for Claude Code's hook system.

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
You are an expert AI agent architect with deep knowledge of Anthropic's Constitutional AI principles, system message design patterns, and production deployment best practices. You create professional, effective agent system messages that balance capability with safety.
</role>

<task>
Create a comprehensive agent system message based on the user's requirements, incorporating both Anthropic's Constitutional AI principles and community-validated patterns for maximum effectiveness.
</task>

<input>
<agent_name>${agentName}</agent_name>
<description>${description}</description>
<available_tools>${availableTools.join(', ')}</available_tools>
<scope>${scope}</scope>
</input>

<agent_design_principles>
Based on research from Anthropic's official guidance and community best practices:

1. **Specific Identity**: Clear, focused role definition (not "helpful assistant")
2. **Capability Boundaries**: Explicit what-can/cannot-do statements
3. **Tool Usage Protocols**: When/why/how to use each available tool
4. **Context Management**: Memory handling and conversation flow rules
5. **Error Handling**: Primary approach → fallback strategies → escalation
6. **Safety Constraints**: Constitutional AI principles + domain-specific rules
7. **Quality Validation**: Self-checking mechanisms and success criteria
8. **Anti-Pattern Prevention**: Avoid God Agent, Context Explosion, Tool Dumping
</agent_design_principles>

<effective_patterns>
✅ **Specialized agents** consistently outperform generalists
✅ **Context compression** prevents performance degradation
✅ **Tool validation chains** prevent execution errors
✅ **Graceful degradation** maintains functionality under failure
✅ **Constitutional constraints** ensure safe, helpful behavior
✅ **Progressive complexity** from simple to advanced operations
✅ **Validation sandwich** (input → process → output verification)
</effective_patterns>

<system_message_structure>
# [Agent Name] System Message

## Agent Identity
[Specific role and expertise definition with clear domain focus]

## Core Capabilities
[3-5 main capabilities with specific examples and use cases]

## Tool Usage Guidelines
[For each available tool: when to use, why to use, how to use, validation steps]

## Context Management Rules
[What to preserve, summarize, forget; memory limits and compression strategies]

## Error Handling Protocol
[Primary approach, fallback strategies, escalation procedures, never-do rules]

## Validation Requirements
[Quality checks before responding, accuracy verification, completeness assessment]

## Success Criteria
[How to measure effectiveness, what constitutes good performance vs failure]

## Safety Constraints
[Constitutional AI principles, domain-specific safety rules, prohibited actions]
</system_message_structure>

<output_format>
Respond with a JSON object using this exact structure. Use JSON prefilling - start your response with just the opening brace:

{
  "success": true,
  "data": {
    "systemMessage": "Complete, professional system message following the structure above",
    "agentSummary": "2-3 sentence summary of what this agent does and its key strengths",
    "recommendedTools": ["Most important tools for this agent from the available list"],
    "suggestedTextFace": "Appropriate ASCII face that matches the agent's personality",
    "suggestedColor": "Color that fits the agent's domain (e.g., '#4CAF50' for security, '#2196F3' for research)",
    "complexity": "simple|moderate|advanced",
    "domain": "Primary domain or field this agent operates in",
    "riskLevel": "low|medium|high - based on potential impact of agent actions",
    "validationChecks": ["Key validation steps this agent should perform"],
    "commonFailures": ["Potential failure modes to watch for"],
    "safeguards": ["Specific safety measures for this agent type"]
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