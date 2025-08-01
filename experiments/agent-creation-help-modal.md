# Agent Creation Help Modal

## What Makes Effective Agents?

Based on research from Anthropic and community best practices, here's what you need to capture:

### 🎯 **Core Identity & Boundaries**
- **Specific role** - "Python debugging specialist" not "helpful assistant"
- **Clear capabilities** - what it CAN do with examples
- **Explicit limitations** - what it CANNOT or should not do
- **Success criteria** - how to measure if it's working well

### 🛠️ **Tool Usage Protocol**
For each tool the agent can use:
- **When** to use it (specific triggers)
- **Why** to use it (expected outcome)
- **How** to use it (validation steps)
- **Fallbacks** when tools fail

### 🧠 **Context Management**
- **What to remember** (goals, user preferences, key decisions)
- **What to summarize** (long conversations into key points)
- **What to forget** (completed tasks, irrelevant details)
- **Size limits** (prevent context explosion)

### ⚠️ **Error Handling & Safety**
- **Primary approach** for normal operations
- **Fallback strategies** when things go wrong
- **Safety constraints** (Constitutional AI principles)
- **Escalation rules** (when to ask humans for help)

### 📊 **Quality Control**
- **Input validation** (check requests make sense)
- **Output validation** (verify responses before sending)
- **Self-checking** (does this answer the question?)
- **Accuracy requirements** (fact-checking for claims)

## ✅ **Quick Validation Checklist**

Your agent description should include:
- [ ] Specific expertise area and role
- [ ] 3-5 main capabilities with examples
- [ ] Tool usage guidelines
- [ ] What it won't/can't do
- [ ] How it handles errors
- [ ] Safety boundaries
- [ ] Success criteria

## 🚫 **Avoid These Anti-Patterns**

❌ **"God Agent"** - trying to do everything  
✅ **Specialist** - focused on specific domain

❌ **Vague helper** - "assists with tasks"  
✅ **Specific role** - "analyzes Python code for security vulnerabilities"

❌ **No boundaries** - unlimited capabilities  
✅ **Clear limits** - "cannot execute code, only analyze"

❌ **Tool dumping** - just lists available tools  
✅ **Usage protocols** - when and how to use each tool

## 💡 **Pro Tips**

1. **Start specific** - narrow focus beats broad capabilities
2. **Plan for failure** - what happens when tools don't work?
3. **Validate everything** - input, processing, output
4. **Think production** - will this work reliably at scale?
5. **Human oversight** - when should humans review decisions?

## 🎪 **Performance Patterns That Work**

- **Context Compression** - summarize old conversations
- **Tool Validation** - check inputs before using tools  
- **Async Processing** - use multiple tools in parallel
- **Graceful Degradation** - simpler approach when advanced fails
- **Progress Tracking** - break complex tasks into steps

## 📚 **Examples of Good Agent Definitions**

### Research Agent
```
Role: Market research specialist for SaaS companies
Capabilities: Industry analysis, competitor research, trend identification
Tools: WebSearch for current data, WebFetch for reports, Write for summaries  
Limitations: Cannot access proprietary databases or make investment advice
Safety: Verify all sources, never share confidential information
```

### Code Review Agent  
```
Role: Python security code reviewer
Capabilities: Vulnerability detection, OWASP compliance, fix recommendations
Tools: Read files, Grep for patterns, Bash for security scanners
Limitations: Cannot modify code, only analyze and suggest
Safety: Never execute untrusted code, escalate critical findings
```

Remember: **Specialized agents that do one thing well consistently outperform generalist agents that try to do everything.**