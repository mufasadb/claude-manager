export interface Project {
  name: string;
  path: string;
  claudeMd?: string;
  settings?: any;
}

export interface AppState {
  userConfig: any;
  projects: Record<string, Project>;
  userEnvVars: Record<string, string>;
  projectEnvVars: Record<string, Record<string, string>>;
  settings: any;
  mcps?: MCPList;
}

export interface Hook {
  type: 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop';
  pattern: string;
  command: string;
  description?: string;
}

export interface MCPEnvVar {
  key: string;
  description: string;
  required: boolean;
}

export interface MCPTemplate {
  name: string;
  description: string;
  command: string;
  transport: 'stdio' | 'sse' | 'http';
  envVars: MCPEnvVar[];
  args: string[];
}

export interface MCP {
  name: string;
  command: string;
  transport: 'stdio' | 'sse' | 'http';
  envVars: Record<string, string>;
  args: string[];
  addedAt?: number;
  disabledAt?: number;
  enabledAt?: number;
  scope: 'user' | 'project';
}

export interface MCPState {
  active: Record<string, MCP>;
  disabled: Record<string, MCP>;
}

export interface MCPList {
  userMCPs: MCPState;
  projectMCPs: MCPState;
}

export interface SessionCountdown {
  active: boolean;
  remaining?: {
    totalMs: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
}

export interface SessionStats {
  enabled: boolean;
  currentPeriodStart: string;
  nextPeriodStart: string;
  billingDate: number;
  monthlySessions: number;
  sessionHistory: Array<{
    start: string;
    end: string;
    duration: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    userTurns: number;
    userMessages: number;
    assistantMessages: number;
    messageCount: number;
  }>;
  planLimits: {
    max: number;
  };
  periodMetrics: {
    totalDaysInPeriod: number;
    daysElapsed: number;
    daysRemaining: number;
    projectedSessions: number;
    sessionsPerDay: number;
    sessionsRemaining: number;
    sessionsPerDayNeeded: number;
  };
  periodTotals: {
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    userTurns: number;
    messageCount: number;
  };
  lifetimeStats: {
    totalSessions: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalUserTurns: number;
    totalMessages: number;
    costs: {
      sonnet4: number;
      opus4: number;
    };
  };
}

export interface SlashCommand {
  name: string;
  category: string | null;
  description: string;
  path: string;
  relativePath: string;
}

export interface SlashCommandFormData {
  commandName: string;
  instructions: string;
  scope: 'user' | 'project';
  category: string;
  projectName?: string;
}

export interface SlashCommandCreationResult {
  success: boolean;
  commandPath?: string;
  relativePath?: string;
  output?: string;
  error?: string;
  description?: string;
  allowedTools?: string[];
  suggestedCategory?: string;
}

export interface MCPOperationResult {
  success: boolean;
  warning?: string;
}

export interface Agent {
  name: string;
  description: string;
  textFace: string;
  textColor: string;
  tools: string[];
  scope: 'user' | 'project';
  path: string;
  relativePath: string;
}

export interface AgentFormData {
  agentName: string;
  description: string;
  scope: 'user' | 'project';
  projectName?: string;
  textFace: string;
  textColor: string;
  tools: string[];
}

export interface AgentTemplate {
  asciiPresets: Array<{
    face: string;
    name: string;
    description: string;
  }>;
  colorPresets: Array<{
    color: string;
    name: string;
    hex: string;
  }>;
  defaultTools: string[];
}

export interface AgentCreationResult {
  success: boolean;
  agentPath?: string;
  relativePath?: string;
  output?: string;
  error?: string;
}