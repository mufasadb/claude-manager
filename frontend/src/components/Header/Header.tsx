import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { SessionCountdown, SessionStats } from '../../types';
import './Header.css';
import { Folder, Monitor, FolderOpen, BarChart3 } from 'lucide-react';

type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

interface HeaderProps {
  onOpenSessionSidebar: () => void;
  selectedProject?: string;
  projectPath?: string;
  selectedScope: 'user' | 'project';
}

const Header: React.FC<HeaderProps> = ({ onOpenSessionSidebar, selectedProject, projectPath, selectedScope }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [sessionCountdown, setSessionCountdown] = useState<SessionCountdown | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        await ApiService.healthCheck();
        setConnectionStatus('connected');
      } catch (error) {
        setConnectionStatus('disconnected');
      }
    };

    const fetchCountdown = async () => {
      try {
        const countdown = await ApiService.getSessionCountdown();
        setSessionCountdown(countdown);
      } catch (error) {
        setSessionCountdown({ active: false });
      }
    };

    const fetchSessionStats = async () => {
      try {
        const stats = await ApiService.getSessionStats();
        setSessionStats(stats);
      } catch (error) {
        setSessionStats(null);
      }
    };

    // Initial checks
    checkConnection();
    fetchCountdown();
    fetchSessionStats();

    // Check connection every 5 seconds
    const connectionInterval = setInterval(checkConnection, 5000);
    
    // Update countdown every second
    const countdownInterval = setInterval(fetchCountdown, 1000);

    // Update session stats every 30 seconds
    const statsInterval = setInterval(fetchSessionStats, 30000);

    return () => {
      clearInterval(connectionInterval);
      clearInterval(countdownInterval);
      clearInterval(statsInterval);
    };
  }, []);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#10b981'; // green
      case 'disconnected': return '#ef4444'; // red
      case 'checking': return '#f59e0b'; // orange
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      case 'checking': return 'Checking...';
    }
  };

  const formatCountdown = () => {
    if (!sessionCountdown?.active || !sessionCountdown.remaining) {
      return 'No active session';
    }

    const { hours, minutes, seconds } = sessionCountdown.remaining;
    return `${hours}h ${minutes}m ${seconds}s remaining`;
  };

  const getCountdownColor = () => {
    if (!sessionCountdown?.active || !sessionCountdown.remaining) {
      return '#6b7280'; // gray
    }

    const { totalMs } = sessionCountdown.remaining;
    const oneHour = 60 * 60 * 1000;
    
    if (totalMs <= oneHour) {
      return '#ef4444'; // red - less than 1 hour
    } else if (totalMs <= 2 * oneHour) {
      return '#f59e0b'; // orange - less than 2 hours
    } else {
      return '#10b981'; // green - more than 2 hours
    }
  };

  const handleOpenVSCode = async () => {
    if (projectPath) {
      try {
        await ApiService.openInVSCode(projectPath);
      } catch (error) {
        console.error('Failed to open project in VS Code:', error);
      }
    }
  };

  const handleOpenFinder = async () => {
    if (projectPath) {
      try {
        await ApiService.openInFinder(projectPath);
      } catch (error) {
        console.error('Failed to open project in Finder:', error);
      }
    }
  };

  const getProjectName = () => {
    if (!selectedProject || !projectPath) return null;
    return projectPath.split('/').pop() || selectedProject;
  };

  const getHeaderTitle = () => {
    if (selectedScope === 'user' || !selectedProject) {
      return 'Claude Manager Dashboard';
    }
    return getProjectName();
  };


  return (
    <div className="header">
      <div className="header-left">
        <div className="status-indicator">
          <div 
            className="status-light" 
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-text">{getStatusText()}</span>
        </div>
      </div>
      
      <div className="header-center">
        {selectedScope === 'project' && selectedProject && projectPath ? (
          <div className="project-header-section">
            <div className="project-info-display">
              <span className="project-icon"><Folder size={16} /></span>
              <div className="project-info">
                <h1 className="project-name">{getProjectName()}</h1>
                <span className="project-path">{projectPath}</span>
              </div>
            </div>
            <div className="project-actions">
              <button 
                className="project-action-btn vscode-btn"
                onClick={handleOpenVSCode}
                title={`Open ${getProjectName()} in VS Code`}
              >
                <Monitor size={16} />
              </button>
              <button 
                className="project-action-btn finder-btn"
                onClick={handleOpenFinder}
                title={`Open ${getProjectName()} in Finder`}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </div>
        ) : (
          <h1 className="dashboard-title">Claude Manager Dashboard</h1>
        )}
      </div>
      
      <div className="header-right">
        <div className="session-countdown">
          <div 
            className="countdown-light" 
            style={{ backgroundColor: getCountdownColor() }}
          />
          <span className="countdown-text">{formatCountdown()}</span>
          <button 
            className="session-stats-button"
            onClick={onOpenSessionSidebar}
            title="View session statistics"
          >
            <BarChart3 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Header;