# Claude Manager - Technical Architecture

Node.js application providing a centralized dashboard for monitoring and managing Claude Code configurations, MCP servers, hooks, and session tracking across multiple projects. Built with Express backend, React TypeScript frontend, real-time WebSocket communication, and powered by Bun runtime for fast development.

## Quick Developer Onboarding

This is a dual-service application with Bun as the package manager and runtime. The backend uses WebSocket for real-time updates and file system monitoring via chokidar. The application follows a modular service-oriented architecture optimized for performance.

**Prerequisites:**
- [Bun](https://bun.sh) - Fast JavaScript runtime and package manager  
- Node.js 20+ (for React development)

**Start developing:**
```bash
bun install              # Install all dependencies
bun run build           # Build React app for production  
bun run dev             # SINGLE COMMAND: Runs both backend + frontend in parallel! 🚀
```

**Individual service commands:**
```bash
cd backend && bun --watch index.js    # Backend API only (port 3455)
cd frontend && bun run start         # Frontend dev server (port 3456)
```

**🚨 IMPORTANT: Development URLs**
- **Frontend (with hot reload)**: http://localhost:3456 ← USE THIS FOR DEVELOPMENT
- **Backend API only**: http://localhost:3455/api/* ← APIs only, NO WEB UI

**Backend port 3455 serves ONLY REST API endpoints, NO static files or web UI.**
**Frontend port 3456 serves the React app with hot reload and proxies API calls to 3455.**

**Development Workflow:**
```bash
# Option 1: Start both services together (recommended)
bun run dev                          # Starts backend + frontend in parallel

# Option 2: Start services individually 
cd backend && bun --watch index.js   # Terminal 1: Backend API (3455)
cd frontend && bun run start        # Terminal 2: Frontend dev (3456)

# Then always use: http://localhost:3456 for development
```

**Register projects for testing:**
```bash
bun run claude:register  # Register current directory
./install.sh && source ~/.zshrc  # Install global cm-reg/cm-unreg commands
```

## Repository Structure

```
backend/                  # Node.js Express backend
├── index.js              # Main server entry point
├── claude-manager.js     # ClaudeManager class with Express server
├── register-project.js   # Standalone project registration utility
├── services/             # Service modules organized by domain
│   ├── data/             # Data management services
│   │   ├── mcp-config-manager.js    # MCP configuration persistence
│   │   ├── project-registry.js      # Project registration data
│   │   └── session-data-manager.js  # Session tracking data
│   ├── operations/       # Business logic operations
│   │   ├── mcp-operations.js        # MCP server lifecycle operations
│   │   ├── project-operations.js    # Project management operations
│   │   └── session-calculator.js    # Session usage calculations
│   ├── file-watcher.js   # File system monitoring service
│   ├── mcp-service.js    # MCP server management service
│   ├── project-service.js# Project configuration service
│   └── session-service.js# Session tracking service
├── config/               # Configuration files
│   └── hooks.js          # Hook system definitions and presets
└── utils/                # Utility functions
    ├── env-utils.js      # Environment variable utilities
    └── path-utils.js     # Path validation utilities

frontend/                 # React TypeScript frontend application
├── src/
│   ├── components/       # React components organized by feature
│   │   ├── Header/       # Header with connection status
│   │   ├── MCPManagement/# MCP server management component
│   │   ├── ProjectScope/ # Project-specific management
│   │   │   ├── ClaudeMdEditor.tsx    # CLAUDE.md file editor
│   │   │   └── ProjectScope.tsx      # Project scope container
│   │   ├── ScopeSelector/# User/Project scope switcher
│   │   └── UserScope/    # User-level configuration
│   │       ├── EnvVariablesTable.tsx # Environment variable management
│   │       ├── ProjectRegistration.tsx # Project registration UI
│   │       ├── UserClaudeMdEditor.tsx  # User-level CLAUDE.md editor
│   │       ├── UserConfiguration.tsx   # User settings management
│   │       └── UserScope.tsx          # User scope container
│   ├── services/         # Frontend services
│   │   ├── ApiService.ts # HTTP API client with typed methods
│   │   └── WebSocketService.ts # WebSocket client with reconnection
│   ├── types.ts          # TypeScript type definitions
│   └── App.tsx           # Main React application
├── public/               # React public assets
└── build/                # Production build output (auto-generated)

bin/
├── cm-reg                # Global registration command
└── cm-unreg              # Global unregistration command

examples/                 # Template configuration files
├── claude-desktop-config.json.example
├── claude-settings.json.example
├── project-env.example
├── registry.json.example
├── session-tracking.json.example
├── settings.json.example
└── user.env.example

install.sh               # Setup script for global commands
```

## Core Architecture

### Backend (backend/claude-manager.js)

The backend is built around the `ClaudeManager` class which orchestrates all system functionality:

**Core responsibilities:**
- Project registry and configuration management
- MCP server lifecycle management (add/remove/enable/disable)
- Hook system with pre/post-tool execution
- Real-time session tracking and usage monitoring
- WebSocket server for live dashboard updates
- REST API endpoints for all operations
- File system watching with chokidar for configuration changes

**Service Architecture:**
- **Data Layer**: Handles persistence of configurations, registry, and session data
- **Operations Layer**: Contains business logic for MCP management, project operations, and session calculations
- **Service Layer**: Provides high-level interfaces for file watching, project management, MCP management, and session tracking
- **Utilities**: Path validation, environment variable handling

### Frontend (frontend/)

The frontend is a React TypeScript application with a component-based architecture optimized for real-time updates:

**Component Hierarchy:**
- `App.tsx` - Main application container with WebSocket connection management
- `Header` - Connection status indicator and session tracking toggle
- `ScopeSelector` - Switch between User and Project views with dynamic project dropdown
- `UserScope` - Container for user-level management including:
  - `ProjectRegistration` - Register/unregister projects with validation
  - `UserConfiguration` - User Claude settings, hooks, and environment variables
  - `UserClaudeMdEditor` - User-level CLAUDE.md file editing
  - `EnvVariablesTable` - Environment variable management with masking
  - `MCPManagement` - User-level MCP servers
- `ProjectScope` - Project-specific configuration and management including:
  - `ClaudeMdEditor` - Project CLAUDE.md file editing with live preview
  - `MCPManagement` - Project-specific MCP servers

**Services:**
- `ApiService` - HTTP API communication with typed methods and error handling
- `WebSocketService` - Real-time updates with connection management, auto-reconnection, and event handling

**State Management:**
- React hooks for local component state
- WebSocket for real-time server state synchronization
- TypeScript interfaces for comprehensive type safety
- Immutable state updates for predictable rendering

### Key Architectural Patterns

1. **Event-Driven File Monitoring**
   - `chokidar` watchers monitor Claude config directories
   - Debounced updates (2-second delay) prevent excessive refreshes
   - Automatic state refresh on configuration changes
   - Granular watching of specific files: `.claude/settings.json`, `CLAUDE.md`, user configuration files

2. **Centralized State Management**
   - Single `this.state` object contains all application data
   - JSON persistence to `~/.claude-manager/` directory
   - Automatic saving on state changes
   - Immutable state updates for consistency

3. **Service-Oriented Architecture**
   - Separation of concerns between data, operations, and service layers
   - Dependency injection for testability
   - Clear interfaces between components

4. **WebSocket Real-time Updates**
   - Broadcasts state changes to connected clients
   - Live session countdown updates every second
   - File change notifications
   - Connection management with automatic reconnection
   - Event-driven communication pattern

## Development Workflow

### File Organization Patterns

**Configuration Storage:**
- User-level: `~/.claude-manager/` (registry, settings, session data)  
- Project-level: `.claude/settings.json`, `CLAUDE.md`
- Global commands: `~/.local/bin/cm-reg`, `~/.local/bin/cm-unreg`

**State Object Structure:**
```javascript
this.state = {
  userConfig: {},                    // User Claude settings from ~/.claude/settings.json
  projects: {},                      // Registered project configs with metadata
  userEnvVars: {},                   // Global environment variables (~/.claude-manager/user.env)
  projectEnvVars: {},                // Project-specific env vars (.env files)
  settings: {},                      // Dashboard preferences and configuration
  mcps: {                           // MCP server configurations
    userMCPs: { active: {}, disabled: {} },     // User-level MCP servers
    projectMCPs: { active: {}, disabled: {} }   // Project-specific MCP servers
  },
  sessionTracking: {                 // Claude Code usage monitoring data
    enabled: false,                  // Whether tracking is active
    currentSessionStart: null,       // Start time of current 5-hour session
    billingDate: 1,                 // Monthly billing cycle start date
    monthlySessions: 0,             // Total sessions this billing period
    sessionHistory: [],             // Historical session data
    planLimits: {                   // Plan-specific limits
      pro: 45, maxFive: 225, maxTwenty: 900
    }
  },
  claudeMd: {                       // CLAUDE.md file contents
    user: '',                       // User-level CLAUDE.md content
    projects: {}                    // Project-specific CLAUDE.md content
  }
}
```

### Key Components to Understand

**1. MCP Service (backend/services/mcp-service.js)**
- Claude CLI command generation (`claude mcp add/remove/enable/disable`)
- Template system for popular MCP servers (Supabase, Neo4j, Playwright, GitHub, PostgreSQL, Notion, Figma)
- Environment variable handling, validation, and prompting
- Active/disabled state management with persistent storage
- Scope-aware operations (user-level vs project-level)

**2. Hook System (backend/config/hooks.js)**
- Four hook types: PreToolUse, PostToolUse, Notification, Stop
- Built-in safety hooks prevent dangerous commands (`rm -rf`, `sudo`)
- Auto-formatting hooks for multiple languages (Black, Prettier, Go fmt, ESLint, Ruff)
- Git integration hooks for staging and pushing changes
- API key exposure prevention

**3. Session Tracking (backend/services/session-service.js)**
- Monitors `~/.claude/projects/**/*.jsonl` files for session detection
- Real-time calculation of 5-hour session usage with countdown timer
- Plan limit awareness (Pro: 45, Max-5x: 225, Max-20x: 900)
- Monthly usage statistics with configurable billing periods
- Session history tracking and analytics

**4. File Watchers (backend/services/file-watcher.js)**
- User-level Claude configs: `~/.claude/settings.json`
- Project-level configs: `.claude/settings.json`, `CLAUDE.md`
- Environment variable files: `~/.claude-manager/user.env`, project `.env`
- Debounced updates to prevent excessive operations
- Automatic refresh triggers and WebSocket broadcasts

**5. CLAUDE.md Editor (frontend/components/ProjectScope/ClaudeMdEditor.tsx)**
- Monaco editor integration with markdown syntax highlighting
- Live preview with real-time rendering
- Auto-save functionality with debounced updates
- Dark theme optimized for development
- WebSocket synchronization for multi-client editing

**6. Environment Variable Management**
- Masked display of sensitive values in dashboard
- Copy operations between user and project scopes
- Real-time validation and error checking
- Integration with MCP server environment requirements

## API Architecture

### REST Endpoints

**Project Management:**
- `POST /api/register-project` - Add project to registry with validation
- `POST /api/unregister-project` - Remove project and cleanup
- `GET /api/status` - Full system state including all configurations

**Configuration Management:**
- `POST /api/save-file` - Update settings/CLAUDE.md files with validation
- `POST /api/add-hook` - Add hook to user settings
- `GET /api/common-hooks` - Hook presets library organized by category
- `POST /api/save-claude-md` - Save CLAUDE.md content for user or project scope

**MCP Management:**
- `GET /api/mcp/templates` - Available MCP server templates with environment requirements
- `GET /api/mcp/list/:scope` - List MCP servers for user/project scope (active and disabled)
- `POST /api/mcp/add` - Add new MCP server with template support
- `POST /api/mcp/remove` - Permanently delete MCP server
- `POST /api/mcp/disable` - Disable MCP server (move to storage)
- `POST /api/mcp/enable` - Re-enable disabled MCP server

**Session Tracking:**
- `POST /api/toggle-session-tracking` - Enable/disable tracking
- `GET /api/session-stats` - Usage statistics and history
- `GET /api/countdown` - Active session countdown with time remaining

**Environment Variables:**
- `POST /api/add-user-env` - Save user-level env var with validation
- `POST /api/add-env-to-project` - Add env var to project scope
- `POST /api/copy-env-to-user` - Copy project var to user level
- `POST /api/remove-env` - Remove environment variable

### WebSocket Events

**Outgoing to client:**
- Initial connection: Full state object with all configurations
- `fileChange`: Configuration file updates with change details
- `sessionTracking`: Session state changes and statistics
- `sessionCountdown`: Live countdown updates every second
- `mcpUpdate`: MCP server state changes (add/remove/enable/disable)
- `claudeMdUpdate`: CLAUDE.md file content changes
- `envVarUpdate`: Environment variable changes

**Connection Management:**
- Automatic reconnection on disconnect
- Heartbeat to maintain connection
- Error handling and retry logic

## Development Guidelines

### Code Conventions

**File Paths:**
- Always use absolute paths with `path.join()` and `path.resolve()`
- Validate paths are within allowed directories using utility functions
- Use `fs-extra` for enhanced file operations with promise support
- Consistent path validation in `backend/utils/path-utils.js`

**Error Handling:**
- Graceful degradation for missing files/directories
- Structured logging with timestamps to `server.log`
- Proper HTTP status codes for API responses (200, 400, 404, 500)
- Client-side error boundaries in React components
- WebSocket error handling with reconnection logic

**State Management:**
- Immutable updates to `this.state` object
- Automatic JSON persistence on changes with atomic writes
- Debounced file system operations (2-second delay)
- Type-safe state updates with TypeScript interfaces

**TypeScript Guidelines:**
- Comprehensive type definitions in `frontend/src/types.ts`
- Strict TypeScript configuration with type checking
- Interface-first development for API contracts
- Proper generic types for reusable components

### Adding New Features

**MCP Template Addition:**
1. Add template to `this.templates` in `MCPService` constructor with:
   - Name, description, and command
   - Required environment variables with descriptions
   - Optional configuration parameters
2. Test template creation and environment variable prompting
3. Ensure proper scope handling (user vs project)
4. Validate Claude CLI compatibility

**Hook Addition:**  
1. Add to appropriate category in `COMMON_HOOKS` (backend/config/hooks.js)
2. Include pattern matching, shell command, and description
3. Test with various file types and operations
4. Consider safety implications and add to safety checks if needed

**React Component Addition:**
1. Create component in appropriate feature directory
2. Follow existing TypeScript patterns and interfaces
3. Implement proper error boundaries and loading states
4. Add CSS modules for styling consistency
5. Integrate with WebSocket service for real-time updates

**API Endpoint Addition:**
1. Add route handler in main initialization (claude-manager.js)
2. Implement proper request validation and sanitization
3. Update state object using immutable patterns
4. Broadcast changes via WebSocket to connected clients
5. Handle errors with appropriate HTTP codes and messages
6. Add TypeScript types for request/response objects

**Service Layer Addition:**
1. Create service in appropriate directory (data/operations/services)
2. Implement dependency injection pattern
3. Add proper error handling and logging
4. Create unit tests for business logic
5. Integrate with file watching if needed

### Testing Strategy

**Manual Testing:**
- Register multiple projects with different types (Node.js, Python, Rust, etc.)
- Add and configure MCP servers with various templates
- Enable session tracking and verify countdown accuracy
- Test hook execution with different file patterns
- Verify CLAUDE.md editor functionality with live preview
- Test environment variable management across scopes

**File Watching:**
- Modify `.claude/settings.json` files and verify immediate updates
- Update `CLAUDE.md` files and check editor synchronization
- Change environment variables and verify masking/display
- Verify WebSocket broadcasts reach all connected clients

**Frontend Testing:**
- Test component rendering with various state combinations
- Verify WebSocket connection management and reconnection
- Test responsive design across different screen sizes
- Validate form submissions and error handling
- Check accessibility compliance

**API Testing:**
```bash
# Test project registration
curl -X POST localhost:3455/api/register-project \
  -H "Content-Type: application/json" \
  -d '{"name": "test-project", "path": "/path/to/project"}'

# Test MCP server addition with template
curl -X POST localhost:3455/api/mcp/add \
  -H "Content-Type: application/json" \
  -d '{"scope": "user", "mcpConfig": {"name": "supabase", "command": "npx @supabase/mcp-server", "envVars": {"SUPABASE_URL": "https://test.supabase.co"}}}'

# Test CLAUDE.md content saving
curl -X POST localhost:3455/api/save-claude-md \
  -H "Content-Type: application/json" \
  -d '{"scope": "project", "projectName": "test-project", "content": "# Updated content"}'

# Test system status
curl localhost:3455/api/status

# Test session tracking toggle
curl -X POST localhost:3455/api/toggle-session-tracking \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

**Integration Testing:**
- End-to-end workflows from project registration to MCP configuration
- Cross-browser compatibility testing
- Performance testing with multiple concurrent WebSocket connections
- File system permission testing on different operating systems

## Security Considerations

**Path Validation:**
- File access strictly restricted to Claude-related directories only
- No arbitrary file system access via API endpoints
- Input sanitization and validation on all user inputs
- Path traversal attack prevention with strict allow-listing
- Symbolic link resolution to prevent directory escaping

**Environment Variables:**
- Sensitive values masked in dashboard display (show only first/last characters)
- No exposure of secrets in server logs or WebSocket broadcasts
- Separate user-level and project-level storage with appropriate permissions
- Environment variable validation before storage
- Secure handling of API keys and database credentials

**Hook Safety:**
- Built-in dangerous command detection (`rm -rf`, `sudo`, etc.)
- API key and secret exposure prevention in code commits
- File permission validation before executing operations
- Command injection prevention with proper escaping
- Whitelist approach for allowed shell commands

**Network Security:**
- CORS configuration for frontend-backend communication
- WebSocket origin validation
- Rate limiting on API endpoints
- Input validation on all request parameters
- Secure handling of file uploads and content

**Data Protection:**
- Local storage only - no external data transmission
- Proper file permissions on configuration directories
- Atomic writes to prevent data corruption
- Backup and recovery mechanisms for critical configuration

## Performance Optimizations

**File System Monitoring:**
- Debounced updates prevent excessive operations (2-second delay)
- Efficient chokidar configuration with depth limits and specific file patterns
- Selective watching of only relevant files (`.claude/settings.json`, `CLAUDE.md`, `.env`)
- Graceful watcher cleanup on project unregistration
- Efficient file change detection with minimal CPU usage

**WebSocket Efficiency:**
- Differential state updates - only broadcast actual changes, not full state
- Session countdown updates only when tracking is active
- Connection pooling and proper cleanup on disconnect
- Message batching for multiple rapid changes
- Heartbeat mechanism to maintain connection health

**Memory Management:**
- Lazy loading of project configurations and CLAUDE.md content
- Automatic cleanup of watchers and timers on project unregistration
- Efficient JSON serialization/deserialization with streaming for large files
- Garbage collection-friendly object patterns
- Memory leak prevention in long-running processes

**Frontend Performance:**
- React component memoization for expensive renders
- Debounced input handling in editors and forms
- Virtual scrolling for large lists (project registry, session history)
- Code splitting for faster initial load times
- Efficient WebSocket message handling with batching

**Caching Strategies:**
- In-memory caching of frequently accessed configuration data
- Intelligent cache invalidation on file changes
- Browser caching for static assets
- Optimized bundle sizes for production builds

## Common Development Tasks

**Debugging file watching issues:**
1. Check `server.log` for watcher events and error messages
2. Verify file permissions on watched directories (`~/.claude/`, project directories)
3. Test debouncing behavior with rapid file changes
4. Validate WebSocket message broadcasts reach all connected clients
5. Check for symbolic links that might break watching
6. Verify chokidar configuration for proper file pattern matching

**Extending session tracking:**
1. Understand JSONL file format in `~/.claude/projects/` directories
2. Add new fields to `sessionTracking` state object
3. Update session calculation logic in `backend/services/operations/session-calculator.js`
4. Modify frontend components to display new metrics
5. Test with different Claude Code usage patterns and plan types
6. Ensure proper handling of timezone differences

**Adding new MCP templates:**
1. Research MCP server requirements and environment variables
2. Add template configuration to `MCPService` constructor
3. Test installation and configuration process
4. Validate environment variable prompting works correctly
5. Document template in user-facing materials
6. Ensure compatibility with Claude CLI commands

**Extending the CLAUDE.md editor:**
1. Understand Monaco editor configuration and themes
2. Add new features like auto-completion or custom syntax highlighting
3. Test real-time synchronization across multiple clients
4. Ensure proper handling of large files and performance
5. Add keyboard shortcuts and accessibility features
6. Validate markdown rendering in preview mode

**Troubleshooting WebSocket issues:**
1. Check browser developer tools for connection errors
2. Verify WebSocket server initialization in backend
3. Test connection handling with network interruptions
4. Validate message parsing and error handling
5. Check for memory leaks in long-running connections
6. Test with multiple concurrent connections

**Performance profiling:**
1. Use Node.js profiling tools for backend performance
2. Monitor file system operation costs with large numbers of projects
3. Profile React component render times
4. Measure WebSocket message throughput
5. Analyze memory usage patterns over time
6. Test with realistic workloads and multiple users

# Development Environment Setup

**Prerequisites:**
- Node.js 16+ and npm
- Claude Code CLI installed and configured
- Git (for project registration and remote URL detection)
- macOS or Linux (Windows via WSL)

**Quick Setup:**
```bash
# Clone and install
git clone <repository-url>
cd claude-manager
bun install              # Install all dependencies with Bun

# Build and start
bun run build           # Build production frontend
bun run dev             # Start backend with Bun --watch

# Install global commands (optional)
./install.sh
source ~/.zshrc

# Register current project for testing
bun run claude:register
```

**Development Commands:**
```bash
# Single command development (recommended)
bun run dev              # Both backend + frontend in parallel with colored output

# Individual services
cd backend && bun --watch index.js    # Backend only
cd frontend && bun run start         # Frontend only

# Production and utilities
bun run build           # Build production frontend
bun start               # Start production server
bun run test            # Run frontend tests
bun run typecheck       # TypeScript checking
bun run clean           # Clean all dependencies
bun run claude:register # Register current project

# Monitoring
tail -f server.log      # Monitor server logs
```