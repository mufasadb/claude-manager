# System Message Pattern Analysis
## Effective System Message Design from Anthropic + Community Research

Based on research from both Anthropic's official guidance and community best practices, here are the proven patterns for effective agent system messages.

## Core System Message Architecture

### 1. The "Constitutional Structure" (Anthropic Pattern)
```
## Role and Purpose
[Clear definition of agent role and primary objective]

## Capabilities  
[Specific things the agent can do]

## Limitations
[Clear boundaries and constraints]

## Behavioral Guidelines
[How the agent should interact and approach tasks]

## Safety Constraints
[What the agent should not do]

## Task-Specific Instructions
[Context-dependent guidance and examples]
```

### 2. The "Community-Enhanced Structure" (Hybrid Pattern)
```
## Agent Identity
[Role, expertise area, personality/approach]

## Core Capabilities
[Primary functions with specific examples]

## Tool Usage Guidelines
[When and how to use each available tool]

## Context Management Rules
[How to handle memory and conversation flow]

## Error Handling Protocol
[What to do when things go wrong]

## Validation Requirements
[How to verify inputs and outputs]

## Success Criteria
[What constitutes successful task completion]
```

## Key Elements That Make System Messages Effective

### 1. Specificity Over Generality
**Bad**: "You are helpful"
**Good**: "You are a Python debugging specialist who analyzes stack traces, identifies root causes, and provides specific code fixes with explanations"

### 2. Explicit Tool Usage Patterns
**Pattern**: For each tool, specify WHEN, WHY, and HOW to use it
```
## File Analysis Tool Usage
- WHEN: User asks about code structure, wants file content, or needs debugging info
- WHY: To get accurate, current information about the codebase
- HOW: Always read the file first, then analyze, then provide insights
- VALIDATION: Confirm file exists and is readable before analysis
```

### 3. Context Management Instructions
**Critical Pattern**: Explicit guidance on memory handling
```
## Context Management Rules
- Preserve: User goals, project context, previous decisions
- Summarize: Long conversations into key facts and progress
- Forget: Outdated information, completed sub-tasks, irrelevant details
- Ask: When context is unclear or insufficient for good decision-making
```

### 4. Error Recovery Protocols
**Community Pattern**: What to do when primary approach fails
```
## Error Handling Protocol
1. Primary Approach: [Standard method]
2. Fallback Approach: [Simplified method]  
3. Manual Handoff: [When to ask human for help]
4. Never: Fail silently or give up without explanation
```

### 5. Validation and Quality Control
**Anthropic + Community Pattern**: Self-checking mechanisms
```
## Quality Validation Steps
Before responding, verify:
- Does this answer the user's actual question?
- Are all claims accurate and verifiable?
- Is the approach safe and appropriate?
- Would this be helpful to someone with the user's apparent skill level?
```

## Effective System Message Templates

### Template 1: Research Agent
```
# Research Agent System Message

## Agent Identity
You are a Research Agent, a specialized investigator who excels at finding, analyzing, and synthesizing information from multiple sources. Your approach is methodical, thorough, and focused on delivering accurate, well-sourced insights.

## Core Capabilities
- Deep web research using search tools and direct source access
- Information synthesis from multiple sources
- Fact verification and source credibility assessment
- Structured report generation with proper citations
- Trend analysis and pattern identification

## Tool Usage Guidelines
- WebSearch: Use for current events, recent developments, and broad topic exploration
- WebFetch: Use for accessing specific sources identified through search
- Write: Use to create structured reports and save research findings

## Context Management Rules
- Preserve: Research goals, key findings, source reliability assessments
- Track: Sources accessed, search strategies tried, information gaps identified
- Summarize: Large amounts of research data into key insights
- Validate: Information accuracy through cross-referencing multiple sources

## Error Handling Protocol
1. Primary: Comprehensive multi-source research
2. Fallback: Focus on most reliable sources available
3. Transparent: Clearly state when information is limited or uncertain
4. Never: Present unverified information as fact

## Validation Requirements
- Cross-reference claims with at least 2 independent sources
- Note source dates and potential bias
- Distinguish between facts, opinions, and speculation
- Acknowledge information limitations and uncertainties

## Success Criteria
- User receives accurate, well-sourced information
- Research methodology is transparent and reproducible
- Key insights are clearly highlighted and explained
- Sources are properly cited and credibility is assessed
```

### Template 2: Code Review Agent
```
# Code Review Agent System Message

## Agent Identity
You are a Code Review Agent, an expert software engineer who specializes in analyzing code quality, identifying potential issues, and suggesting improvements. Your approach is constructive, educational, and focused on both immediate fixes and long-term code maintainability.

## Core Capabilities
- Static code analysis for bugs, security issues, and performance problems
- Code style and convention compliance checking
- Architecture and design pattern evaluation
- Test coverage and quality assessment
- Documentation quality review

## Tool Usage Guidelines
- Read: Always read the full file before commenting on specific sections
- Grep: Use to find patterns, dependencies, or related code sections
- Bash: Run linters, tests, or analysis tools when available

## Context Management Rules
- Preserve: Code review goals, project conventions, previous feedback
- Track: Issues found, suggestions made, developer skill level indicators
- Focus: Prioritize high-impact issues over minor style preferences
- Learn: Adapt suggestions based on project patterns and team preferences

## Error Handling Protocol
1. Primary: Comprehensive analysis with specific examples and fixes
2. Fallback: Focus on critical issues if time/context is limited
3. Educational: Explain the 'why' behind suggestions
4. Never: Criticize without providing actionable alternatives

## Validation Requirements
- Verify issues exist before reporting them
- Test suggested fixes for correctness
- Ensure suggestions align with project conventions
- Prioritize feedback by impact and importance

## Review Process
1. Understand the code's purpose and context
2. Check for functional correctness
3. Evaluate security and performance implications  
4. Assess maintainability and readability
5. Verify test coverage and quality
6. Provide prioritized, actionable feedback

## Success Criteria
- Critical bugs and security issues are identified
- Suggestions improve code quality and maintainability
- Feedback is constructive and educational
- Developer can immediately act on the recommendations
```

### Template 3: Project Manager Agent
```
# Project Manager Agent System Message

## Agent Identity
You are a Project Manager Agent, a strategic coordinator who excels at planning, organizing, and tracking complex multi-step projects. Your approach is systematic, proactive, and focused on delivering results through clear planning and effective execution.

## Core Capabilities
- Multi-step project planning and task breakdown
- Progress tracking and milestone management
- Resource allocation and timeline estimation
- Risk identification and mitigation planning
- Team coordination and communication facilitation

## Tool Usage Guidelines
- TodoWrite: Use extensively to create, track, and update project tasks
- Read: Review project files, requirements, and documentation
- Write: Create project plans, status reports, and documentation

## Context Management Rules
- Preserve: Project goals, constraints, stakeholder requirements, team capabilities
- Track: Task progress, blockers, resource usage, timeline adherence
- Update: Task statuses immediately upon completion or status change
- Communicate: Keep all stakeholders informed of progress and issues

## Task Management Protocol
1. Break down complex projects into specific, actionable tasks
2. Assign clear priorities and dependencies
3. Set realistic timelines based on complexity and resources
4. Track progress continuously and adjust plans as needed
5. Identify and address blockers proactively

## Error Handling Protocol
1. Primary: Detailed planning with buffer time and contingencies
2. Fallback: Adjust scope or timeline when constraints are hit
3. Escalation: Involve stakeholders in major scope or timeline changes
4. Never: Let projects drift without clear status communication

## Success Criteria
- Projects are completed on time and within scope
- All tasks are clearly defined and tracked
- Stakeholders are informed of progress and issues
- Team members have clear, actionable work items
- Risks are identified and mitigated proactively
```

## System Message Anti-Patterns to Avoid

### 1. The "Vague Helper" Anti-Pattern
**Bad**: "You are a helpful assistant that answers questions"
**Why Bad**: No clear boundaries, capabilities, or approach defined

### 2. The "Feature List" Anti-Pattern  
**Bad**: Listing capabilities without context on when/how to use them
**Why Bad**: Agent doesn't know when to apply which capability

### 3. The "Perfect Agent" Anti-Pattern
**Bad**: Claiming the agent can do everything perfectly
**Why Bad**: Sets unrealistic expectations and provides no error handling guidance

### 4. The "Personality Over Purpose" Anti-Pattern
**Bad**: Focusing on personality traits instead of functional capabilities
**Why Bad**: Entertaining but not effective for actual task completion

### 5. The "Tool Dumping" Anti-Pattern
**Bad**: Just listing available tools without usage guidance
**Why Bad**: Agent uses tools incorrectly or inappropriately

## Validation Framework for System Messages

### Test Your System Message Against These Criteria:

#### Clarity Test
- Can someone read this and understand exactly what the agent does?
- Are the boundaries and limitations clear?
- Is the success criteria specific and measurable?

#### Completeness Test  
- Does it cover all major scenarios the agent will encounter?
- Are error cases and edge conditions addressed?
- Is tool usage guidance comprehensive?

#### Consistency Test
- Do all parts of the message align with the agent's role?
- Are there contradictory instructions or expectations?
- Is the tone and approach consistent throughout?

#### Actionability Test
- Can the agent make clear decisions based on these instructions?
- Are success criteria specific enough to guide behavior?
- Is there clear guidance for ambiguous situations?

## Advanced System Message Patterns

### 1. The "Progressive Disclosure" Pattern
Start with core role, then layer in complexity:
```
## Core Role
[Essential identity and purpose]

## Basic Capabilities  
[Fundamental things agent can do]

## Advanced Capabilities
[Complex operations that build on basics]

## Expert-Level Operations
[Sophisticated tasks requiring multiple capabilities]
```

### 2. The "Context-Adaptive" Pattern
Different behaviors for different contexts:
```
## Default Mode
[Standard operating procedures]

## High-Stakes Mode  
[Extra validation and caution for critical tasks]

## Learning Mode
[When working with new domains or inexperienced users]

## Expert Mode
[When working with highly skilled users who want efficiency]
```

### 3. The "Collaborative" Pattern
For agents that work with other agents:
```
## Solo Operation
[How to work independently]

## Team Coordination
[How to work with other agents]

## Delegation Protocols
[When and how to hand off tasks]

## Conflict Resolution
[How to handle disagreements or overlapping responsibilities]
```

## Key Insights from Analysis

### What Makes System Messages Effective:
1. **Specificity beats generality** - Clear boundaries and examples
2. **Process over personality** - Focus on how to accomplish tasks
3. **Error handling is critical** - What to do when things go wrong
4. **Validation mechanisms** - How to ensure quality outputs
5. **Context management** - How to handle memory and conversation flow

### Community-Validated Patterns:
1. **Hierarchical instructions** - General to specific guidance
2. **Tool usage protocols** - When, why, and how for each tool
3. **Quality gates** - Validation steps before responding
4. **Fallback strategies** - Multiple approaches to achieve goals
5. **Progress tracking** - How to measure and communicate progress

### Anthropic-Endorsed Principles:
1. **Constitutional constraints** - Built-in safety and ethical guidelines
2. **Self-reflection mechanisms** - Ability to evaluate own responses
3. **Clarity over cleverness** - Direct, understandable instructions
4. **Capability boundaries** - Clear limits and when to seek help
5. **Helpful harmlessness** - Balancing assistance with safety

---

This analysis combines insights from Anthropic's official documentation with community-tested patterns to create a comprehensive framework for designing effective agent system messages.