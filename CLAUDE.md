# Claude Manager - Technical Development Guide

A real-time web dashboard for managing Claude Code across multiple projects with centralized control over MCP servers, automated hooks, session tracking, and configuration management through live WebSocket updates.

## System Architecture Overview

**Application Type**: Dual-service web application with real-time synchronization  
**Primary Runtime**: Bun (package management + fast development execution)  
**Backend Runtime**: Node.js with Express server + WebSocket broadcasting  
**Frontend Stack**: React TypeScript SPA with component-based architecture  
**Communication Layer**: REST API + WebSocket for bidirectional real-time data sync  
**State Architecture**: Centralized backend state management with WebSocket client synchronization  

## Quick Developer Setup

**One-Command Development Start:**
```bash
bun install && bun run dev  # Install deps + start both services
```

**Development URLs:**
- **Frontend (dev mode)**: http://localhost:3456 ← Use this for development
- **Backend API**: http://localhost:3455/api/* ← API endpoints only

**Key Commands:**
```bash
bun run dev              # Start both backend + frontend (recommended)
bun run build            # Build production frontend bundle
bun run test             # Run TypeScript/React tests
bun run claude:register  # Register current directory as test project
```

**Project Registration for Testing:**
```bash
./install.sh && source ~/.zshrc  # Install global cm-reg/cm-unreg commands
cd any-project && cm-reg         # Register project for dashboard
```

## Repository Navigation

**Entry Points:**
- `backend/index.js` - Main server startup
- `backend/claude-manager.js` - Core ClaudeManager class (main application logic)
- `frontend/src/App.tsx` - React application root

### Backend Structure (`backend/`)

**Core Files:**
- `claude-manager.js` - Main application class with Express server, WebSocket, and state management
- `index.js` - Server entry point and initialization
- `register-project.js` - Standalone utility for project registration

**Services Layer (`services/`):**
```
services/
├── data/                          # Data persistence and storage
│   ├── project-registry.js       # Manages registered project list
│   ├── mcp-config-manager.js     # MCP server configuration storage
│   ├── session-data-manager.js   # Usage tracking data persistence
│   └── hook-registry.js          # Hook system registration and configuration
├── operations/                    # Business logic operations  
│   ├── mcp-operations.js          # MCP server lifecycle (add/remove/enable/disable)
│   ├── project-operations.js     # Project management operations
│   ├── session-calculator.js     # Claude Code session usage calculations
│   ├── hook-executor.js          # Hook system execution engine
│   └── hook-generator.js         # AI-powered hook creation and templates
├── integrations/                  # External service integrations
│   ├── ollama-service.js          # Local Ollama model integration
│   └── tts-service.js             # Text-to-Speech service integration
├── agent-service.js               # AI agent creation with OpenRouter integration
├── mcp-service.js                 # MCP server management and templates
├── mcp-discovery-service.js       # AI-powered MCP server discovery
├── hook-event-service.js          # Hook system event handling and dispatch
├── file-watcher.js                # Real-time file monitoring with chokidar
├── file-based-hook-loader.js      # Dynamic hook loading from filesystem
├── project-service.js             # Project configuration management
├── session-service.js             # Session tracking and monitoring
├── command-service.js             # Command execution and management
├── claude-config-reader.js        # Claude configuration file parsing
└── openrouter-service.js          # OpenRouter API integration for AI features
```

### Frontend Structure (`frontend/src/`)

**Component Architecture:**
```
components/
├── Header/                        # Connection status and session tracking toggle
├── ScopeSelector/                 # User vs Project scope switcher with project dropdown
├── SessionSidebar/                # Real-time session tracking and usage monitoring
├── UserScope/                     # User-level management components
│   ├── ProjectRegistration.tsx   # Register/unregister projects via cm-reg/cm-unreg
│   ├── AgentCreator.tsx          # AI-powered agent generation with OpenRouter
│   ├── SlashCommandCreator.tsx   # AI-powered slash command builder
│   ├── UserConfiguration.tsx     # User-level Claude settings management
│   ├── UserClaudeMdEditor.tsx    # User-level CLAUDE.md editing
│   ├── EnvVariablesTable.tsx     # Environment variable management with masking
│   └── UserScope.tsx             # User scope container component
├── ProjectScope/                  # Project-specific components
│   ├── ClaudeMdEditor.tsx        # Project CLAUDE.md editor with Monaco integration
│   └── ProjectScope.tsx          # Project scope container component
├── MCPManagement/                 # MCP server management (both scopes)
├── HookManagement/                # Hook system configuration and management
├── HookBuilder/                   # Visual hook builder interface
├── HookEvents/                    # Hook event monitoring and logs
└── TabNavigation/                 # Tabbed interface navigation
```

**Support Files:**
- `services/ApiService.ts` - HTTP API client with typed methods
- `services/WebSocketService.ts` - Real-time WebSocket communication
- `types.ts` - TypeScript interfaces for the entire application

## Core System Concepts

### How the System Works

**The Big Picture:**
1. **Project Registration**: Projects are registered in `~/.claude-manager/registry.json`
2. **Real-time Monitoring**: File watchers monitor Claude config files in all registered projects
3. **Centralized State**: All project data is stored in `this.state` object in `claude-manager.js`
4. **Live Updates**: WebSocket broadcasts changes to all connected browser clients
5. **Dual Scopes**: Everything operates at either "user-level" (global) or "project-level" (specific project)

### Backend Architecture (`backend/claude-manager.js`)

**The ClaudeManager Class** is the heart of the system:
- Manages Express server (port 3455) and WebSocket server
- Maintains centralized `this.state` object with all application data
- Coordinates all services (MCP, projects, sessions, hooks, file watching)
- Provides REST API endpoints and WebSocket real-time updates

**Service Layer Pattern:**
- **Data Services**: Handle file I/O and persistence (`services/data/`)
- **Operation Services**: Business logic and core functionality (`services/operations/`)
- **Integration Services**: External system connections (OpenRouter, Claude CLI)

### Frontend Architecture (`frontend/src/`)

**React Component Pattern:**
- **App.tsx**: Main container with WebSocket connection and global state
- **Scope-Based Organization**: User scope (global settings) vs Project scope (per-project settings)
- **Real-time Updates**: All components receive live data via WebSocket
- **TypeScript**: Strict typing with interfaces in `types.ts`

**Component Structure:**
```
App.tsx (WebSocket connection + global state)
├── Header (connection status + session toggle)
├── ScopeSelector (User vs Project toggle + project dropdown)
├── UserScope/
│   ├── ProjectRegistration (cm-reg/cm-unreg interface)
│   ├── AgentCreator (AI-powered agent generation)
│   ├── SlashCommandCreator (AI-powered slash commands)
│   └── EnvVariablesTable (global environment variables)
└── ProjectScope/
    ├── ClaudeMdEditor (project-specific CLAUDE.md editing)
    └── MCPManagement (project-specific MCP servers)
```

**Communication Services:**
- **ApiService.ts**: HTTP calls to backend API endpoints
- **WebSocketService.ts**: Real-time data sync with auto-reconnection

## Key Technical Patterns

### 1. Real-time File Monitoring
**How it works**: `chokidar` watches Claude config files and broadcasts changes via WebSocket
```javascript
// Files being watched:
~/.claude/settings.json           // User Claude settings
~/.claude-manager/user.env        // Global environment variables
projectPath/.claude/settings.json // Project Claude settings
projectPath/CLAUDE.md             // Project instructions
projectPath/.env                  // Project environment variables
```

### 2. Dual-Scope Architecture
**Everything operates at two levels:**
- **User Scope**: Global settings shared across all projects (`~/.claude-manager/`)
- **Project Scope**: Project-specific settings (`.claude/`, `CLAUDE.md`, `.env`)

### 3. Centralized State Object
**All data lives in one place** (`backend/claude-manager.js`):
```javascript
this.state = {
  userConfig: {},           // User's Claude settings
  projects: {},            // All registered projects
  userEnvVars: {},         // Global environment variables
  mcps: {                  // MCP servers (user + project scoped)
    userMCPs: { active: {}, disabled: {} },
    projectMCPs: { active: {}, disabled: {} }
  },
  sessionTracking: {},     // Usage monitoring data
  claudeMd: {}             // CLAUDE.md contents
}
```

### 4. WebSocket Live Updates
**Real-time sync pattern:**
1. File changes detected by watchers → Update state → Broadcast to all clients
2. User actions in dashboard → API call → Update state → Broadcast to all clients
3. Frontend receives WebSocket message → Update React state → Re-render UI

## Understanding the System for Development

### Where Things Are Stored

**User-Level Configuration** (`~/.claude-manager/`):
```
~/.claude-manager/
├── registry.json          # List of all registered projects
├── session-tracking.json  # Claude Code usage data
├── settings.json          # Dashboard preferences
└── user.env              # Global environment variables (API keys, etc.)
```

**Project-Level Configuration** (each registered project):
```
your-project/
├── .claude/
│   └── settings.json      # Claude Code settings for this project
├── .env                   # Project-specific environment variables
└── CLAUDE.md             # Project instructions and context
```

### Essential Services to Understand

**When debugging or adding features, these are the key services:**

1. **`mcp-service.js`** - Handles MCP server management
   - Generates Claude CLI commands (`claude mcp add/remove/enable/disable`)
   - Manages templates for popular MCP servers (Supabase, GitHub, etc.)
   - Handles environment variable prompting and validation

2. **`file-watcher.js`** - Real-time file monitoring
   - Uses `chokidar` to watch for file changes in all registered projects
   - Debounces updates (2-second delay) to prevent spam
   - Broadcasts changes via WebSocket to frontend

3. **`session-service.js`** - Claude Code usage tracking
   - Monitors `~/.claude/projects/**/*.jsonl` files for session detection
   - Calculates real-time usage against plan limits
   - Provides countdown timer for current 5-hour session

4. **`agent-service.js`** - AI-powered agent generation
   - Integrates with OpenRouter API for AI text generation
   - Generates professional Claude agents from natural language descriptions
   - Creates slash commands and system messages

5. **`hook-event-service.js`** - Hook system orchestration
   - Manages hook registration, loading, and execution lifecycle
   - Handles hook event dispatching and error management
   - Integrates with file-based hook loader for dynamic hook discovery

6. **`mcp-discovery-service.js`** - AI-powered MCP server discovery
   - Uses AI to find relevant MCP servers based on user descriptions
   - Provides automatic configuration and setup for discovered servers
   - Integrates with MCP templates and environment variable management

7. **`openrouter-service.js`** - OpenRouter API integration
   - Handles authentication and API communication with OpenRouter
   - Provides consistent interface for AI text generation across the application
   - Manages rate limiting and error handling for AI-powered features

## Practical Development Guide

### Making Changes to the System

**Adding a New API Endpoint:**
1. Add route handler in `backend/claude-manager.js` (around line 200+)
2. Update `this.state` object if needed
3. Broadcast changes via WebSocket: `this.broadcastToClients()`
4. Add TypeScript types in `frontend/src/types.ts`
5. Add API method in `frontend/src/services/ApiService.ts`

**Adding a New React Component:**
1. Create component in appropriate directory (`components/UserScope/` or `components/ProjectScope/`)
2. Follow existing patterns (props interface, WebSocket integration)
3. Import and use in parent component
4. Add CSS module if styling needed

**Adding a New MCP Template:**
1. Edit `backend/services/mcp-service.js`
2. Add template to `this.templates` object in constructor
3. Include required environment variables and descriptions
4. Test with actual MCP server installation

### Common Debugging Scenarios

**File Watcher Not Triggering:**
1. Check `server.log` for chokidar errors
2. Verify file permissions on watched directories
3. Ensure debounce isn't hiding rapid changes (2-second delay)

**WebSocket Connection Issues:**
1. Check browser dev tools Network tab for WebSocket connection
2. Verify backend WebSocket server is running (port 3455)
3. Check for CORS issues in browser console

**MCP Servers Not Working:**
1. Ensure Claude CLI is installed: `which claude`
2. Check environment variables are set correctly
3. Test MCP server manually: `npx @supabase/mcp-server --help`

### Code Style and Patterns

**Backend Conventions:**
- Use `async/await` for asynchronous operations
- Always use `path.join()` for file paths
- Handle errors gracefully with try/catch
- Log important operations to `server.log`

**Frontend Conventions:**
- Use TypeScript interfaces for all props and data structures
- Follow React hooks pattern for state management
- Use CSS modules for component styling
- Handle loading and error states in components

**File Naming:**
- Backend services: `kebab-case.js`
- React components: `PascalCase.tsx`
- Utilities: `kebab-case.js`
- Types: `types.ts` (centralized)

## Quick Testing and Development

**Test the System:**
1. Start the application: `bun run dev`
2. Register the current project: `bun run claude:register`
3. Open http://localhost:3456 and switch between User/Project scopes
4. Test file watching by editing `CLAUDE.md` and watching live updates

**Common Development Commands:**
```bash
tail -f server.log              # Monitor backend logs
bun run typecheck              # Check TypeScript errors
curl localhost:3455/api/status # Test API endpoint
```

**Key Files to Edit When Adding Features:**
- **New API endpoints**: `backend/claude-manager.js`
- **New React components**: `frontend/src/components/UserScope/` or `ProjectScope/`
- **New MCP templates**: `backend/services/mcp-service.js`
- **Type definitions**: `frontend/src/types.ts`
- **Hook configurations**: `backend/config/hooks.js`

This system is designed for real-time collaboration and management of Claude Code across multiple projects. The key is understanding the dual-scope architecture (user vs project), the centralized state management, and the real-time WebSocket communication pattern.