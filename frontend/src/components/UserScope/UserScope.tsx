import React from 'react';
import { AppState } from '../../types';
import ProjectRegistration from './ProjectRegistration';
import UserConfiguration from './UserConfiguration';
import EnvVariablesTable from './EnvVariablesTable';
import MCPManagement from '../MCPManagement/MCPManagement';
import SlashCommandCreator from './SlashCommandCreator';
import AgentCreator from './AgentCreator';
import HookManagement from '../HookManagement/HookManagement';
import './UserScope.css';

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
        <div className="scope-header">📋 Register New Projects</div>
        <div className="scope-content">
          <ProjectRegistration />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header">⚙️ Claude Settings</div>
        <div className="scope-content">
          <UserConfiguration 
            userConfig={appState.userConfig}
            onRefresh={onRefresh}
          />
        </div>
      </div>


      <div className="scope-section">
        <div className="scope-header">🔌 MCP Servers</div>
        <div className="scope-content">
          <MCPManagement 
            scope="user"
            onMCPUpdate={onRefresh}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header">⚡ Slash Commands</div>
        <div className="scope-content">
          <SlashCommandCreator 
            projects={appState.projects}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header">🤖 Agents</div>
        <div className="scope-content">
          <AgentCreator 
            projects={appState.projects}
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header">🎣 Hook Events</div>
        <div className="scope-content">
          <HookManagement 
            scope="user"
          />
        </div>
      </div>

      <div className="scope-section">
        <div className="scope-header">🌍 Environment Variables</div>
        <div className="scope-content">
          <EnvVariablesTable 
            envVars={appState.userEnvVars}
            projects={appState.projects}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </div>
  );
};

export default UserScope;