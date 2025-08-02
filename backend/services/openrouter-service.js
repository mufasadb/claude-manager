const OpenAI = require('openai');

class OpenRouterService {
    constructor() {
        this.client = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        this.model = "google/gemini-flash-1.5";
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
Respond with a JSON object using this exact structure. Use JSON prefilling - start your response with just the opening brace:

{
  "success": true,
  "data": {
    "description": "Concise description (10-50 words) of what this command accomplishes",
    "content": "Complete markdown content with proper YAML frontmatter, sections, and examples",
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
        try {
            this.validateApiKey();

            const prompt = this.createCommandGenerationPrompt(commandName, instructions, category);

            console.log('Generating slash command with OpenRouter...');
            
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.2,
                max_tokens: 3000,
                extra_headers: {
                    "X-Title": "Claude Manager Command Generator",
                }
            });

            const response = completion.choices[0].message.content;
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

            const { description, content, suggestedCategory, allowedTools, argumentHint, metadata } = parsedResponse.data;

            if (!description || !content) {
                throw new Error('Missing required fields in OpenRouter response');
            }

            return {
                success: true,
                description,
                content,
                suggestedCategory: suggestedCategory || category,
                allowedTools: allowedTools || ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
                argumentHint: argumentHint || null,
                metadata: metadata || {
                    complexity: 'moderate',
                    useCase: 'general',
                    estimatedTime: '2-5 minutes'
                }
            };

        } catch (error) {
            console.error('Error generating slash command with OpenRouter:', error);
            
            // Return a structured error response
            return {
                success: false,
                error: error.message || 'Failed to generate command with OpenRouter'
            };
        }
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
            
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 4000,
                extra_headers: {
                    "X-Title": "Claude Manager Agent Generator",
                }
            });

            const response = completion.choices[0].message.content;
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
            
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "user",
                        content: "Reply with just 'OK' if you can receive this message."
                    }
                ],
                max_tokens: 10
            });

            return {
                success: true,
                response: completion.choices[0].message.content
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