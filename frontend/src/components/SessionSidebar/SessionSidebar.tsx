import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';
import { SessionStats, SessionCountdown } from '../../types';
import './SessionSidebar.css';

interface SessionSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const SessionSidebar: React.FC<SessionSidebarProps> = ({ isOpen, onClose }) => {
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [sessionCountdown, setSessionCountdown] = useState<SessionCountdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchSessionData();
      const interval = setInterval(fetchSessionData, 5000); // Update every 5 seconds when open
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchSessionData = async () => {
    try {
      const [stats, countdown] = await Promise.all([
        ApiService.getSessionStats(),
        ApiService.getSessionCountdown()
      ]);
      setSessionStats(stats);
      setSessionCountdown(countdown);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch session data:', error);
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    return `${hours.toFixed(1)}h`;
  };

  const getCurrentSessionStatus = () => {
    if (!sessionCountdown?.active) {
      return { status: 'No active session', color: '#6b7280' };
    }

    const { totalMs } = sessionCountdown.remaining!;
    const oneHour = 60 * 60 * 1000;
    
    if (totalMs <= oneHour) {
      return { status: 'Session ending soon', color: '#ef4444' };
    } else if (totalMs <= 2 * oneHour) {
      return { status: 'Session active', color: '#f59e0b' };
    } else {
      return { status: 'Session active', color: '#10b981' };
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="session-sidebar-overlay" onClick={onClose} />
      <div className="session-sidebar">
        <div className="session-sidebar-header">
          <h2>Session Statistics</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="session-sidebar-content">
          {loading ? (
            <div className="loading">Loading session data...</div>
          ) : (
            <>
              {/* Current Session Status */}
              <div className="session-section">
                <h3>Current Session</h3>
                <div className="current-session">
                  <div className="session-status">
                    <div 
                      className="status-indicator"
                      style={{ backgroundColor: getCurrentSessionStatus().color }}
                    />
                    <span>{getCurrentSessionStatus().status}</span>
                  </div>
                  {sessionCountdown?.active && sessionCountdown.remaining && (
                    <div className="time-remaining">
                      <strong>
                        {sessionCountdown.remaining.hours}h {sessionCountdown.remaining.minutes}m {sessionCountdown.remaining.seconds}s remaining
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Statistics */}
              {sessionStats && (
                <>
                  <div className="session-section">
                    <h3>Current Billing Period</h3>
                    <div className="billing-info">
                      <div className="billing-row">
                        <span>Period:</span>
                        <span>{formatDate(sessionStats.currentPeriodStart)} - {formatDate(new Date().toISOString())}</span>
                      </div>
                      <div className="billing-row">
                        <span>Sessions Used:</span>
                        <span className="sessions-count">{sessionStats.monthlySessions}</span>
                      </div>
                      <div className="billing-row">
                        <span>Plan Limits:</span>
                        <div className="plan-limits">
                          <div>Pro: {sessionStats.planLimits.pro}</div>
                          <div>Max-5x: {sessionStats.planLimits.maxFive}</div>
                          <div>Max-20x: {sessionStats.planLimits.maxTwenty}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Session History */}
                  <div className="session-section">
                    <h3>Recent Sessions ({sessionStats.sessionHistory.length})</h3>
                    <div className="session-history">
                      {sessionStats.sessionHistory.length === 0 ? (
                        <div className="no-sessions">No session history available</div>
                      ) : (
                        sessionStats.sessionHistory.slice(-10).reverse().map((session, index) => (
                          <div key={index} className="session-item">
                            <div className="session-date">
                              {formatDate(session.start)}
                            </div>
                            <div className="session-duration">
                              {formatDuration(session.duration)}
                            </div>
                            <div className="session-period">
                              {new Date(session.start).toLocaleDateString() === new Date(session.end).toLocaleDateString() 
                                ? `${new Date(session.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(session.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                                : `${new Date(session.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(session.end).toLocaleDateString()} ${new Date(session.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                              }
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default SessionSidebar;