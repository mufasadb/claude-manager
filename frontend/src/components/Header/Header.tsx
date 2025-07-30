import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { SessionCountdown } from '../../types';
import './Header.css';

type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

const Header: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [sessionCountdown, setSessionCountdown] = useState<SessionCountdown | null>(null);

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

    // Initial checks
    checkConnection();
    fetchCountdown();

    // Check connection every 5 seconds
    const connectionInterval = setInterval(checkConnection, 5000);
    
    // Update countdown every second
    const countdownInterval = setInterval(fetchCountdown, 1000);

    return () => {
      clearInterval(connectionInterval);
      clearInterval(countdownInterval);
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
      
      <h1>Claude Manager Dashboard</h1>
      
      <div className="header-right">
        <div className="session-countdown">
          <div 
            className="countdown-light" 
            style={{ backgroundColor: getCountdownColor() }}
          />
          <span className="countdown-text">{formatCountdown()}</span>
        </div>
      </div>
    </div>
  );
};

export default Header;