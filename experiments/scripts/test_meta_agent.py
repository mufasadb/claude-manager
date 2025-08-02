#!/usr/bin/env python3
"""
Test suite for Meta-Agent validation and quality assessment
"""

import os
import sys
import yaml
import json
from pathlib import Path
from meta_agent import MetaAgent, AgentRequirements, ExpertiseLevel, TeamContext, SafetyLevel, Tool, Competency, QualityStandard

class MetaAgentTester:
    def __init__(self):
        self.meta_agent = MetaAgent()
        self.test_results = {}
    
    def run_all_tests(self):
        """Run comprehensive test suite"""
        print("Running Meta-Agent Test Suite")
        print("=" * 40)
        
        tests = [
            self.test_basic_generation,
            self.test_constitutional_compliance,
            self.test_role_specialization,
            self.test_tool_integration,
            self.test_safety_levels,
            self.test_team_contexts,
            self.test_validation_quality,
            self.test_edge_cases
        ]
        
        for test in tests:
            try:
                result = test()
                test_name = test.__name__
                self.test_results[test_name] = result
                status = "✓ PASS" if result['passed'] else "✗ FAIL"
                print(f"{status} {test_name}")
                if not result['passed']:
                    print(f"  Issues: {', '.join(result.get('issues', []))}")
            except Exception as e:
                print(f"✗ ERROR {test.__name__}: {e}")
                self.test_results[test.__name__] = {'passed': False, 'error': str(e)}
        
        self.print_summary()
        return self.test_results
    
    def test_basic_generation(self):
        """Test basic system message generation"""
        requirements = AgentRequirements(
            role="Test Agent",
            domain="Testing",
            expertise_level=ExpertiseLevel.INTERMEDIATE,
            primary_purpose="Test basic functionality"
        )
        
        result = self.meta_agent.generate_system_message(requirements)
        
        issues = []
        if not result['system_message']:
            issues.append("No system message generated")
        
        if len(result['system_message']) < 100:
            issues.append("System message too short")
        
        if 'constitutional' not in result['system_message'].lower():
            issues.append("Missing constitutional principles")
        
        return {
            'passed': len(issues) == 0,
            'issues': issues,
            'message_length': len(result['system_message']),
            'validation_passed': result['validation']['overall_pass']
        }
    
    def test_constitutional_compliance(self):
        """Test constitutional AI principles integration"""
        requirements = AgentRequirements(
            role="Constitutional Test Agent",
            domain="AI Safety",
            expertise_level=ExpertiseLevel.EXPERT,
            primary_purpose="Test constitutional compliance"
        )
        
        result = self.meta_agent.generate_system_message(requirements)
        message = result['system_message'].lower()
        
        constitutional_principles = ['helpfulness', 'harmlessness', 'honesty', 'transparency']
        found_principles = [p for p in constitutional_principles if p in message]
        
        issues = []
        if len(found_principles) < 3:
            issues.append(f"Only found {len(found_principles)}/4 constitutional principles")
        
        if 'constitutional' not in message:
            issues.append("Missing explicit constitutional section")
        
        return {
            'passed': len(issues) == 0,
            'issues': issues,
            'principles_found': found_principles,
            'validation_score': result['validation']['checks']['constitutional_compliance']['passed']
        }
    
    def test_role_specialization(self):
        """Test role specialization and domain expertise"""
        requirements = AgentRequirements(
            role="Senior Data Scientist",
            domain="Machine Learning",
            expertise_level=ExpertiseLevel.EXPERT,
            primary_purpose="Advanced ML model development",
            core_competencies=[
                Competency(
                    name="Deep Learning",
                    description="Neural network architectures and training",
                    techniques=["CNN", "RNN", "Transformers"],
                    standards=["Model accuracy > 95%", "Training time < 24hrs"]
                )
            ]
        )
        
        result = self.meta_agent.generate_system_message(requirements)
        message = result['system_message'].lower()
        
        issues = []
        if 'data scientist' not in message:
            issues.append("Role not clearly specified")
        
        if 'machine learning' not in message:
            issues.append("Domain not specified")
        
        if 'deep learning' not in message:
            issues.append("Core competencies not included")
        
        if 'expert' not in message and '10+' not in message:
            issues.append("Expertise level not reflected")
        
        return {
            'passed': len(issues) == 0,
            'issues': issues,
            'role_clarity': result['validation']['checks']['role_clarity']['passed']
        }
    
    def test_tool_integration(self):
        """Test tool integration and usage guidelines"""
        tools = [
            Tool(
                name="ml_trainer",
                description="Machine learning model training tool",
                usage_conditions="When training or fine-tuning models",
                validation_requirements="Validate model performance metrics"
            ),
            Tool(
                name="data_processor",
                description="Data preprocessing and cleaning tool",
                usage_conditions="When preparing datasets for analysis"
            )
        ]
        
        requirements = AgentRequirements(
            role="ML Engineer",
            domain="Machine Learning",
            expertise_level=ExpertiseLevel.ADVANCED,
            primary_purpose="Build ML pipelines",
            tools_available=tools
        )
        
        result = self.meta_agent.generate_system_message(requirements)
        message = result['system_message'].lower()
        
        issues = []
        if 'ml_trainer' not in message:
            issues.append("Tool ml_trainer not included")
        
        if 'data_processor' not in message:
            issues.append("Tool data_processor not included")
        
        if 'tool usage principles' not in message:
            issues.append("Tool usage guidelines missing")
        
        if 'validation' not in message:
            issues.append("Tool validation procedures missing")
        
        return {
            'passed': len(issues) == 0,
            'issues': issues,
            'tools_found': [tool.name for tool in tools if tool.name in message]
        }
    
    def test_safety_levels(self):
        """Test different safety level implementations"""
        test_cases = [
            (SafetyLevel.LOW, "basic safety"),
            (SafetyLevel.MEDIUM, "standard safety"),
            (SafetyLevel.HIGH, "critical safety")
        ]
        
        all_passed = True
        all_issues = []
        
        for safety_level, expected_content in test_cases:
            requirements = AgentRequirements(
                role="Safety Test Agent",
                domain="Testing",
                expertise_level=ExpertiseLevel.INTERMEDIATE,
                primary_purpose="Test safety levels",
                safety_level=safety_level
            )
            
            result = self.meta_agent.generate_system_message(requirements)
            message = result['system_message'].lower()
            
            issues = []
            if 'safety' not in message:
                issues.append(f"Safety section missing for {safety_level.value}")
            
            if safety_level == SafetyLevel.HIGH and 'critical' not in message:
                issues.append("High safety level not properly implemented")
            
            if issues:
                all_passed = False
                all_issues.extend(issues)
        
        return {
            'passed': all_passed,
            'issues': all_issues,
            'test_cases': len(test_cases)
        }
    
    def test_team_contexts(self):
        """Test different team context configurations"""
        test_cases = [
            (TeamContext.SOLO, "individual work"),
            (TeamContext.COLLABORATIVE, "collaborative team"),
            (TeamContext.HIERARCHICAL, "hierarchical structure")
        ]
        
        all_passed = True
        all_issues = []
        
        for team_context, expected_behavior in test_cases:
            requirements = AgentRequirements(
                role="Team Test Agent",
                domain="Testing",
                expertise_level=ExpertiseLevel.INTERMEDIATE,
                primary_purpose="Test team contexts",
                team_context=team_context
            )
            
            result = self.meta_agent.generate_system_message(requirements)
            message = result['system_message'].lower()
            
            issues = []
            if team_context != TeamContext.SOLO:
                if 'team' not in message:
                    issues.append(f"Team context missing for {team_context.value}")
                
                if 'handoff' not in message and 'delegation' not in message:
                    issues.append(f"Team coordination missing for {team_context.value}")
            
            if team_context == TeamContext.HIERARCHICAL and 'hierarchical' not in message:
                issues.append("Hierarchical structure not specified")
            
            if issues:
                all_passed = False
                all_issues.extend(issues)
        
        return {
            'passed': all_passed,
            'issues': all_issues,
            'test_cases': len(test_cases)
        }
    
    def test_validation_quality(self):
        """Test the quality validation system"""
        # Test with a deliberately poor configuration
        poor_requirements = AgentRequirements(
            role="Agent",  # Vague role
            domain="Stuff",  # Vague domain
            expertise_level=ExpertiseLevel.BEGINNER,
            primary_purpose="Do things"  # Vague purpose
        )
        
        result = self.meta_agent.generate_system_message(poor_requirements)
        validation = result['validation']
        
        # Good configuration
        good_requirements = AgentRequirements(
            role="Senior Software Architect",
            domain="Enterprise Software Development",
            expertise_level=ExpertiseLevel.EXPERT,
            primary_purpose="Design scalable, maintainable software architectures for enterprise applications",
            tools_available=[
                Tool("design_analyzer", "Architecture analysis tool", "When evaluating designs")
            ],
            escalation_conditions=["Architecture conflicts", "Performance requirements unclear"]
        )
        
        good_result = self.meta_agent.generate_system_message(good_requirements)
        good_validation = good_result['validation']
        
        issues = []
        if good_validation['overall_pass'] == result['validation']['overall_pass']:
            issues.append("Validation doesn't distinguish between good and poor configurations")
        
        if not good_validation['overall_pass']:
            issues.append("Good configuration failed validation")
        
        return {
            'passed': len(issues) == 0,
            'issues': issues,
            'poor_config_passed': result['validation']['overall_pass'],
            'good_config_passed': good_validation['overall_pass'],
            'validation_suggestions': len(result['validation']['suggestions'])
        }
    
    def test_edge_cases(self):
        """Test edge cases and error handling"""
        edge_cases = []
        
        # Empty tools list
        try:
            requirements = AgentRequirements(
                role="Edge Case Agent",
                domain="Testing",
                expertise_level=ExpertiseLevel.INTERMEDIATE,
                primary_purpose="Test edge cases",
                tools_available=[]
            )
            result = self.meta_agent.generate_system_message(requirements)
            if not result['system_message']:
                edge_cases.append("Failed with empty tools list")
        except Exception as e:
            edge_cases.append(f"Exception with empty tools: {e}")
        
        # Very long role name
        try:
            requirements = AgentRequirements(
                role="A" * 200,  # Very long role name
                domain="Testing",
                expertise_level=ExpertiseLevel.EXPERT,
                primary_purpose="Test long role names"
            )
            result = self.meta_agent.generate_system_message(requirements)
            if not result['system_message']:
                edge_cases.append("Failed with long role name")
        except Exception as e:
            edge_cases.append(f"Exception with long role: {e}")
        
        # Maximum complexity
        try:
            complex_tools = [Tool(f"tool_{i}", f"Description {i}", f"Condition {i}") for i in range(10)]
            complex_competencies = [Competency(f"Skill {i}", f"Description {i}") for i in range(5)]
            
            requirements = AgentRequirements(
                role="Complex Agent",
                domain="Multi-domain Expert",
                expertise_level=ExpertiseLevel.EXPERT,
                primary_purpose="Handle maximum complexity scenarios",
                team_context=TeamContext.HIERARCHICAL,
                tools_available=complex_tools,
                core_competencies=complex_competencies,
                safety_level=SafetyLevel.HIGH,
                max_tool_calls=50,
                max_reasoning_steps=100
            )
            result = self.meta_agent.generate_system_message(requirements)
            if not result['system_message']:
                edge_cases.append("Failed with maximum complexity")
        except Exception as e:
            edge_cases.append(f"Exception with complex config: {e}")
        
        return {
            'passed': len(edge_cases) == 0,
            'issues': edge_cases,
            'edge_cases_tested': 3
        }
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 40)
        print("TEST SUMMARY")
        print("=" * 40)
        
        passed = sum(1 for result in self.test_results.values() if result.get('passed', False))
        total = len(self.test_results)
        
        print(f"Tests Passed: {passed}/{total}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if passed == total:
            print("🎉 All tests passed! Meta-agent is working correctly.")
        else:
            print("⚠️  Some tests failed. Review issues above.")
        
        print("\nDetailed Results:")
        for test_name, result in self.test_results.items():
            status = "✓" if result.get('passed', False) else "✗"
            print(f"  {status} {test_name}")

def run_comprehensive_validation():
    """Run comprehensive validation of generated agents"""
    print("\nRunning Comprehensive Agent Validation")
    print("=" * 50)
    
    config_dir = Path("config_examples")
    output_dir = Path("../outputs")
    
    if not config_dir.exists():
        print("Config examples directory not found")
        return
    
    meta_agent = MetaAgent()
    
    for config_file in config_dir.glob("*.yaml"):
        print(f"\nValidating {config_file.name}...")
        
        try:
            with open(config_file, 'r') as f:
                config = yaml.safe_load(f)
            
            # Convert to requirements (simplified)
            requirements = AgentRequirements(
                role=config['role'],
                domain=config['domain'],
                expertise_level=ExpertiseLevel(config['expertise_level']),
                primary_purpose=config['primary_purpose']
            )
            
            result = meta_agent.generate_system_message(requirements)
            
            validation_score = sum(1 for check in result['validation']['checks'].values() if check['passed'])
            total_checks = len(result['validation']['checks'])
            
            print(f"  Validation Score: {validation_score}/{total_checks}")
            print(f"  Overall Pass: {result['validation']['overall_pass']}")
            
            if result['validation']['suggestions']:
                print(f"  Suggestions: {len(result['validation']['suggestions'])}")
        
        except Exception as e:
            print(f"  Error: {e}")

if __name__ == "__main__":
    # Run tests
    tester = MetaAgentTester()
    test_results = tester.run_all_tests()
    
    # Run comprehensive validation if config examples exist
    if os.path.exists("config_examples"):
        run_comprehensive_validation()
    
    # Exit with appropriate code
    all_passed = all(result.get('passed', False) for result in test_results.values())
    sys.exit(0 if all_passed else 1)