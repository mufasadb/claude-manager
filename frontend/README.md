# Claude Manager Frontend

React TypeScript frontend for the Claude Manager dashboard. This is a Create React App project that provides a modern web interface for managing Claude Code configurations, MCP servers, hooks, and session tracking.

**Note**: This frontend is integrated with the main Claude Manager application. For full setup instructions, see the main project README.

## Architecture

The frontend is built with:
- **React 18** with TypeScript for type safety
- **Component-based architecture** with feature-organized modules
- **Real-time updates** via WebSocket connections
- **Responsive design** that works on desktop and mobile

## Key Components

### Core Components
- `App.tsx` - Main application with state management
- `Header/` - Connection status and navigation
- `ScopeSelector/` - User/Project scope switcher with project dropdown

### Feature Components
- `MCPManagement/` - MCP server management with templates and configuration
- `UserScope/` - User-level configuration including:
  - `ProjectRegistration.tsx` - Register/unregister projects
  - `UserConfiguration.tsx` - User Claude settings and hooks
  - `UserClaudeMdEditor.tsx` - User-level CLAUDE.md editing
  - `EnvVariablesTable.tsx` - Environment variable management
- `ProjectScope/` - Project-specific management including:
  - `ClaudeMdEditor.tsx` - Project CLAUDE.md editing with Monaco editor
  - `ProjectScope.tsx` - Project scope container

### Services
- `ApiService.ts` - HTTP API communication with typed methods
- `WebSocketService.ts` - Real-time updates with connection management

## Development Scripts

### `npm start`
Runs the app in development mode at [http://localhost:3456](http://localhost:3456).
The backend server should be running on [http://localhost:3455](http://localhost:3455).
The frontend proxies API requests to the backend automatically.

### `npm run build`
Builds the app for production to the `build` folder.
The backend serves the built files from this directory.

### `npm test`
Launches the test runner in interactive watch mode.

## State Management

The frontend uses React hooks for local component state and receives global state updates via WebSocket. The main state interface includes:

```typescript
interface AppState {
  userConfig: any;                    // User Claude settings
  projects: Record<string, Project>;  // Registered project configurations
  userEnvVars: Record<string, string>; // Global environment variables
  projectEnvVars: Record<string, Record<string, string>>; // Project-specific env vars
  settings: any;                      // Dashboard preferences
  mcps?: MCPList;                    // MCP server configurations (user and project)
  sessionTracking?: SessionTrackingState; // Session usage data
  claudeMd?: {                       // CLAUDE.md file contents
    user: string;
    projects: Record<string, string>;
  };
}
```

## Real-time Features

- **WebSocket connection** for live state synchronization with automatic reconnection
- **File change notifications** when configurations are modified externally
- **MCP server status updates** when servers are added/removed/enabled/disabled
- **Session countdown** for Claude Code usage tracking with live timer
- **CLAUDE.md synchronization** for multi-client editing
- **Environment variable updates** with real-time validation
- **Connection status indicator** in header with visual feedback

## Styling and UI

### Design System
- **Dark theme** optimized for developer workflows
- **CSS modules** for component-scoped styling
- **Responsive design** that works on mobile and desktop
- **Consistent color scheme** across all components

### UI Components
- **Monaco Editor** integration for CLAUDE.md editing with syntax highlighting
- **Loading states** and error handling with visual feedback
- **Accessible form controls** and navigation
- **Masked display** for sensitive environment variables
- **Real-time indicators** for connection status and session tracking

### Key Styling Files
- Component-specific CSS files (e.g., `Header.css`, `MCPManagement.css`)
- Global styles in `src/index.css`
- App-level styles in `src/App.css`

## API Integration

The frontend communicates with the backend via:
- REST API for CRUD operations
- WebSocket for real-time updates
- Error handling with user-friendly messages
- TypeScript interfaces for API response types

## Development Workflow

### Development Mode
1. **Start backend**: `npm run dev` (from root directory) - starts on port 3455
2. **Start frontend**: `npm start` (from frontend directory) - starts on port 3456 with proxy
3. **Access dashboard**: http://localhost:3456 (development) or http://localhost:3455 (production)

### Production Mode
1. **Build frontend**: `npm run build` (from frontend directory)
2. **Start application**: `npm start` (from root directory)
3. **Access dashboard**: http://localhost:3455

### Development Tools
- **Hot reload**: Automatic refresh on code changes
- **React DevTools**: For component debugging
- **TypeScript**: Compile-time type checking
- **Browser DevTools**: For WebSocket monitoring and network debugging

### Key Development Files
- `src/types.ts` - TypeScript interfaces and type definitions
- `src/services/ApiService.ts` - HTTP API client with typed methods
- `src/services/WebSocketService.ts` - WebSocket client with reconnection logic
- `src/App.tsx` - Main application container with state management
