#!/usr/bin/env node

/**
 * Meta-Agent MCP Server for Claude Manager
 * Provides agent system message generation based on proven patterns
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');

// Import the meta-agent logic (we'll create a simplified version)
class MetaAgentGenerator {
  constructor() {
    this.templates = {
      constitutional_base: `# Agent Identity and Constitutional Foundation
You are {{role}}, {{expertise_level}} in {{domain}}.

## Core Constitutional Principles
- **Helpfulness**: Always work toward achieving the user's legitimate goals
- **Harmlessness**: Avoid actions that could cause harm to users or systems
- **Honesty**: Acknowledge your limitations and express uncertainty when appropriate  
- **Transparency**: Show your reasoning process and explain your decisions

## Purpose and Scope
Your primary purpose is to {{primary_purpose}}.

{{#if team_context}}
## Team Integration
{{#if collaborative}}
You work as part of a collaborative team where agents coordinate as equals, sharing information and delegating tasks based on expertise and availability.
{{/if}}
{{#if hierarchical}}
You operate within a hierarchical structure with clear reporting lines and delegation protocols.
{{/if}}
{{/if}}`,

      role_specialization: `## Domain Expertise
You have {{experience_years}} years of equivalent experience in {{domain}}.

{{#if competencies}}
### Core Competencies
{{#each competencies}}
- **{{name}}**: {{description}}
{{#if techniques}}
  - Key techniques: {{techniques}}
{{/if}}
{{#if standards}}
  - Quality standards: {{standards}}
{{/if}}
{{/each}}
{{/if}}

### Expert Decision Framework
When working on {{domain}} tasks:
1. Apply systematic analysis and domain-specific methodologies
2. Consider industry best practices and standards
3. Validate against established quality criteria
4. Ensure compliance with relevant requirements`,

      reasoning_structure: `## Reasoning and Problem-Solving Approach

### Analysis Framework
For each task, follow this structured approach:

1. **Problem Analysis**
   - Break down the request into component parts
   - Identify key requirements and constraints
   - Assess complexity and resource needs

2. **Planning Phase**  
   - Determine appropriate tools and methods
   - Plan step-by-step approach
   - Identify potential risks and mitigation strategies

3. **Execution Phase**
   - Execute plan with continuous monitoring
   - Validate intermediate results
   - Adapt approach based on feedback

4. **Verification Phase**
   - Check outputs against requirements
   - Verify quality standards compliance
   - Confirm goal achievement

### Reasoning Pattern
Use this structured thinking pattern:

\`\`\`
Thought: [Analysis of current situation and requirements]
Action: [Specific action or tool use with clear rationale]
Observation: [Results analysis and implications]
Reflection: [What this tells us and next steps]
\`\`\`

Continue this cycle until the task is complete or escalation is needed.`,

      tool_integration: `{{#if tools}}
## Available Tools and Usage Guidelines

{{#each tools}}
### {{name}}
**Purpose**: {{description}}
**Use when**: {{usage_conditions}}
{{#if validation_requirements}}
**Validation**: {{validation_requirements}}
{{/if}}
**Error handling**: {{error_procedures}}

{{/each}}

### Tool Usage Principles
1. **Selection**: Choose the most appropriate tool for each specific need
2. **Validation**: Always validate tool outputs before proceeding
3. **Error Handling**: Implement graceful fallbacks for tool failures
4. **Efficiency**: Minimize unnecessary tool calls through planning

### Resource Management
- Maximum tool calls per task: {{max_tool_calls}}
- Always plan tool usage before execution
- Monitor tool performance and adapt as needed
{{/if}}`,

      communication_protocols: `## Communication and Coordination

### Communication Style
- Tone: {{communication_style}}
- Format: {{output_format}}
- Clarity: Use clear, specific language
- Structure: Organize information logically

### Status Reporting
**Progress Updates**: "Working on [task] - [progress]% complete - [current_step]"
**Completion**: "Completed [task] - Results: [summary] - Quality: [validation_status]"
**Issues**: "Blocked on [task] - Issue: [description] - Escalating to [target]"

{{#if team_context}}
### Handoff Protocols
**When delegating tasks**:
- "Passing [task] to [target_agent] because [reason]"
- "Context: [relevant_background]"
- "Success criteria: [specific_measures]"
- "Deadline: [timeframe]"

**When receiving tasks**:
- "Received [task] from [source_agent]"
- "Understanding: [task_interpretation]"
- "Approach: [planned_method]"
- "Questions: [clarifications_needed]"
- "Estimated completion: [timeframe]"
{{/if}}

### Escalation Triggers
Escalate to human oversight when:
{{#each escalation_conditions}}
- {{this}}
{{/each}}
- Uncertainty about safety implications
- Resource constraints prevent task completion
- Conflicting requirements or goals`,

      safety_constraints: `## Safety and Operational Constraints

### Safety Boundaries
{{#if high_safety}}
**Critical Safety Requirements**:
- Never perform actions that could cause system damage
- Always validate potentially destructive operations
- Require explicit confirmation for high-risk actions
- Maintain comprehensive audit logs
{{else}}
{{#if medium_safety}}
**Standard Safety Requirements**:
- Validate inputs and outputs for safety
- Avoid potentially harmful operations
- Log all significant actions
{{else}}
**Basic Safety Requirements**:
- Follow standard operational procedures
- Report unusual situations
{{/if}}
{{/if}}

### Quality Assurance
{{#if quality_standards}}
All outputs must meet:
{{#each quality_standards}}
- {{name}}: {{description}}
  - Measurement: {{measurement_method}}
  - Threshold: {{threshold}}
{{/each}}
{{/if}}

{{#if domain_standards}}
### Domain-Specific Standards
Ensure compliance with:
{{#each domain_standards}}
- {{this}}
{{/each}}
{{/if}}

### Error Handling and Recovery
1. **Detection**: Monitor for errors, inconsistencies, and safety issues
2. **Response**: Implement graceful error handling with clear error messages
3. **Recovery**: Use fallback procedures and alternative approaches
4. **Learning**: Document issues and improvements for future reference

### Circuit Breakers
If you encounter repeated failures or safety concerns:
1. Stop current operation immediately
2. Document the issue clearly
3. Escalate to human oversight
4. Do not attempt risky recovery procedures`
    };

    this.expertiseMapping = {
      'beginner': { years: '1-2', description: 'a beginner' },
      'intermediate': { years: '3-5', description: 'an intermediate practitioner' },
      'advanced': { years: '6-10', description: 'an advanced practitioner' },
      'expert': { years: '10+', description: 'an expert' }
    };
  }

  generateSystemMessage(config) {
    try {
      // Parse configuration
      const parsedConfig = typeof config === 'string' ? JSON.parse(config) : config;
      
      // Build template context
      const context = this.buildTemplateContext(parsedConfig);
      
      // Generate sections
      const sections = [];
      
      // Always include constitutional base
      sections.push(this.renderTemplate('constitutional_base', context));
      
      // Add role specialization if competencies provided
      if (parsedConfig.competencies && parsedConfig.competencies.length > 0) {
        sections.push(this.renderTemplate('role_specialization', context));
      }
      
      // Always add reasoning structure
      sections.push(this.renderTemplate('reasoning_structure', context));
      
      // Add tool integration if tools provided
      if (parsedConfig.tools && parsedConfig.tools.length > 0) {
        sections.push(this.renderTemplate('tool_integration', context));
      }
      
      // Always add communication protocols
      sections.push(this.renderTemplate('communication_protocols', context));
      
      // Always add safety constraints
      sections.push(this.renderTemplate('safety_constraints', context));
      
      // Combine sections
      const systemMessage = sections.join('\n\n');
      
      // Validate the message
      const validation = this.validateSystemMessage(systemMessage, parsedConfig);
      
      return {
        success: true,
        system_message: systemMessage,
        validation: validation,
        analysis: {
          sections_generated: sections.length,
          has_tools: !!(parsedConfig.tools && parsedConfig.tools.length > 0),
          has_competencies: !!(parsedConfig.competencies && parsedConfig.competencies.length > 0),
          safety_level: parsedConfig.safety_level || 'medium'
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        system_message: null
      };
    }
  }

  buildTemplateContext(config) {
    const expertise = this.expertiseMapping[config.expertise_level] || this.expertiseMapping['intermediate'];
    
    return {
      role: config.role || 'Agent',
      domain: config.domain || 'General',
      expertise_level: expertise.description,
      experience_years: expertise.years,
      primary_purpose: config.primary_purpose || 'Assist users with their requests',
      team_context: config.team_context === 'collaborative' || config.team_context === 'hierarchical',
      collaborative: config.team_context === 'collaborative',
      hierarchical: config.team_context === 'hierarchical',
      competencies: config.competencies || [],
      tools: config.tools || [],
      max_tool_calls: config.max_tool_calls || 10,
      communication_style: config.communication_style || 'professional',
      output_format: config.output_format || 'structured_text',
      escalation_conditions: config.escalation_conditions || [
        'Requirements unclear or conflicting',
        'Resource constraints prevent completion'
      ],
      quality_standards: config.quality_standards || [],
      domain_standards: config.domain_standards || [],
      high_safety: config.safety_level === 'high',
      medium_safety: config.safety_level === 'medium' || !config.safety_level
    };
  }

  renderTemplate(templateName, context) {
    const template = this.templates[templateName];
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Simple template rendering (replace {{variable}} patterns)
    let rendered = template;
    
    // Handle simple variables
    Object.keys(context).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, context[key] || '');
    });

    // Handle if blocks
    rendered = this.handleIfBlocks(rendered, context);
    
    // Handle each blocks
    rendered = this.handleEachBlocks(rendered, context);
    
    return rendered;
  }

  handleIfBlocks(template, context) {
    // Handle {{#if variable}} blocks
    const ifRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
    return template.replace(ifRegex, (match, variable, content) => {
      return context[variable] ? content : '';
    });
  }

  handleEachBlocks(template, context) {
    // Handle {{#each array}} blocks
    const eachRegex = /{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g;
    return template.replace(eachRegex, (match, variable, content) => {
      const array = context[variable];
      if (!Array.isArray(array)) return '';
      
      return array.map(item => {
        let itemContent = content;
        
        // Replace {{this}} with primitive values
        if (typeof item === 'string') {
          itemContent = itemContent.replace(/{{this}}/g, item);
        }
        
        // Replace {{property}} with object properties
        if (typeof item === 'object') {
          Object.keys(item).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            itemContent = itemContent.replace(regex, item[key] || '');
          });
        }
        
        return itemContent;
      }).join('');
    });
  }

  validateSystemMessage(message, config) {
    const checks = {
      has_constitutional_principles: /constitutional principles/i.test(message),
      has_role_definition: new RegExp(config.role || 'agent', 'i').test(message),
      has_reasoning_structure: /reasoning|thought|action|observation/i.test(message),
      has_safety_constraints: /safety|error handling|escalation/i.test(message),
      has_communication_protocols: /communication|reporting|status/i.test(message)
    };

    const passed_checks = Object.values(checks).filter(Boolean).length;
    const total_checks = Object.keys(checks).length;

    return {
      overall_pass: passed_checks >= 4, // Require at least 4/5 checks
      passed_checks,
      total_checks,
      checks,
      suggestions: passed_checks < 4 ? ['Review and enhance missing sections'] : []
    };
  }

  getExampleConfigs() {
    return {
      technical_specialist: {
        role: "Senior Python Developer",
        domain: "Software Development",
        expertise_level: "expert",
        primary_purpose: "Develop, review, and optimize Python applications with focus on code quality, performance, and maintainability",
        team_context: "collaborative",
        safety_level: "high",
        competencies: [
          {
            name: "Python Development",
            description: "Advanced Python programming and best practices",
            techniques: "Design patterns, OOP principles, Functional programming",
            standards: "PEP 8 compliance, Type hints usage, Docstring conventions"
          }
        ],
        tools: [
          {
            name: "code_analyzer",
            description: "Static code analysis tool for Python",
            usage_conditions: "When reviewing code quality, security, or performance",
            validation_requirements: "Verify analysis results align with coding standards"
          }
        ],
        escalation_conditions: [
          "Security vulnerabilities detected",
          "Breaking changes required",
          "Requirements unclear or conflicting"
        ]
      },
      data_analyst: {
        role: "Senior Data Analyst",
        domain: "Data Science and Analytics",
        expertise_level: "advanced",
        primary_purpose: "Extract insights from complex datasets, create actionable recommendations, and support data-driven decision making",
        team_context: "collaborative",
        safety_level: "medium",
        competencies: [
          {
            name: "Statistical Analysis",
            description: "Advanced statistical methods and interpretation",
            techniques: "Hypothesis testing, Regression analysis, Time series analysis",
            standards: "Statistical significance p < 0.05, Effect size reporting"
          }
        ],
        tools: [
          {
            name: "data_query_engine",
            description: "SQL and NoSQL database query execution",
            usage_conditions: "When accessing and aggregating data from databases",
            validation_requirements: "Verify query results for accuracy and completeness"
          }
        ]
      },
      project_manager: {
        role: "Senior Project Manager",
        domain: "Project Management",
        expertise_level: "expert",
        primary_purpose: "Lead complex projects from initiation to completion, ensuring timely delivery, quality outcomes, and stakeholder satisfaction",
        team_context: "hierarchical",
        safety_level: "high",
        competencies: [
          {
            name: "Project Planning",
            description: "Comprehensive project planning and execution strategy",
            techniques: "Work breakdown structure, Critical path method, Agile methodologies",
            standards: "Detailed project charter, Realistic timeline estimation"
          }
        ],
        escalation_conditions: [
          "Budget overruns exceeding 10% without authorization",
          "Critical timeline slippage affecting delivery commitments",
          "Resource conflicts that cannot be resolved at team level"
        ]
      }
    };
  }
}

class MetaAgentMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'meta-agent',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.metaAgent = new MetaAgentGenerator();
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'generate_agent',
            description: 'Generate an effective agent system message based on configuration',
            inputSchema: {
              type: 'object',
              properties: {
                config: {
                  type: 'string',
                  description: 'JSON configuration for the agent (role, domain, expertise_level, etc.)'
                }
              },
              required: ['config']
            }
          },
          {
            name: 'get_example_config',
            description: 'Get example agent configurations for different types',
            inputSchema: {
              type: 'object',
              properties: {
                agent_type: {
                  type: 'string',
                  enum: ['technical_specialist', 'data_analyst', 'project_manager'],
                  description: 'Type of example agent configuration to retrieve'
                }
              },
              required: ['agent_type']
            }
          },
          {
            name: 'validate_config',
            description: 'Validate an agent configuration before generation',
            inputSchema: {
              type: 'object',
              properties: {
                config: {
                  type: 'string',
                  description: 'JSON configuration to validate'
                }
              },
              required: ['config']
            }
          },
          {
            name: 'list_agent_types',
            description: 'List available agent types and their descriptions',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'generate_agent':
            return await this.handleGenerateAgent(args);
          
          case 'get_example_config':
            return await this.handleGetExampleConfig(args);
          
          case 'validate_config':
            return await this.handleValidateConfig(args);
          
          case 'list_agent_types':
            return await this.handleListAgentTypes(args);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async handleGenerateAgent(args) {
    const { config } = args;
    
    if (!config) {
      throw new Error('Configuration is required');
    }

    const result = this.metaAgent.generateSystemMessage(config);
    
    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      content: [
        {
          type: 'text',
          text: `# Generated Agent System Message

${result.system_message}

---

## Generation Report

**Analysis:**
- Sections generated: ${result.analysis.sections_generated}
- Has tools: ${result.analysis.has_tools}
- Has competencies: ${result.analysis.has_competencies}  
- Safety level: ${result.analysis.safety_level}

**Validation:**
- Overall pass: ${result.validation.overall_pass}
- Checks passed: ${result.validation.passed_checks}/${result.validation.total_checks}
${result.validation.suggestions.length > 0 ? `\n**Suggestions:**\n${result.validation.suggestions.map(s => `- ${s}`).join('\n')}` : ''}

**Constitutional Compliance:** ${result.validation.checks.has_constitutional_principles ? '✓' : '✗'}
**Role Definition:** ${result.validation.checks.has_role_definition ? '✓' : '✗'}
**Reasoning Structure:** ${result.validation.checks.has_reasoning_structure ? '✓' : '✗'}
**Safety Constraints:** ${result.validation.checks.has_safety_constraints ? '✓' : '✗'}
**Communication Protocols:** ${result.validation.checks.has_communication_protocols ? '✓' : '✗'}`
        }
      ]
    };
  }

  async handleGetExampleConfig(args) {
    const { agent_type } = args;
    
    const examples = this.metaAgent.getExampleConfigs();
    
    if (!examples[agent_type]) {
      throw new Error(`Unknown agent type: ${agent_type}. Available types: ${Object.keys(examples).join(', ')}`);
    }

    const config = examples[agent_type];

    return {
      content: [
        {
          type: 'text',
          text: `# Example Configuration: ${agent_type}

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

## Usage

You can use this configuration directly with the generate_agent tool:

\`\`\`
generate_agent(config='${JSON.stringify(config)}')
\`\`\`

Or modify it to suit your specific needs before generation.`
        }
      ]
    };
  }

  async handleValidateConfig(args) {
    const { config } = args;
    
    if (!config) {
      throw new Error('Configuration is required');
    }

    try {
      const parsedConfig = typeof config === 'string' ? JSON.parse(config) : config;
      
      // Basic validation
      const required_fields = ['role', 'domain', 'expertise_level', 'primary_purpose'];
      const missing_fields = required_fields.filter(field => !parsedConfig[field]);
      
      const valid_expertise_levels = ['beginner', 'intermediate', 'advanced', 'expert'];
      const valid_team_contexts = ['solo', 'collaborative', 'hierarchical'];
      const valid_safety_levels = ['low', 'medium', 'high'];
      
      const issues = [];
      
      if (missing_fields.length > 0) {
        issues.push(`Missing required fields: ${missing_fields.join(', ')}`);
      }
      
      if (parsedConfig.expertise_level && !valid_expertise_levels.includes(parsedConfig.expertise_level)) {
        issues.push(`Invalid expertise_level. Must be one of: ${valid_expertise_levels.join(', ')}`);
      }
      
      if (parsedConfig.team_context && !valid_team_contexts.includes(parsedConfig.team_context)) {
        issues.push(`Invalid team_context. Must be one of: ${valid_team_contexts.join(', ')}`);
      }
      
      if (parsedConfig.safety_level && !valid_safety_levels.includes(parsedConfig.safety_level)) {
        issues.push(`Invalid safety_level. Must be one of: ${valid_safety_levels.join(', ')}`);
      }

      const is_valid = issues.length === 0;

      return {
        content: [
          {
            type: 'text',
            text: `# Configuration Validation

**Status:** ${is_valid ? '✅ VALID' : '❌ INVALID'}

${issues.length > 0 ? `**Issues:**\n${issues.map(issue => `- ${issue}`).join('\n')}\n` : ''}

**Configuration Summary:**
- Role: ${parsedConfig.role || 'Not specified'}
- Domain: ${parsedConfig.domain || 'Not specified'}
- Expertise Level: ${parsedConfig.expertise_level || 'Not specified'}
- Primary Purpose: ${parsedConfig.primary_purpose || 'Not specified'}
- Team Context: ${parsedConfig.team_context || 'solo (default)'}
- Safety Level: ${parsedConfig.safety_level || 'medium (default)'}
- Tools: ${parsedConfig.tools ? parsedConfig.tools.length : 0}
- Competencies: ${parsedConfig.competencies ? parsedConfig.competencies.length : 0}

${is_valid ? '✅ Configuration is ready for agent generation!' : '❌ Please fix the issues above before generating an agent.'}`
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `# Configuration Validation

**Status:** ❌ INVALID

**Error:** Invalid JSON format: ${error.message}

Please ensure your configuration is valid JSON.`
          }
        ]
      };
    }
  }

  async handleListAgentTypes(args) {
    const agentTypes = {
      'technical_specialist': {
        description: 'Senior-level technical experts with deep domain knowledge',
        examples: 'Software Developer, DevOps Engineer, Security Analyst',
        focus: 'Tool mastery, quality assurance, performance optimization'
      },
      'data_analyst': {
        description: 'Data-focused professionals who extract insights from complex datasets', 
        examples: 'Data Scientist, Business Analyst, Research Specialist',
        focus: 'Statistical rigor, evidence validation, report generation'
      },
      'project_manager': {
        description: 'Coordination-focused professionals who manage resources and timelines',
        examples: 'Project Manager, Scrum Master, Program Director',
        focus: 'Multi-agent orchestration, progress tracking, stakeholder communication'
      }
    };

    return {
      content: [
        {
          type: 'text',
          text: `# Available Agent Types

${Object.entries(agentTypes).map(([type, info]) => `
## ${type}

**Description:** ${info.description}

**Examples:** ${info.examples}

**Focus Areas:** ${info.focus}

**Get Example:** \`get_example_config(agent_type='${type}')\`
`).join('')}

## Custom Configuration

You can also create custom agent configurations by providing a JSON object with:

**Required Fields:**
- \`role\`: Agent's specific role (e.g., "Senior Python Developer")
- \`domain\`: Area of expertise (e.g., "Software Development")  
- \`expertise_level\`: "beginner", "intermediate", "advanced", or "expert"
- \`primary_purpose\`: Clear statement of the agent's main objective

**Optional Fields:**
- \`team_context\`: "solo", "collaborative", or "hierarchical"
- \`safety_level\`: "low", "medium", or "high"
- \`tools\`: Array of tool configurations
- \`competencies\`: Array of core competency definitions
- \`escalation_conditions\`: Array of escalation triggers

Use \`validate_config(config='...')\` to check your configuration before generation.`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Meta-Agent MCP server running on stdio');
  }
}

// Run the server
const server = new MetaAgentMCPServer();
server.run().catch(console.error);