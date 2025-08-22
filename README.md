# Claude Manager

A real-time web dashboard for managing Claude Code across multiple projects. This system provides centralized control over MCP servers, automated hooks, session tracking, and configuration management with live WebSocket updates.

## What is Claude Manager?

Claude Manager is a dual-service web application that provides unified management for Claude Code environments. Instead of manually configuring each project separately, you get a centralized dashboard with:

- **Real-time Project Registry**: Register projects from anywhere and monitor all Claude configurations with live file watching
- **AI-Powered Agent & Slash Command Generation**: Create professional agents and slash commands using OpenRouter API with natural language descriptions
- **MCP Server Management**: Add, configure, and manage Model Context Protocol servers with built-in templates and AI-powered discovery
- **Automated Hook System**: Set up workflows for code formatting, testing, safety checks, and integrations that trigger on Claude actions
- **Session Tracking & Usage Monitoring**: Real-time tracking of Claude Code usage with countdown timers and plan limit monitoring
- **Dual-Scope Environment Management**: Centralized API key and environment variable management at both user and project levels
- **Live CLAUDE.md Editor**: Built-in Monaco editor with syntax highlighting, auto-save, and multi-client synchronization
- **WebSocket Real-time Updates**: Live synchronization across all connected browser clients with automatic reconnection

## Quick Start

### Prerequisites & Installation

**System Requirements:**
- [Bun](https://bun.sh) - Primary JavaScript runtime and package manager
- Node.js 20+ - Required for the application runtime
- [Claude Code CLI](https://claude.ai/cli) - Required for MCP server management

**Quick Installation:**
```bash
# Clone repository and install dependencies
git clone https://github.com/callmebeachy/claude-manager.git
cd claude-manager
bun install

# Install global project registration commands
./install.sh && source ~/.zshrc

# Configure OpenRouter API key for AI features (optional)
mkdir -p ~/.claude-manager
echo "OPENROUTER_API_KEY=your_key_here" >> ~/.claude-manager/user.env
```

### Development Startup

**One-Command Start (Recommended):**
```bash
bun run dev  # Starts both backend (port 3455) + frontend (port 3456)
```

**Manual Service Control:**
```bash
# Backend only
cd backend && bun --watch index.js

# Frontend only (in separate terminal)
cd frontend && PORT=3456 BROWSER=none npm start
```

**Access Points:**
- **Development Dashboard**: http://localhost:3456 ← Use this for development
- **Backend API**: http://localhost:3455/api/* ← API endpoints
- **Production Dashboard**: http://localhost:3455 ← After running `bun run build`

**Essential Commands:**
```bash
bun run build              # Build production frontend bundle
bun run test               # Run TypeScript/React tests  
bun run typecheck          # TypeScript error checking
bun run claude:register    # Register current directory as project
./install.sh               # Install cm-reg/cm-unreg global commands
```

## Core Features

### Project Management
Register projects from anywhere and manage all Claude configurations centrally:

```bash
cd /path/to/any/project
cm-reg                    # Register with directory name
cm-reg my-project-name    # Register with custom name
cm-unreg                  # Unregister current directory
```

**Features:**
- Live monitoring of `.claude/settings.json` changes via WebSocket
- Real-time CLAUDE.md file editing with markdown preview
- Project-specific environment variable management
- Dedicated MCP server configurations per project

### AI-Powered Agent & Slash Command Creation

Generate professional Claude Code configurations using natural language:

**Agent Creator:**
- Describe your agent's purpose and behavior in plain English
- AI generates complete agent configurations with system messages
- Supports multiple agent types: specialists, generalists, tool-focused agents
- Automatic integration with your existing Claude setup

**Slash Command Builder:**
- Natural language description converts to professional slash commands
- Handles complex multi-step workflows and integrations
- Validates command syntax and provides usage examples

### MCP Server Management

Manage Model Context Protocol servers with templates and AI discovery:

**Built-in Templates:**
- **Supabase** - Database queries and operations
- **Neo4j** - Graph database with Cypher queries
- **Playwright/Puppeteer** - Browser automation and testing
- **GitHub** - Repository and issue management
- **PostgreSQL** - Direct database connections
- **Notion** - Workspace integration
- **Figma** - Design file access and manipulation

**AI-Powered Discovery:**
- Describe what you need and AI finds relevant MCP servers
- Automatic configuration with proper environment variables
- Real-time server status monitoring and management

### Automated Hook System

Set up workflows that trigger automatically on Claude actions:

**Safety & Security:**
- Block dangerous commands (`rm -rf`, `sudo`)
- Prevent API key exposure in code commits
- Validate file permissions and paths

**Code Quality & Formatting:**
- Auto-format with Black, Prettier, Go fmt, Ruff
- Run linters (ESLint, Pylint) on file changes
- Execute tests after code modifications
- Type checking and validation

**Git Integration:**
- Auto-stage modified files
- Run pre-commit hooks and validation
- Push changes to remote repositories
- Commit message standardization

**Custom Integrations:**
- TTS announcements for completed tasks
- Slack/Discord notifications
- File backup and synchronization

### Session Tracking & Usage Monitoring

Monitor your Claude Code usage in real-time:

- **Live Session Countdown**: See exact time remaining in your current 5-hour session
- **Plan Limit Tracking**: Automatic detection of Pro (45), Max-5x (225), Max-20x (900) plans
- **Monthly Usage Analytics**: Historical usage with configurable billing periods
- **Automatic Monitoring**: Tracks session files in `~/.claude/projects/` automatically
- **Visual Dashboard**: Real-time usage indicators and remaining session counts

### Environment & Configuration Management

Centralized API key and configuration management across all projects:

**Two-Tier Variable System:**
- **User-Level** (`~/.claude-manager/user.env`): Global API keys shared across all projects
- **Project-Level** (`.env` files): Project-specific configuration and overrides

**Dashboard Features:**
- **Masked Display**: Sensitive values shown as `abc...xyz` for security
- **Copy Between Scopes**: Move variables from user to project level and vice versa
- **Real-time Validation**: Immediate feedback on variable format and requirements
- **MCP Integration**: Automatically prompts for required environment variables when adding MCP servers

## Troubleshooting

**Dashboard not loading?**
- Ensure port 3455 is available
- Check `server.log` for errors

**Projects not registering?**
- Verify `.claude/` directory exists in project
- Check file permissions on config directories
- Double check path contains the tool
- The script wants to reload your bash or zshrc source so if you used a different path than default it will probably not have reloaded

**MCP servers not working?**
- Ensure Claude Code is installed and in PATH
- Check environment variables are correctly set
- Verify MCP server packages are available (e.g., `npx @supabase/mcp-server --help`)

**Session tracking not updating?**
-  This reads from the jsonl files make sure they're in the default location

**Why is it saying my sessions are only 4 and a bit hours long?**
Noone has actually come out and told us howi t works but in my experience my usage rolls ove if im nearing limits on the clock, so i've built this app assuming that the timer starts 4+remaining minutes in hour (based on gmt)

## Context-Aware Status Line

Claude Manager includes an intelligent status line script that provides real-time context usage information using the same calculation method as Claude Code's `/context` command.

### Features

**Accurate Token Calculation**: Uses the same methodology as `/context` by analyzing JSONL session files
**Smart Emoji Indicators**: Shows what's consuming the most context space:
- 🔧 **Tools** - When tool usage dominates your context
- ⚙️ **System** - When system prompt/memory files dominate  
- 💬 **Messages** - When conversation history dominates
- Falls back to activity-based emojis (🧪 testing, ✍️ writing, 📖 reading, etc.)

**Color-Coded Usage**: Green (0-25%), Yellow (26-75%), Red (76-99%)
**Dashboard Integration**: Shows Claude Manager URL for quick access

### Installation

**Quick Setup:**
```bash
# Copy the status line script to your Claude config
cp statusline-context-aware.sh ~/.claude/statusline.sh
chmod +x ~/.claude/statusline.sh

# Add to your Claude Code settings
cat >> ~/.claude/settings.json << 'EOF'
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0
  }
}
EOF
```

**Manual Configuration:**
1. Copy `statusline-context-aware.sh` to `~/.claude/statusline.sh`
2. Make it executable: `chmod +x ~/.claude/statusline.sh`
3. Add to your `~/.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command", 
    "command": "~/.claude/statusline.sh"
  }
}
```

**Output Format:**
```
http://localhost:3456 | 🔧 | 17% context
```

The status line updates automatically as your context usage changes and will accurately reflect token consumption patterns shown in `/context`.
