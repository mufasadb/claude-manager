# Claude Manager

Web-based dashboard for monitoring and managing Claude Code configurations, MCP servers, hooks, and session tracking across multiple projects.

## Features

### Project Management
- **Global Registration**: Register any project from any directory
- **Project Tracking**: Maintains a registry of all your projects with metadata
- **Config Monitoring**: Real-time watching of `.claude/settings.json` and `CLAUDE.md` files
- **Auto-detection**: Detects project type (Node.js, Python, Rust, Go)

### MCP Server Management  
- **30+ Templates**: Pre-configured MCP servers (Playwright, Supabase, GitHub, etc.)
- **Auto-installation**: Handles `npm install` and dependency setup
- **Environment Setup**: Automatic .env configuration for API keys
- **Scope Control**: Install globally or per-project

### Hook Management
- **Safety Hooks**: Prevent dangerous commands, API key exposure
- **Auto-formatting**: Black, Prettier, Go fmt integration  
- **Testing Hooks**: Run tests after code changes
- **Git Integration**: Auto-staging, commit validation

### Session Tracking
- **Usage Monitoring**: Track Claude Code 5-hour sessions
- **Plan Limits**: Pro (45 sessions), Max-5x (225), Max-20x (900)
- **Billing Periods**: Monthly usage tracking with estimates
- **Real-time Countdown**: Active session time remaining

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/callmebeachy/claude-manager.git
   cd claude-manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up configuration files:
   ```bash
   # Create the ~/.claude-manager directory
   mkdir -p ~/.claude-manager
   
   # Copy example files
   cp examples/registry.json.example ~/.claude-manager/registry.json
   cp examples/session-tracking.json.example ~/.claude-manager/session-tracking.json
   cp examples/settings.json.example ~/.claude-manager/settings.json
   cp examples/user.env.example ~/.claude-manager/user.env
   
   # Edit user.env with your actual API keys
   nano ~/.claude-manager/user.env
   ```

4. Install global commands (optional):
   ```bash
   ./install.sh
   source ~/.zshrc  # or ~/.bashrc, ~/.bash_profile depending on your shell
   ```

## Usage

### Start the Dashboard

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

Open your browser to **http://localhost:3456** to access the dashboard.

### Registering Projects

Navigate to any project directory and register it:

```bash
cd /path/to/your/project
cm-reg                      # Register with directory name
cm-reg my-custom-name       # Register with custom name
cm-unreg                    # Unregister current directory
cm-unreg my-project-name    # Unregister specific project
```

Or use the npm script:
```bash
npm run claude:register
```

### Environment Variables

#### User-Level Variables
Global environment variables stored in `~/.claude-manager/user.env`:
- API keys for GitHub, OpenAI, Supabase, etc.
- Shared configuration across all projects
- Automatically loaded by MCP servers

#### Project-Level Variables  
Project-specific variables in each project's `.env` file:
- Database connections
- API endpoints
- Feature flags

### Session Tracking

Enable session tracking to monitor your Claude Code usage:

1. **Enable in Dashboard**: Toggle "Session Tracking" in the header
2. **Configure Plan**: Set your Claude plan type (Pro/Max-5x/Max-20x)
3. **Set Billing Period**: Choose your billing cycle start date

The system automatically tracks:
- 5-hour session starts
- Monthly usage statistics
- Real-time countdown for active sessions
- Plan limit warnings

### MCP Server Management

Install MCP servers from 30+ pre-configured templates:

1. **Browse Templates**: View available servers in the dashboard
2. **Choose Scope**: Install globally or per-project
3. **Auto-Setup**: Dependencies and environment variables configured automatically
4. **Instant Use**: Servers ready for Claude Code immediately

Popular templates:
- **Playwright**: Browser automation
- **Supabase**: Database and API access
- **GitHub**: Repository management
- **Filesystem**: File operations
- **Memory**: Persistent knowledge graphs

### Hook Management

Set up automated workflows that trigger on Claude actions:

#### Safety Hooks
- Block dangerous commands (`rm -rf`, `sudo`)
- Prevent API key exposure
- Validate file permissions

#### Formatting Hooks
- Auto-format with Black, Prettier, Go fmt
- Run linters (ESLint, Ruff)
- Consistent code style

#### Git Integration
- Auto-stage modified files
- Run tests before commits
- Push to remote repositories

## Configuration Files

### Example File Structure
```
~/.claude-manager/
├── registry.json          # Project registry
├── session-tracking.json  # Usage statistics
├── settings.json          # Dashboard settings
└── user.env              # Global environment variables

your-project/
├── .claude/
│   ├── settings.json      # Project-specific Claude settings
│   └── settings.local.json # Local overrides
├── .env                   # Project environment variables
└── CLAUDE.md             # Project instructions
```

See the `examples/` directory for template files you can copy and customize.

## API Endpoints

The dashboard provides a REST API for automation:

### Project Management
- `POST /api/register-project` - Register new project
- `POST /api/unregister-project` - Remove project
- `GET /api/status` - Full system state

### Session Tracking
- `POST /api/toggle-session-tracking` - Enable/disable tracking
- `POST /api/session-event` - Record session events
- `GET /api/session-stats` - Usage statistics
- `GET /api/countdown` - Active session countdown

### MCP & Hooks
- `GET /api/mcp-templates` - Available MCP servers
- `POST /api/add-mcp-server` - Install MCP server
- `GET /api/common-hooks` - Hook presets library
- `POST /api/add-hook` - Add hook to settings

## Requirements

- **Node.js** 16+ and npm
- **Claude Code CLI** (for MCP server management)
- **Git** (optional, for remote URL detection)
- **macOS/Linux** (Windows with WSL)

## Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# View logs
tail -f server.log
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing code style and patterns
4. Add tests for new functionality
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Supported Project Types

Auto-detection supports:
- **Node.js** (package.json)
- **Python** (requirements.txt, pyproject.toml)
- **Rust** (Cargo.toml)
- **Go** (go.mod)
- **Generic** (fallback)