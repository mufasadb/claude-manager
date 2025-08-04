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
  const [editingBillingDate, setEditingBillingDate] = useState(false);
  const [newBillingDate, setNewBillingDate] = useState<number>(1);
  const [reprocessing, setReprocessing] = useState(false);

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
      if (stats && !editingBillingDate) {
        setNewBillingDate(stats.billingDate || 1);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch session data:', error);
      setLoading(false);
    }
  };

  const handleBillingDateSave = async () => {
    try {
      await ApiService.setBillingDate(newBillingDate);
      setEditingBillingDate(false);
      await fetchSessionData(); // Refresh data
    } catch (error) {
      console.error('Failed to update billing date:', error);
    }
  };

  const handleReprocessSessions = async () => {
    setReprocessing(true);
    try {
      const result = await ApiService.reprocessSessions();
      console.log(result.message);
      await fetchSessionData(); // Refresh data to show updated token usage
    } catch (error) {
      console.error('Failed to reprocess sessions:', error);
    } finally {
      setReprocessing(false);
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

  const formatNumber = (num: number) => {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  const formatCurrency = (num: number) => {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`;
    }
    return `$${num.toFixed(2)}`;
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
                        <span>Billing Date:</span>
                        {editingBillingDate ? (
                          <div className="billing-date-editor">
                            <input 
                              type="number" 
                              min="1" 
                              max="31" 
                              value={newBillingDate}
                              onChange={(e) => setNewBillingDate(parseInt(e.target.value) || 1)}
                              className="billing-date-input"
                            />
                            <button onClick={handleBillingDateSave} className="save-button">Save</button>
                            <button onClick={() => setEditingBillingDate(false)} className="cancel-button">Cancel</button>
                          </div>
                        ) : (
                          <span onClick={() => setEditingBillingDate(true)} className="editable-billing-date">
                            {sessionStats.billingDate}th of each month (click to edit)
                          </span>
                        )}
                      </div>
                      <div className="billing-row">
                        <span>Period:</span>
                        <span>{formatDate(sessionStats.currentPeriodStart)} - {formatDate(sessionStats.nextPeriodStart)}</span>
                      </div>
                      <div className="billing-row">
                        <span>Sessions Used:</span>
                        <span className="sessions-count">{sessionStats.monthlySessions} / 50</span>
                      </div>
                      <div className="billing-row">
                        <span>Tokens Used:</span>
                        <span className="token-count">{formatNumber(sessionStats.periodTotals.tokens)}</span>
                      </div>
                      <div className="billing-row">
                        <span>User Turns:</span>
                        <span className="turn-count" title="Complete user question + Claude response pairs">
                          {formatNumber(sessionStats.periodTotals.userTurns)}
                        </span>
                      </div>
                      <div className="billing-row">
                        <span>On track for:</span>
                        <span className={`projected-sessions ${sessionStats.periodMetrics.projectedSessions > 50 ? 'over-limit' : 'under-limit'}`}>
                          {sessionStats.periodMetrics.projectedSessions} sessions this month
                        </span>
                      </div>
                      <div className="billing-row">
                        <span>Daily target:</span>
                        <span className="daily-target">
                          {sessionStats.periodMetrics.sessionsPerDayNeeded} sessions/day for next {sessionStats.periodMetrics.daysRemaining} days
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Session History */}
                  <div className="session-section">
                    <div className="session-history-header">
                      <h3>Recent Sessions ({sessionStats.sessionHistory.length})</h3>
                      <button 
                        onClick={handleReprocessSessions}
                        disabled={reprocessing}
                        className="reprocess-button"
                        title="Re-extract token usage and user turns from JSONL files"
                      >
                        {reprocessing ? 'Reprocessing...' : 'Extract Tokens'}
                      </button>
                    </div>
                    <div className="session-history">
                      {sessionStats.sessionHistory.length === 0 ? (
                        <div className="no-sessions">No session history available</div>
                      ) : (
                        sessionStats.sessionHistory.slice(-10).reverse().map((session, index) => (
                          <div key={index} className="session-item">
                            <div className="session-header">
                              <div className="session-date">
                                {formatDate(session.start)}
                              </div>
                              <div className="session-duration">
                                {formatDuration(session.duration)}
                              </div>
                            </div>
                            <div className="session-metrics">
                              <div className="metric">
                                <span className="metric-value">{formatNumber(session.tokens)}</span>
                                <span className="metric-label">tokens</span>
                              </div>
                              <div className="metric">
                                <span className="metric-value">{formatNumber(session.userTurns)}</span>
                                <span className="metric-label">turns</span>
                              </div>
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

                  {/* Lifetime Statistics */}
                  <div className="session-section">
                    <h3>Lifetime Statistics</h3>
                    <div className="lifetime-stats">
                      <div className="stat-grid">
                        <div className="stat-item">
                          <div className="stat-value">{formatNumber(sessionStats.lifetimeStats.totalSessions)}</div>
                          <div className="stat-label">Total Sessions</div>
                        </div>
                        <div className="stat-item">
                          <div className="stat-value">{formatNumber(sessionStats.lifetimeStats.totalTokens)}</div>
                          <div className="stat-label">Total Tokens</div>
                        </div>
                        <div className="stat-item">
                          <div className="stat-value" title="Complete user question + Claude response pairs">
                            {formatNumber(sessionStats.lifetimeStats.totalUserTurns)}
                          </div>
                          <div className="stat-label">User Turns</div>
                        </div>
                      </div>
                      <div className="cost-breakdown">
                        <div className="cost-row">
                          <span>$ if Sonnet 4:</span>
                          <span className="cost-value">{formatCurrency(sessionStats.lifetimeStats.costs.sonnet4)}</span>
                        </div>
                        <div className="cost-row">
                          <span>$ if Opus 4:</span>
                          <span className="cost-value">{formatCurrency(sessionStats.lifetimeStats.costs.opus4)}</span>
                        </div>
                      </div>
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