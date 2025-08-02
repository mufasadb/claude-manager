#!/usr/bin/env python3
"""
Meta-Agent: Generates effective agent system messages based on proven patterns
from Anthropic's Constitutional AI and community best practices.

Usage:
    python meta_agent.py --config agent_config.yaml
    python meta_agent.py --interactive
    python meta_agent.py --example technical_specialist
"""

import yaml
import json
import argparse
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from enum import Enum
from jinja2 import Environment, DictLoader
import re

class ExpertiseLevel(Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    EXPERT = "expert"

class TeamContext(Enum):
    SOLO = "solo"
    COLLABORATIVE = "collaborative"
    HIERARCHICAL = "hierarchical"

class SafetyLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

@dataclass
class Tool:
    name: str
    description: str
    usage_conditions: str
    validation_requirements: str = ""
    error_procedures: str = "Log error and continue with alternative approach"

@dataclass
class Competency:
    name: str
    description: str
    techniques: List[str] = field(default_factory=list)
    standards: List[str] = field(default_factory=list)

@dataclass
class DecisionScenario:
    name: str
    approach: str
    considerations: List[str] = field(default_factory=list)
    success_criteria: List[str] = field(default_factory=list)

@dataclass
class QualityStandard:
    name: str
    description: str
    measurement_method: str
    threshold: str

@dataclass
class AgentRequirements:
    # Basic Information
    role: str
    domain: str
    expertise_level: ExpertiseLevel
    primary_purpose: str
    
    # Context
    team_context: TeamContext = TeamContext.SOLO
    work_environment: str = "general"
    
    # Capabilities
    primary_tasks: List[str] = field(default_factory=list)
    tools_available: List[Tool] = field(default_factory=list)
    core_competencies: List[Competency] = field(default_factory=list)
    
    # Constraints
    safety_level: SafetyLevel = SafetyLevel.MEDIUM
    max_tool_calls: int = 10
    max_reasoning_steps: int = 20
    
    # Communication
    communication_style: str = "professional"
    output_format: str = "structured_text"
    escalation_conditions: List[str] = field(default_factory=list)
    
    # Quality Standards
    quality_standards: List[QualityStandard] = field(default_factory=list)
    domain_standards: List[str] = field(default_factory=list)

class TemplateLibrary:
    """Library of Jinja2 templates for different agent components"""
    
    TEMPLATES = {
        'constitutional_base': '''# Agent Identity and Constitutional Foundation
You are {{role}}, a {{expertise_level.value}} in {{domain}}.

## Core Constitutional Principles
- **Helpfulness**: Always work toward achieving the user's legitimate goals
- **Harmlessness**: Avoid actions that could cause harm to users or systems  
- **Honesty**: Acknowledge your limitations and express uncertainty when appropriate
- **Transparency**: Show your reasoning process and explain your decisions

## Purpose and Scope
Your primary purpose is to {{primary_purpose}}.

{% if team_context != TeamContext.SOLO %}
## Team Integration
{% if team_context == TeamContext.COLLABORATIVE %}
You work as part of a collaborative team where agents coordinate as equals, sharing information and delegating tasks based on expertise and availability.
{% elif team_context == TeamContext.HIERARCHICAL %}
You operate within a hierarchical structure with clear reporting lines and delegation protocols.
{% endif %}
{% endif %}''',

        'role_specialization': '''## Domain Expertise
You have {{experience_years}} years of equivalent experience in {{domain}}.

{% if core_competencies %}
### Core Competencies
{% for competency in core_competencies %}
- **{{competency.name}}**: {{competency.description}}
{% if competency.techniques %}
  - Key techniques: {{competency.techniques|join(', ')}}
{% endif %}
{% if competency.standards %}
  - Quality standards: {{competency.standards|join(', ')}}
{% endif %}
{% endfor %}
{% endif %}

### Expert Decision Framework
When working on {{domain}} tasks:
1. Apply systematic analysis and domain-specific methodologies
2. Consider industry best practices and standards
3. Validate against established quality criteria
4. Ensure compliance with relevant requirements

{% if decision_scenarios %}
### Specialized Scenarios
{% for scenario in decision_scenarios %}
**{{scenario.name}}**:
- Approach: {{scenario.approach}}
{% if scenario.considerations %}
- Key considerations: {{scenario.considerations|join(', ')}}
{% endif %}
{% if scenario.success_criteria %}
- Success criteria: {{scenario.success_criteria|join(', ')}}
{% endif %}
{% endfor %}
{% endif %}''',

        'reasoning_structure': '''## Reasoning and Problem-Solving Approach

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

```
Thought: [Analysis of current situation and requirements]
Action: [Specific action or tool use with clear rationale]
Observation: [Results analysis and implications]
Reflection: [What this tells us and next steps]
```

Continue this cycle until the task is complete or escalation is needed.

### Maximum Reasoning Steps
Limit reasoning chains to {{max_reasoning_steps}} steps. If a solution requires more steps, break the problem into smaller sub-tasks or escalate for human guidance.''',

        'tool_integration': '''{% if tools_available %}
## Available Tools and Usage Guidelines

{% for tool in tools_available %}
### {{tool.name}}
**Purpose**: {{tool.description}}
**Use when**: {{tool.usage_conditions}}
{% if tool.validation_requirements %}
**Validation**: {{tool.validation_requirements}}
{% endif %}
**Error handling**: {{tool.error_procedures}}

{% endfor %}

### Tool Usage Principles
1. **Selection**: Choose the most appropriate tool for each specific need
2. **Validation**: Always validate tool outputs before proceeding
3. **Error Handling**: Implement graceful fallbacks for tool failures
4. **Efficiency**: Minimize unnecessary tool calls through planning

### Resource Management
- Maximum tool calls per task: {{max_tool_calls}}
- Always plan tool usage before execution
- Monitor tool performance and adapt as needed
{% endif %}''',

        'communication_protocols': '''## Communication and Coordination

### Communication Style
- Tone: {{communication_style}}
- Format: {{output_format}}
- Clarity: Use clear, specific language
- Structure: Organize information logically

### Status Reporting
**Progress Updates**: "Working on [task] - [progress]% complete - [current_step]"
**Completion**: "Completed [task] - Results: [summary] - Quality: [validation_status]"
**Issues**: "Blocked on [task] - Issue: [description] - Escalating to [target]"

{% if team_context != TeamContext.SOLO %}
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
{% endif %}

### Escalation Triggers
Escalate to human oversight when:
{% for condition in escalation_conditions %}
- {{condition}}
{% endfor %}
- Uncertainty about safety implications
- Resource constraints prevent task completion
- Conflicting requirements or goals''',

        'safety_constraints': '''## Safety and Operational Constraints

### Safety Boundaries
{% if safety_level == SafetyLevel.HIGH %}
**Critical Safety Requirements**:
- Never perform actions that could cause system damage
- Always validate potentially destructive operations
- Require explicit confirmation for high-risk actions
- Maintain comprehensive audit logs
{% elif safety_level == SafetyLevel.MEDIUM %}
**Standard Safety Requirements**:
- Validate inputs and outputs for safety
- Avoid potentially harmful operations
- Log all significant actions
{% else %}
**Basic Safety Requirements**:
- Follow standard operational procedures
- Report unusual situations
{% endif %}

### Quality Assurance
{% if quality_standards %}
All outputs must meet:
{% for standard in quality_standards %}
- {{standard.name}}: {{standard.description}}
  - Measurement: {{standard.measurement_method}}
  - Threshold: {{standard.threshold}}
{% endfor %}
{% endif %}

{% if domain_standards %}
### Domain-Specific Standards
Ensure compliance with:
{% for standard in domain_standards %}
- {{standard}}
{% endfor %}
{% endif %}

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
4. Do not attempt risky recovery procedures''',

        'output_formatting': '''## Output Format and Standards

### Response Structure
Use this structure for all responses:

1. **Summary**: Brief overview of what was accomplished
2. **Details**: Step-by-step breakdown of work performed
3. **Results**: Specific outputs, findings, or deliverables
4. **Quality Check**: Validation against requirements and standards
5. **Next Steps**: Recommendations or follow-up actions if applicable

### {{output_format|title}} Format Requirements
{% if output_format == "structured_markdown" %}
- Use clear headers and subheaders
- Include code blocks for technical content
- Use lists and tables for organized information
- Include relevant links and references
{% elif output_format == "json" %}
- Use valid JSON syntax
- Include all required fields
- Validate JSON structure before output
- Use descriptive key names
{% elif output_format == "xml" %}
- Use valid XML syntax with proper escaping
- Include XML declaration if required
- Use semantic tag names
- Validate XML structure before output
{% else %}
- Use clear, structured text format
- Organize information with headers and bullets
- Include all requested information
- Maintain consistent formatting
{% endif %}

### Completion Indicators
Always end responses with:
- **Status**: [COMPLETED/PARTIAL/ESCALATED]
- **Confidence**: [HIGH/MEDIUM/LOW] 
- **Validation**: [PASSED/FAILED/PENDING]'''
    }

    def __init__(self):
        self.env = Environment(loader=DictLoader(self.TEMPLATES))
        # Add enum comparisons to Jinja2 environment
        self.env.globals['TeamContext'] = TeamContext
        self.env.globals['SafetyLevel'] = SafetyLevel
        self.env.globals['ExpertiseLevel'] = ExpertiseLevel

class QualityValidator:
    """Validates generated system messages against best practices"""
    
    def __init__(self):
        self.validation_rules = [
            self._check_constitutional_compliance,
            self._check_role_clarity,
            self._check_reasoning_structure,
            self._check_safety_constraints,
            self._check_communication_protocols
        ]
    
    def validate(self, system_message: str, requirements: AgentRequirements) -> Dict[str, Any]:
        """Run all validation checks"""
        results = {
            'overall_pass': True,
            'checks': {},
            'suggestions': []
        }
        
        for rule in self.validation_rules:
            check_name = rule.__name__.replace('_check_', '')
            check_result = rule(system_message, requirements)
            results['checks'][check_name] = check_result
            
            if not check_result['passed']:
                results['overall_pass'] = False
                results['suggestions'].extend(check_result.get('suggestions', []))
        
        return results
    
    def _check_constitutional_compliance(self, message: str, requirements: AgentRequirements) -> Dict[str, Any]:
        """Check for constitutional AI principles"""
        required_principles = ['helpfulness', 'harmlessness', 'honesty', 'transparency']
        found_principles = []
        
        for principle in required_principles:
            if principle.lower() in message.lower():
                found_principles.append(principle)
        
        passed = len(found_principles) >= 3  # Require at least 3 of 4 principles
        
        return {
            'passed': passed,
            'found_principles': found_principles,
            'suggestions': [] if passed else ['Add explicit constitutional principles section']
        }
    
    def _check_role_clarity(self, message: str, requirements: AgentRequirements) -> Dict[str, Any]:
        """Check for clear role definition"""
        has_role = requirements.role.lower() in message.lower()
        has_domain = requirements.domain.lower() in message.lower()
        has_purpose = 'purpose' in message.lower()
        
        clarity_score = sum([has_role, has_domain, has_purpose])
        passed = clarity_score >= 2
        
        suggestions = []
        if not has_role:
            suggestions.append('Include explicit role definition')
        if not has_domain:
            suggestions.append('Specify domain expertise')
        if not has_purpose:
            suggestions.append('Define clear purpose statement')
        
        return {
            'passed': passed,
            'clarity_score': clarity_score,
            'suggestions': suggestions
        }
    
    def _check_reasoning_structure(self, message: str, requirements: AgentRequirements) -> Dict[str, Any]:
        """Check for structured reasoning approach"""
        reasoning_patterns = ['thought:', 'action:', 'observation:', 'analysis', 'planning']
        found_patterns = sum(1 for pattern in reasoning_patterns if pattern.lower() in message.lower())
        
        passed = found_patterns >= 2
        
        return {
            'passed': passed,
            'reasoning_patterns_found': found_patterns,
            'suggestions': [] if passed else ['Add structured reasoning framework']
        }
    
    def _check_safety_constraints(self, message: str, requirements: AgentRequirements) -> Dict[str, Any]:
        """Check for appropriate safety constraints"""
        safety_keywords = ['safety', 'error handling', 'escalation', 'validation', 'constraints']
        found_keywords = sum(1 for keyword in safety_keywords if keyword.lower() in message.lower())
        
        required_safety_level = 2 if requirements.safety_level == SafetyLevel.HIGH else 1
        passed = found_keywords >= required_safety_level
        
        return {
            'passed': passed,
            'safety_keywords_found': found_keywords,
            'suggestions': [] if passed else ['Add more explicit safety constraints and procedures']
        }
    
    def _check_communication_protocols(self, message: str, requirements: AgentRequirements) -> Dict[str, Any]:
        """Check for clear communication protocols"""
        comm_elements = ['communication', 'reporting', 'status', 'format']
        found_elements = sum(1 for element in comm_elements if element.lower() in message.lower())
        
        passed = found_elements >= 2
        
        return {
            'passed': passed,
            'communication_elements': found_elements,
            'suggestions': [] if passed else ['Add clear communication and reporting protocols']
        }

class MetaAgent:
    """Main meta-agent class for generating agent system messages"""
    
    def __init__(self):
        self.template_library = TemplateLibrary()
        self.validator = QualityValidator()
        
        # Experience years mapping based on expertise level
        self.experience_mapping = {
            ExpertiseLevel.BEGINNER: "1-2",
            ExpertiseLevel.INTERMEDIATE: "3-5", 
            ExpertiseLevel.ADVANCED: "6-10",
            ExpertiseLevel.EXPERT: "10+"
        }
    
    def generate_system_message(self, requirements: AgentRequirements) -> Dict[str, Any]:
        """Generate a complete system message based on requirements"""
        
        # Analyze requirements to determine which templates to use
        analysis = self._analyze_requirements(requirements)
        
        # Select appropriate templates
        templates_to_use = self._select_templates(analysis)
        
        # Generate each section
        sections = []
        template_context = self._build_template_context(requirements)
        
        for template_name in templates_to_use:
            template = self.template_library.env.get_template(template_name)
            section = template.render(**template_context)
            sections.append(section)
        
        # Combine sections
        system_message = '\n\n'.join(sections)
        
        # Validate the generated message
        validation_result = self.validator.validate(system_message, requirements)
        
        return {
            'system_message': system_message,
            'validation': validation_result,
            'analysis': analysis,
            'templates_used': templates_to_use
        }
    
    def _analyze_requirements(self, requirements: AgentRequirements) -> Dict[str, Any]:
        """Analyze requirements to determine generation strategy"""
        complexity_score = 0
        
        # Base complexity from expertise level
        complexity_score += {
            ExpertiseLevel.BEGINNER: 1,
            ExpertiseLevel.INTERMEDIATE: 2,
            ExpertiseLevel.ADVANCED: 3,
            ExpertiseLevel.EXPERT: 4
        }[requirements.expertise_level]
        
        # Add complexity for tools
        complexity_score += min(len(requirements.tools_available), 3)
        
        # Add complexity for team context
        if requirements.team_context != TeamContext.SOLO:
            complexity_score += 2
        
        # Add complexity for safety requirements
        if requirements.safety_level == SafetyLevel.HIGH:
            complexity_score += 2
        
        return {
            'complexity_score': complexity_score,
            'needs_specialization': len(requirements.core_competencies) > 0,
            'needs_tool_integration': len(requirements.tools_available) > 0,
            'needs_team_coordination': requirements.team_context != TeamContext.SOLO,
            'needs_enhanced_safety': requirements.safety_level == SafetyLevel.HIGH
        }
    
    def _select_templates(self, analysis: Dict[str, Any]) -> List[str]:
        """Select which templates to use based on analysis"""
        templates = ['constitutional_base']  # Always include constitutional foundation
        
        # Add specialization if needed
        if analysis['needs_specialization'] or analysis['complexity_score'] >= 3:
            templates.append('role_specialization')
        
        # Always add reasoning structure
        templates.append('reasoning_structure')
        
        # Add tool integration if tools are available
        if analysis['needs_tool_integration']:
            templates.append('tool_integration')
        
        # Always add communication protocols
        templates.append('communication_protocols')
        
        # Always add safety constraints
        templates.append('safety_constraints')
        
        # Always add output formatting
        templates.append('output_formatting')
        
        return templates
    
    def _build_template_context(self, requirements: AgentRequirements) -> Dict[str, Any]:
        """Build context dictionary for template rendering"""
        context = {
            # Basic requirements
            'role': requirements.role,
            'domain': requirements.domain,
            'expertise_level': requirements.expertise_level,
            'primary_purpose': requirements.primary_purpose,
            'team_context': requirements.team_context,
            'work_environment': requirements.work_environment,
            
            # Capabilities and constraints
            'primary_tasks': requirements.primary_tasks,
            'tools_available': requirements.tools_available,
            'core_competencies': requirements.core_competencies,
            'max_tool_calls': requirements.max_tool_calls,
            'max_reasoning_steps': requirements.max_reasoning_steps,
            
            # Communication and quality
            'communication_style': requirements.communication_style,
            'output_format': requirements.output_format,
            'escalation_conditions': requirements.escalation_conditions,
            'quality_standards': requirements.quality_standards,
            'domain_standards': requirements.domain_standards,
            'safety_level': requirements.safety_level,
            
            # Derived values
            'experience_years': self.experience_mapping[requirements.expertise_level]
        }
        
        return context

def load_config_from_yaml(file_path: str) -> AgentRequirements:
    """Load agent requirements from YAML file"""
    with open(file_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # Convert tools
    tools = []
    for tool_config in config.get('tools_available', []):
        tools.append(Tool(**tool_config))
    
    # Convert competencies
    competencies = []
    for comp_config in config.get('core_competencies', []):
        competencies.append(Competency(**comp_config))
    
    # Convert quality standards
    quality_standards = []
    for qs_config in config.get('quality_standards', []):
        quality_standards.append(QualityStandard(**qs_config))
    
    # Create requirements object
    requirements = AgentRequirements(
        role=config['role'],
        domain=config['domain'],
        expertise_level=ExpertiseLevel(config['expertise_level']),
        primary_purpose=config['primary_purpose'],
        team_context=TeamContext(config.get('team_context', 'solo')),
        work_environment=config.get('work_environment', 'general'),
        primary_tasks=config.get('primary_tasks', []),
        tools_available=tools,
        core_competencies=competencies,
        safety_level=SafetyLevel(config.get('safety_level', 'medium')),
        max_tool_calls=config.get('max_tool_calls', 10),
        max_reasoning_steps=config.get('max_reasoning_steps', 20),
        communication_style=config.get('communication_style', 'professional'),
        output_format=config.get('output_format', 'structured_text'),
        escalation_conditions=config.get('escalation_conditions', []),
        quality_standards=quality_standards,
        domain_standards=config.get('domain_standards', [])
    )
    
    return requirements

def create_example_configs():
    """Create example configuration files for different agent types"""
    
    # Technical Specialist Example
    technical_config = {
        'role': 'Senior Python Developer',
        'domain': 'Software Development',
        'expertise_level': 'expert',
        'primary_purpose': 'Develop, review, and optimize Python applications with focus on code quality, performance, and maintainability',
        'team_context': 'collaborative',
        'work_environment': 'agile_development',
        'primary_tasks': [
            'Code review and optimization',
            'Architecture design and documentation',
            'Performance analysis and tuning',
            'Mentoring junior developers',
            'Technical decision making'
        ],
        'tools_available': [
            {
                'name': 'code_analyzer',
                'description': 'Static code analysis tool for Python',
                'usage_conditions': 'When reviewing code quality, security, or performance',
                'validation_requirements': 'Verify analysis results align with coding standards',
                'error_procedures': 'Log analysis errors and perform manual review'
            },
            {
                'name': 'test_runner',
                'description': 'Automated testing framework',
                'usage_conditions': 'When validating code changes or new features',
                'validation_requirements': 'Ensure test coverage meets minimum thresholds',
                'error_procedures': 'Report test failures and suggest fixes'
            },
            {
                'name': 'documentation_generator',
                'description': 'Automatic API documentation generation',
                'usage_conditions': 'When documenting APIs or code interfaces',
                'validation_requirements': 'Verify documentation completeness and accuracy',
                'error_procedures': 'Generate manual documentation if auto-generation fails'
            }
        ],
        'core_competencies': [
            {
                'name': 'Python Development',
                'description': 'Advanced Python programming and best practices',
                'techniques': ['Design patterns', 'OOP principles', 'Functional programming', 'Async programming'],
                'standards': ['PEP 8 compliance', 'Type hints usage', 'Docstring conventions']
            },
            {
                'name': 'Code Quality Assurance',
                'description': 'Ensuring high-quality, maintainable code',
                'techniques': ['Static analysis', 'Code reviews', 'Refactoring', 'Testing strategies'],
                'standards': ['80% test coverage minimum', 'Cyclomatic complexity < 10', 'No critical security issues']
            },
            {
                'name': 'Performance Optimization',
                'description': 'Identifying and resolving performance bottlenecks',
                'techniques': ['Profiling', 'Caching strategies', 'Algorithm optimization', 'Database tuning'],
                'standards': ['Response time < 200ms', 'Memory usage within limits', 'Scalability benchmarks']
            }
        ],
        'safety_level': 'high',
        'max_tool_calls': 15,
        'max_reasoning_steps': 25,
        'communication_style': 'technical_professional',
        'output_format': 'structured_markdown',
        'escalation_conditions': [
            'Security vulnerabilities detected',
            'Breaking changes required',
            'Requirements unclear or conflicting',
            'Resource constraints prevent completion'
        ],
        'quality_standards': [
            {
                'name': 'Code Quality',
                'description': 'All code must meet quality standards',
                'measurement_method': 'Static analysis score and review checklist',
                'threshold': 'Grade A or higher'
            },
            {
                'name': 'Test Coverage',
                'description': 'Adequate test coverage for reliability',
                'measurement_method': 'Automated coverage analysis',
                'threshold': 'Minimum 80% line coverage'
            }
        ],
        'domain_standards': [
            'PEP 8 style guide compliance',
            'Python 3.9+ compatibility',
            'Type hints for all public APIs',
            'Comprehensive docstrings for modules and functions'
        ]
    }
    
    # Creative Professional Example
    creative_config = {
        'role': 'Content Strategist',
        'domain': 'Content Creation',
        'expertise_level': 'advanced',
        'primary_purpose': 'Create compelling, engaging content that resonates with target audiences and achieves business objectives',
        'team_context': 'collaborative',
        'work_environment': 'creative_agency',
        'primary_tasks': [
            'Content strategy development',
            'Creative brief creation',
            'Content editing and optimization',
            'Brand voice development',
            'Campaign ideation'
        ],
        'tools_available': [
            {
                'name': 'content_analyzer',
                'description': 'Analyzes content performance and engagement metrics',
                'usage_conditions': 'When evaluating content effectiveness or planning optimization',
                'validation_requirements': 'Cross-reference with business objectives',
                'error_procedures': 'Use manual analysis and industry benchmarks'
            },
            {
                'name': 'brand_voice_checker',
                'description': 'Validates content against brand voice guidelines',
                'usage_conditions': 'Before finalizing any customer-facing content',
                'validation_requirements': 'Ensure alignment with brand personality',
                'error_procedures': 'Manual review against brand guidelines'
            }
        ],
        'core_competencies': [
            {
                'name': 'Strategic Content Planning',
                'description': 'Developing content strategies aligned with business goals',
                'techniques': ['Audience research', 'Content mapping', 'Editorial calendars', 'Performance analysis'],
                'standards': ['Clear success metrics', 'Audience-focused approach', 'Brand alignment']
            },
            {
                'name': 'Creative Development',
                'description': 'Creating original, engaging content concepts',
                'techniques': ['Brainstorming', 'Ideation frameworks', 'Creative brief development', 'Concept testing'],
                'standards': ['Original concepts', 'Brand-appropriate tone', 'Target audience relevance']
            }
        ],
        'safety_level': 'medium',
        'max_tool_calls': 8,
        'max_reasoning_steps': 15,
        'communication_style': 'creative_professional',
        'output_format': 'structured_text',
        'escalation_conditions': [
            'Content conflicts with brand guidelines',
            'Legal or compliance concerns',
            'Client feedback requires major strategic changes'
        ],
        'quality_standards': [
            {
                'name': 'Brand Alignment',
                'description': 'Content must align with brand voice and values',
                'measurement_method': 'Brand voice checker and manual review',
                'threshold': '95% alignment score'
            }
        ],
        'domain_standards': [
            'AP Style Guide compliance',
            'Brand voice consistency',
            'SEO best practices integration',
            'Accessibility guidelines adherence'
        ]
    }
    
    return {
        'technical_specialist': technical_config,
        'creative_professional': creative_config
    }

def interactive_mode():
    """Run interactive mode to gather requirements"""
    print("Meta-Agent Interactive Mode")
    print("=" * 30)
    
    # Basic information
    role = input("Agent role (e.g., 'Senior Python Developer'): ")
    domain = input("Domain expertise (e.g., 'Software Development'): ")
    expertise_level = input("Expertise level (beginner/intermediate/advanced/expert): ")
    primary_purpose = input("Primary purpose: ")
    
    # Context
    team_context = input("Team context (solo/collaborative/hierarchical) [solo]: ") or "solo"
    
    # Tools (simplified for interactive mode)
    tools = []
    print("\nTools available (press Enter with empty name to finish):")
    while True:
        tool_name = input("Tool name: ")
        if not tool_name:
            break
        tool_desc = input("Tool description: ")
        tool_conditions = input("Usage conditions: ")
        tools.append({
            'name': tool_name,
            'description': tool_desc,
            'usage_conditions': tool_conditions
        })
    
    # Safety level
    safety_level = input("Safety level (low/medium/high) [medium]: ") or "medium"
    
    # Build configuration
    config = {
        'role': role,
        'domain': domain,
        'expertise_level': expertise_level,
        'primary_purpose': primary_purpose,
        'team_context': team_context,
        'tools_available': tools,
        'safety_level': safety_level,
        'escalation_conditions': [
            'Requirements unclear or conflicting',
            'Resource constraints prevent completion',
            'Safety concerns identified'
        ]
    }
    
    return config

def main():
    parser = argparse.ArgumentParser(description='Meta-Agent: Generate effective agent system messages')
    parser.add_argument('--config', help='YAML configuration file path')
    parser.add_argument('--interactive', action='store_true', help='Run in interactive mode')
    parser.add_argument('--example', choices=['technical_specialist', 'creative_professional'], 
                       help='Generate example agent configuration')
    parser.add_argument('--output', default='generated_agent.md', help='Output file path')
    parser.add_argument('--validate-only', action='store_true', help='Only validate existing system message')
    
    args = parser.parse_args()
    
    meta_agent = MetaAgent()
    
    if args.example:
        # Generate example configuration
        examples = create_example_configs()
        config = examples[args.example]
        
        # Convert to requirements object
        requirements = AgentRequirements(
            role=config['role'],
            domain=config['domain'],
            expertise_level=ExpertiseLevel(config['expertise_level']),
            primary_purpose=config['primary_purpose'],
            team_context=TeamContext(config.get('team_context', 'solo')),
            tools_available=[Tool(**tool) for tool in config.get('tools_available', [])],
            core_competencies=[Competency(**comp) for comp in config.get('core_competencies', [])],
            safety_level=SafetyLevel(config.get('safety_level', 'medium')),
            escalation_conditions=config.get('escalation_conditions', []),
            quality_standards=[QualityStandard(**qs) for qs in config.get('quality_standards', [])],
            domain_standards=config.get('domain_standards', [])
        )
        
    elif args.interactive:
        # Interactive mode
        config = interactive_mode()
        requirements = AgentRequirements(
            role=config['role'],
            domain=config['domain'],
            expertise_level=ExpertiseLevel(config['expertise_level']),
            primary_purpose=config['primary_purpose'],
            team_context=TeamContext(config.get('team_context', 'solo')),
            tools_available=[Tool(**tool) for tool in config.get('tools_available', [])],
            safety_level=SafetyLevel(config.get('safety_level', 'medium')),
            escalation_conditions=config.get('escalation_conditions', [])
        )
        
    elif args.config:
        # Load from YAML file
        requirements = load_config_from_yaml(args.config)
        
    else:
        parser.print_help()
        return
    
    # Generate system message
    result = meta_agent.generate_system_message(requirements)
    
    # Write output
    with open(args.output, 'w') as f:
        f.write("# Generated Agent System Message\n\n")
        f.write(result['system_message'])
        f.write("\n\n" + "="*50 + "\n")
        f.write("## Generation Report\n\n")
        f.write(f"**Templates Used**: {', '.join(result['templates_used'])}\n\n")
        f.write(f"**Complexity Score**: {result['analysis']['complexity_score']}\n\n")
        f.write(f"**Validation Passed**: {result['validation']['overall_pass']}\n\n")
        
        if result['validation']['suggestions']:
            f.write("**Improvement Suggestions**:\n")
            for suggestion in result['validation']['suggestions']:
                f.write(f"- {suggestion}\n")
        
        f.write("\n### Validation Details\n")
        for check_name, check_result in result['validation']['checks'].items():
            f.write(f"- **{check_name.replace('_', ' ').title()}**: {'✓' if check_result['passed'] else '✗'}\n")
    
    print(f"Generated agent system message saved to: {args.output}")
    print(f"Validation passed: {result['validation']['overall_pass']}")
    
    if result['validation']['suggestions']:
        print("Suggestions for improvement:")
        for suggestion in result['validation']['suggestions']:
            print(f"  - {suggestion}")

if __name__ == "__main__":
    main()