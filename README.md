# Claude Manager

A comprehensive web-based dashboard for managing Claude Code environments across multiple projects. Monitor configurations, set up automated hooks, manage MCP servers, and track session usage with real-time updates.

## What is Claude Manager?

Claude Manager is a centralized control panel that simplifies working with Claude Code across multiple projects. Instead of manually configuring each project, you get:

- **Global Project Registry**: Register any project from anywhere and manage all Claude configurations from one dashboard
- **AI-Powered Slash Commands**: Generate professional Claude Code slash commands using detailed instructions with Gemini Flash 1.5
- **MCP Server Management**: Add, configure, and manage Model Context Protocol servers with popular templates
- **Automated Hooks**: Set up code formatting, testing, and safety checks that run automatically
- **Session Tracking**: Monitor your Claude Code usage against plan limits with real-time countdowns
- **Environment Management**: Centralized API key and environment variable management
- **CLAUDE.md Editor**: Built-in editor for project documentation with live preview and syntax highlighting

## Quick Start

### Installation

1. **Prerequisites**:
   - [Bun](https://bun.sh) - Fast JavaScript runtime and package manager
   - Node.js 20+ (for React development)

2. **Clone and install**:
   ```bash
   git clone https://github.com/callmebeachy/claude-manager.git
   cd claude-manager
   bun install          # Install all dependencies with Bun
   ```

3. **Set up configuration**:
   ```bash
   # Create environment file for OpenRouter API
   cp .env.example .env
   
   # Edit .env with your OpenRouter API key
   nano .env  # Add your OPENROUTER_API_KEY
   
   # Create config directory and copy examples
   mkdir -p ~/.claude-manager
   cp examples/*.example ~/.claude-manager/
   
   # Remove .example extensions
   cd ~/.claude-manager
   for file in *.example; do mv "$file" "${file%.example}"; done
   
   # Edit user.env with any additional API keys
   nano ~/.claude-manager/user.env
   ```

4. **Install global commands** (optional but recommended):
   ```bash
   ./install.sh
   source ~/.zshrc  # or ~/.bashrc
   ```

### Start the Dashboard

```bash
# Build frontend first
bun run build         # Build React production bundle

# Development mode - SINGLE COMMAND runs both backend + frontend! 🚀
bun run dev          # Runs both services in parallel with colored output

# Production mode  
bun start            # Start backend server only (serves built frontend)
```

Open **http://localhost:3455** in your browser.

**Development Commands:**
```bash
# Single command development (recommended)
bun run dev          # Backend (port 3455) + Frontend (port 3456) in parallel

# Individual services
cd backend && bun --watch index.js    # Backend only
cd frontend && bun run start         # Frontend only

# Other tasks
bun run build        # Build production frontend
bun run test         # Run frontend tests  
bun run typecheck    # TypeScript checking
bun run clean        # Clean all dependencies
bun run claude:register  # Register current project
```

## Core Features

### Project Management
Register any project from anywhere and manage all your Claude configurations centrally:

```bash
cd /path/to/any/project
cm-reg                    # Register with directory name
cm-reg my-project-name    # Register with custom name
cm-unreg                  # Unregister current directory
```

The dashboard automatically detects project types and monitors config changes in real-time via WebSocket connections. Each project gets:
- Live monitoring of `.claude/settings.json` changes
- Real-time CLAUDE.md file editing with preview
- Project-specific environment variable management
- Dedicated MCP server configurations

### MCP Server Management

Manage Model Context Protocol servers that extend Claude Code's capabilities:

**Built-in Templates:**
- **Supabase** - Database queries and operations
- **Neo4j** - Graph database with Cypher queries
- **Playwright/Puppeteer** - Browser automation and testing
- **GitHub** - Repository and issue management
- **PostgreSQL** - Direct database connections
- **Notion** - Workspace integration
- **Figma** - Design file access and manipulation

### CLAUDE.md Management

Edit project documentation directly in the dashboard:

**Features:**
- Built-in markdown editor with syntax highlighting
- Live preview with real-time rendering
- Auto-save functionality
- Dark theme optimized for development
- WebSocket synchronization across multiple clients
- Support for both project-level and user-level CLAUDE.md files

**Features:**
- Quick setup with pre-configured templates
- Environment variable prompting (API keys, connection strings)
- Enable/disable servers without losing configuration
- User-level and project-specific scopes
- Real-time status monitoring

### Hook System

Automate workflows that trigger on Claude actions:

**Safety Hooks:**
- Block dangerous commands (`rm -rf`, `sudo`)
- Prevent API key exposure in code
- Validate file permissions before writes

**Code Quality Hooks:**
- Auto-format with Black, Prettier, Go fmt
- Run linters (ESLint, Ruff) automatically
- Execute tests after code changes

**Git Integration:**
- Auto-stage modified files  
- Run pre-commit validation
- Push changes to remote repositories

### Session Tracking

Monitor Claude Code usage against your plan limits:

- **Real-time Countdown**: See time remaining in current 5-hour session
- **Plan Awareness**: Tracks limits for Pro (45), Max-5x (225), Max-20x (900)
- **Monthly Statistics**: Usage history with configurable billing periods
- **Automatic Detection**: Monitors Claude Code session files automatically

### Environment Variables

Centralized management of API keys and configuration:

**User-Level Variables** (`~/.claude-manager/user.env`):
- Shared across all projects
- API keys for GitHub, OpenAI, Supabase, etc.

**Project-Level Variables** (`.env` in each project):
- Project-specific database URLs, endpoints
- Feature flags and local configuration
- Overrides user-level settings

**Features:**
- Masked display of sensitive values in the dashboard
- Copy variables between user and project scopes
- Real-time validation and error checking
- Integration with MCP server environment requirements

## Common Workflows

### Setting Up a New Project

1. **Navigate to project**: `cd /path/to/my-project`
2. **Register project**: `cm-reg my-project`  
3. **Open dashboard**: Visit http://localhost:3455
4. **Add MCP servers**: Connect to databases and external services
5. **Add hooks**: Set up auto-formatting and safety checks
6. **Configure environment**: Add any required API keys

### Managing Multiple Projects

The dashboard provides a unified view of all registered projects with:
- Real-time config monitoring
- Quick access to settings files  
- Environment variable management

### Working with Teams

1. **Standardize hooks**: Use common hook presets across team
2. **Environment setup**: Copy user-level variables to project-specific
3. **Session coordination**: Track team usage patterns

## Configuration Files

```
~/.claude-manager/
├── registry.json          # Project registry and metadata
├── session-tracking.json  # Usage statistics and history  
├── settings.json          # Dashboard preferences
└── user.env              # Global environment variables

your-project/
├── .claude/
│   ├── settings.json      # Claude Code configuration
│   └── settings.local.json # Local overrides (optional)
├── .env                   # Project environment variables
└── CLAUDE.md             # Project-specific instructions
```

## API Integration

The dashboard exposes a REST API for automation and integration:

```bash
# Register project programmatically
curl -X POST localhost:3455/api/register-project \
  -H "Content-Type: application/json" \
  -d '{"name": "my-project", "path": "/path/to/project"}'

# Add MCP server
curl -X POST localhost:3455/api/mcp/add \
  -H "Content-Type: application/json" \
  -d '{"scope": "user", "mcpConfig": {"name": "my-db", "command": "npx @supabase/mcp-server", "envVars": {"SUPABASE_URL": "..."}}}' 

# Get system status
curl localhost:3455/api/status

# List MCP servers
curl localhost:3455/api/mcp/list/user

# Enable session tracking  
curl -X POST localhost:3455/api/toggle-session-tracking \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

## Requirements

- **Node.js** 16+ and npm
- **Claude Code CLI** installed and configured
- **Git** (optional, for remote URL detection)
- **macOS or Linux** (Windows via WSL)

## Development

```bash
# Install dependencies
npm install
npm run frontend:install  # Install React dependencies

# Build frontend for production
npm run frontend:build

# Start backend with hot reload
npm run dev

# For frontend development (React dev server)
npm run frontend:dev

# View logs
tail -f server.log

# Register current directory for testing
npm run claude:register
```

**Architecture:**
- **Backend**: Node.js Express server (port 3455) with WebSocket support
- **Frontend**: React TypeScript app with development server (port 3456)
- **Real-time**: WebSocket communication for live updates
- **File Watching**: Chokidar monitors configuration file changes

## Troubleshooting

**Dashboard not loading?**
- Ensure port 3455 is available
- Check `server.log` for errors

**Projects not registering?**
- Verify `.claude/` directory exists in project
- Check file permissions on config directories

**MCP servers not working?**
- Ensure Claude Code is installed and in PATH
- Check environment variables are correctly set
- Verify MCP server packages are available (e.g., `npx @supabase/mcp-server --help`)

**Session tracking not updating?**
- Enable tracking in dashboard header
- Verify `~/.claude/projects/` directory exists
- Check WebSocket connection in browser dev tools

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)  
3. Follow existing code patterns
4. Add tests for new functionality
5. Submit pull request

See `CLAUDE.md` for detailed development guidelines and architecture overview.