import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header/Header';
import ScopeSelector from './components/ScopeSelector/ScopeSelector';
import TabNavigation, { Tab } from './components/TabNavigation/TabNavigation';
import SessionSidebar from './components/SessionSidebar/SessionSidebar';
import { AppState } from './types';
import { ApiService } from './services/ApiService';
import { WebSocketService } from './services/WebSocketService';
import { 
  ClipboardList, 
  Settings, 
  Plug, 
  Zap, 
  Bot, 
  Fish, 
  Globe, 
  BookOpen 
} from 'lucide-react';

// Import individual components
import ProjectRegistration from './components/UserScope/ProjectRegistration';
import UserConfiguration from './components/UserScope/UserConfiguration';
import MCPManagement from './components/MCPManagement/MCPManagement';
import SlashCommandCreator from './components/UserScope/SlashCommandCreator';
import AgentCreator from './components/UserScope/AgentCreator';
import HookManagement from './components/HookManagement/HookManagement';
import HookEvents from './components/HookEvents/HookEvents';
import EnvVariablesTable from './components/UserScope/EnvVariablesTable';
import ClaudeMdEditor from './components/ProjectScope/ClaudeMdEditor';
import DocumentationManager from './components/UserScope/DocumentationManager';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    userConfig: {},
    projects: {},
    userEnvVars: {},
    projectEnvVars: {},
    settings: {},
    mcps: {
      userMCPs: { active: {}, disabled: {} },
      projectMCPs: { active: {}, disabled: {} }
    }
  });

  const [selectedScope, setSelectedScope] = useState<'user' | 'project'>('user');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isSessionSidebarOpen, setIsSessionSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('projects');

  useEffect(() => {
    // Initial data fetch
    refreshData();
    
    // Set up WebSocket connection for real-time updates
    WebSocketService.connect((message) => {
      console.log('WebSocket message received:', message);
      if (message.type === 'state-update') {
        // Update the entire app state with new data
        refreshData();
      }
    });

    // Cleanup on component unmount
    return () => {
      WebSocketService.disconnect();
    };
  }, []);

  const refreshData = async () => {
    try {
      const data = await ApiService.getStatus();
      setAppState(data);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  const tabs: Tab[] = [
    { id: 'projects', label: 'Projects', icon: <ClipboardList size={16} /> },
    { id: 'settings', label: 'Claude Settings', icon: <Settings size={16} /> },
    { id: 'mcp', label: 'MCP Servers', icon: <Plug size={16} /> },
    { id: 'slash-commands', label: 'Slash Commands', icon: <Zap size={16} /> },
    { id: 'agents', label: 'Agents', icon: <Bot size={16} /> },
    { id: 'hooks', label: 'Hooks', icon: <Fish size={16} /> },
    { id: 'env-vars', label: 'Environment', icon: <Globe size={16} /> },
    { id: 'documentation', label: 'Documentation', icon: <BookOpen size={16} /> },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'documentation':
        return (
          <div className="scope-section">
            <div className="scope-content">
              <DocumentationManager />
            </div>
          </div>
        );
        
      case 'projects':
        return (
          <div className="scope-section">
            <div className="scope-content">
              <ProjectRegistration projects={appState.projects} />
            </div>
          </div>
        );
      
      case 'settings':
        return (
          <div className="scope-section">
            <div className="scope-content">
              {selectedScope === 'user' ? (
                <UserConfiguration 
                  userConfig={appState.userConfig}
                  onRefresh={refreshData}
                />
              ) : (
                selectedProject && appState.projects[selectedProject] ? (
                  <ClaudeMdEditor
                    projectPath={appState.projects[selectedProject].path}
                    claudeMdContent={appState.projects[selectedProject].claudeMd || ''}
                    onRefresh={refreshData}
                  />
                ) : (
                  <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
                    Please select a project to edit its CLAUDE.md file
                  </div>
                )
              )}
            </div>
          </div>
        );
      
      case 'mcp':
        return (
          <div className="scope-section">
            <div className="scope-content">
              <MCPManagement 
                scope={selectedScope}
                onMCPUpdate={refreshData}
              />
            </div>
          </div>
        );
      
      case 'slash-commands':
        return (
          <div className="scope-section">
            <div className="scope-content">
              <SlashCommandCreator 
                projects={appState.projects}
              />
            </div>
          </div>
        );
      
      case 'agents':
        return (
          <div className="scope-section">
            <div className="scope-content">
              <AgentCreator 
                projects={appState.projects}
              />
            </div>
          </div>
        );
      
      case 'hooks':
        return (
          <div className="scope-section">
            <div className="scope-content">
              <HookManagement 
                scope={selectedScope}
              />
              <div style={{ marginTop: '2rem' }}>
                <HookEvents />
              </div>
            </div>
          </div>
        );
      
      case 'env-vars':
        return (
          <div className="scope-section">
            <div className="scope-content">
              <EnvVariablesTable 
                envVars={
                  selectedScope === 'user' 
                    ? appState.userEnvVars 
                    : selectedProject && appState.projectEnvVars[selectedProject] 
                      ? appState.projectEnvVars[selectedProject]
                      : {}
                }
                projects={appState.projects}
                onRefresh={refreshData}
              />
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="App">
      <Header 
        onOpenSessionSidebar={() => setIsSessionSidebarOpen(true)}
        selectedProject={selectedProject}
        projectPath={selectedProject ? appState.projects[selectedProject]?.path : undefined}
        selectedScope={selectedScope}
      />
      
      <div className="container">
        <ScopeSelector
          selectedScope={selectedScope}
          onScopeChange={setSelectedScope}
          projects={appState.projects}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
        />

        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="tab-content">
          {renderTabContent()}
        </div>
      </div>

      <SessionSidebar 
        isOpen={isSessionSidebarOpen}
        onClose={() => setIsSessionSidebarOpen(false)}
      />
    </div>
  );
};

export default App;
