# Claude Manager

Web-based dashboard for monitoring and managing Claude Code configurations, MCP servers, hooks, and session tracking across multiple projects.

## Development

**Start development server:**
```bash
npm run dev  # Uses nodemon for hot reload
```

**Start production server:**
```bash
npm start
```

**Register projects globally:**
```bash
npm run claude:register  # Register current directory
```

**Web dashboard:** http://localhost:3456

## Key Features

### Project Management
- **Project Registry**: Global registry of all Claude projects
- **Config Monitoring**: Real-time watching of `.claude/settings.json` and `CLAUDE.md` files
- **Auto-detection**: Detects project type (Node.js, Python, Rust, Go)
- **Easy Unregistration**: Remove projects via UI or CLI command

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
- **Simple Stats**: Session count, total duration, and active sessions

### Environment Variables
- **User-level**: Global .env at `~/.claude-manager/user.env`
- **Project-level**: Local .env files per project
- **Security**: Masked display of sensitive values
- **API Integration**: Auto-configure MCP server credentials

## Installation

**Global command setup:**
```bash
./install.sh  # Installs cm-reg command to ~/.local/bin
source ~/.zshrc  # Reload shell
```

**Register/unregister projects from anywhere:**
```bash
cd /path/to/any/project
cm-reg  # Register with directory name
cm-reg my-custom-name  # Register with custom name
cm-unreg  # Unregister current directory
cm-unreg my-project-name  # Unregister specific project
```

## API Endpoints

### Project Management
- `POST /api/register-project` - Register new project
- `POST /api/unregister-project` - Unregister existing project
- `GET /api/status` - Full system state

### MCP Servers
- `GET /api/mcp-templates` - Available MCP server templates
- `POST /api/add-mcp-server` - Install MCP server

### Hooks & Configuration  
- `GET /api/common-hooks` - Hook presets library
- `POST /api/add-hook` - Add hook to user settings
- `POST /api/save-file` - Save settings/CLAUDE.md files

### Session Tracking
- `POST /api/toggle-session-tracking` - Enable/disable tracking
- `POST /api/session-event` - Record session start/stop
- `GET /api/session-stats` - Usage statistics
- `GET /api/countdown` - Active session countdown

### Environment Variables
- `POST /api/add-user-env` - Save user-level env var
- `POST /api/delete-user-env` - Delete user env var  
- `POST /api/add-env-to-project` - Add env var to project

## File Structure

```
src/
├── index.js              # Main server with ClaudeManager class
├── register-project.js   # Project registration utility
└── public/
    └── index.html         # Web dashboard UI

bin/
├── cm-reg                # Global registration command
└── cm-unreg              # Global unregistration command

install.sh                # Setup script for global commands
~/.claude-manager/
├── registry.json         # Project registry
├── user.env             # User-level environment variables  
├── session-tracking.json # Session usage data
└── settings.json        # Persistent settings
```

## Architecture

### Core Components
- **ClaudeManager**: Main class handling all functionality
- **File Watchers**: Monitor config changes with chokidar
- **WebSocket Server**: Real-time updates to dashboard
- **REST API**: Full CRUD operations for all features

### State Management
- **In-memory state**: Projects, configs, MCP servers, session data
- **Persistent storage**: JSON files for registry and session tracking
- **Auto-refresh**: Background polling and file watching

### Security
- **Path validation**: Restricted file access to Claude directories
- **Env masking**: Sensitive values hidden in display
- **Hook safety**: Built-in protection against dangerous commands

## Testing

Tests should verify:
- Project registration and config loading
- MCP server template installation  
- Hook management and file watching
- Session tracking calculations
- API endpoint functionality

**Run tests:**
```bash
npm test  # Add test framework and test files
```

## Deployment

For production deployment:
1. Set `NODE_ENV=production`
2. Configure firewall for port 3456
3. Set up systemd service or PM2 for process management
4. Consider reverse proxy (nginx) for HTTPS

## Common Commands

**Development workflow:**
```bash
npm run dev           # Start with hot reload
cm-reg               # Register new projects
cm-unreg             # Unregister projects  
curl localhost:3456/api/status  # Check system state
```

**Session tracking:**
```bash
# Enable tracking in dashboard or via API
curl -X POST localhost:3456/api/toggle-session-tracking \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```