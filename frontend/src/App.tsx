import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header/Header';
import ScopeSelector from './components/ScopeSelector/ScopeSelector';
import UserScope from './components/UserScope/UserScope';
import ProjectScope from './components/ProjectScope/ProjectScope';
import SessionSidebar from './components/SessionSidebar/SessionSidebar';
import { AppState } from './types';
import { ApiService } from './services/ApiService';

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

  useEffect(() => {
    // Initial data fetch
    refreshData();
  }, []);

  const refreshData = async () => {
    try {
      const data = await ApiService.getStatus();
      setAppState(data);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  return (
    <div className="App">
      <Header onOpenSessionSidebar={() => setIsSessionSidebarOpen(true)} />
      
      <div className="container">
        <ScopeSelector
          selectedScope={selectedScope}
          onScopeChange={setSelectedScope}
          projects={appState.projects}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
        />

        {selectedScope === 'user' ? (
          <UserScope 
            appState={appState}
            onRefresh={refreshData}
          />
        ) : (
          <ProjectScope
            appState={appState}
            selectedProject={selectedProject}
            onRefresh={refreshData}
          />
        )}
      </div>

      <SessionSidebar 
        isOpen={isSessionSidebarOpen}
        onClose={() => setIsSessionSidebarOpen(false)}
      />
    </div>
  );
};

export default App;
