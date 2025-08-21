import React from 'react';
import { AppState } from '../../types';
import ProjectRegistration from './ProjectRegistration';
import UserConfiguration from './UserConfiguration';
import EnvVariablesTable from './EnvVariablesTable';
import MCPManagement from '../MCPManagement/MCPManagement';
import SlashCommandCreator from './SlashCommandCreator';
import AgentCreator from './AgentCreator';
import HookManagement from '../HookManagement/HookManagement';
import HookEvents from '../HookEvents/HookEvents';
import DocumentationManager from './DocumentationManager';
import './UserScope.css';
import { 
  ClipboardList, 
  Settings, 
  Plug, 
  Zap, 
  Bot, 
  Fish, 
  BarChart3, 
  Globe, 
  BookOpen 
} from 'lucide-react';

interface UserScopeProps {
  appState: AppState;
  onRefresh: () => void;
}

const UserScope: React.FC<UserScopeProps> = ({
  appState,
  onRefresh,
}) => {
  return (
    <div id="userScopeContent" className="sections">
      <div className="scope-section">
        <div className="scope-header"><ClipboardList size={16} style={{ marginRight: '8px' }} />Projects</div>
        <div className="scope-content">
          <ProjectRegistration projects={appState.projects} />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><Settings size={16} style={{ marginRight: '8px' }} />Claude Settings</div>
        <div className="scope-content">
          <UserConfiguration 
            userConfig={appState.userConfig}
            onRefresh={onRefresh}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><Plug size={16} style={{ marginRight: '8px' }} />MCP Servers</div>
        <div className="scope-content">
          <MCPManagement 
            scope="user"
            onMCPUpdate={onRefresh}
            envVars={appState.userEnvVars}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><Zap size={16} style={{ marginRight: '8px' }} />Slash Commands</div>
        <div className="scope-content">
          <SlashCommandCreator 
            projects={appState.projects}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><Bot size={16} style={{ marginRight: '8px' }} />Agents</div>
        <div className="scope-content">
          <AgentCreator 
            projects={appState.projects}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><Fish size={16} style={{ marginRight: '8px' }} />Hook Management</div>
        <div className="scope-content">
          <HookManagement 
            scope="user"
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><BarChart3 size={16} style={{ marginRight: '8px' }} />Live Hook Events</div>
        <div className="scope-content">
          <HookEvents />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><Globe size={16} style={{ marginRight: '8px' }} />Environment Variables</div>
        <div className="scope-content">
          <EnvVariablesTable 
            envVars={appState.userEnvVars}
            projects={appState.projects}
            onRefresh={onRefresh}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header"><BookOpen size={16} style={{ marginRight: '8px' }} />Documentation</div>
        <div className="scope-content">
          <DocumentationManager />
        </div>
      </div>
    </div>
  );
};

export default UserScope;