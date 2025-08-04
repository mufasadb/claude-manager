import React, { useState, useEffect, useCallback } from 'react';
import './HookEvents.css';

interface HookEvent {
  id: string;
  eventType: string;
  toolName?: string;
  projectPath?: string;
  timestamp: number;
  receivedAt: number;
  originalHookData?: any;
  context?: any;
}

interface HookEventResult {
  eventId: string;
  eventType: string;
  hooksExecuted: number;
  processingTime: number;
  timestamp: number;
}

interface HookExecution {
  eventId: string;
  hookName: string;
  success: boolean;
  timestamp: number;
}

interface HookError {
  eventId: string;
  hookName: string;
  message: string;
  timestamp: number;
}

const HookEvents: React.FC = () => {
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [results, setResults] = useState<HookEventResult[]>([]);
  const [executions, setExecutions] = useState<HookExecution[]>([]);
  const [errors, setErrors] = useState<HookError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [selectedEvent, setSelectedEvent] = useState<HookEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/hooks/events?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
      } else {
        setError('Failed to load hook events');
      }
    } catch (err) {
      setError('Error loading hook events');
      console.error('Error loading hook events:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Connect directly to backend WebSocket server on 3455
      const wsUrl = `${protocol}//localhost:3455`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('Hook Events WebSocket connected');
        setIsConnected(true);
      };

      ws.onclose = () => {
        console.log('Hook Events WebSocket disconnected');
        setIsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('Hook Events WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'hookEventReceived':
              setEvents(prev => {
                // Check for duplicate events by ID (most reliable)
                const isDuplicate = prev.some(existing => existing.id === data.event.id);
                
                if (isDuplicate) {
                  return prev; // Skip duplicate
                }
                
                return [data.event, ...prev.slice(0, limit - 1)];
              });
              break;
              
            case 'hookEventProcessed':
              setResults(prev => [data.result, ...prev.slice(0, 49)]);
              break;
              
            case 'hookExecuted':
              setExecutions(prev => [data.execution, ...prev.slice(0, 49)]);
              break;
              
            case 'hookError':
              setErrors(prev => [data.error, ...prev.slice(0, 49)]);
              break;
              
            default:
              // Ignore other message types
              break;
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      return ws;
    };

    const ws = connectWebSocket();
    return () => ws.close();
  }, []); // Remove limit dependency to prevent reconnections

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'PreToolUse': return '#3b82f6';
      case 'PostToolUse': return '#10b981';
      case 'UserPromptSubmit': return '#f59e0b';
      case 'Notification': return '#8b5cf6';
      case 'Stop': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getProjectName = (projectPath?: string) => {
    if (!projectPath) return 'Unknown';
    return projectPath.split('/').pop() || 'Unknown';
  };

  const clearEvents = () => {
    setEvents([]);
    setResults([]);
    setExecutions([]);
    setErrors([]);
  };

  if (loading) {
    return <div className="hook-events-loading">Loading hook events...</div>;
  }

  if (error) {
    return (
      <div className="hook-events-error">
        <p>Error: {error}</p>
        <button onClick={loadEvents}>Retry</button>
      </div>
    );
  }

  return (
    <div className="hook-events">
      <div className="hook-events-header">
        <div className="hook-events-title">
          <h3>Hook Events</h3>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Live' : '🔴 Offline'}
          </div>
        </div>
        <div className="hook-events-controls">
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={25}>25 events</option>
            <option value={50}>50 events</option>
            <option value={100}>100 events</option>
          </select>
          <button onClick={loadEvents} disabled={loading}>
            Refresh
          </button>
          <button onClick={clearEvents} className="clear-button">
            Clear
          </button>
        </div>
      </div>

      <div className="hook-events-stats">
        <div className="stat">
          <span className="stat-label">Events:</span>
          <span className="stat-value">{events.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Results:</span>
          <span className="stat-value">{results.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Executions:</span>
          <span className="stat-value">{executions.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Errors:</span>
          <span className="stat-value error-count">{errors.length}</span>
        </div>
      </div>

      <div className="hook-events-list">
        {events.length === 0 ? (
          <div className="no-events">
            <p>No hook events received yet.</p>
            <p>Set up hook forwarding in your Claude Code projects to see events here.</p>
          </div>
        ) : (
          events.map((event) => (
            <div 
              key={event.id} 
              className="hook-event"
              onClick={() => setSelectedEvent(event)}
            >
              <div className="event-header">
                <div className="event-type" style={{ color: getEventTypeColor(event.eventType) }}>
                  {event.eventType}
                </div>
                <div className="event-time">
                  {formatTimestamp(event.timestamp)}
                </div>
              </div>
              <div className="event-details">
                <div className="event-project">
                  📁 {getProjectName(event.projectPath)}
                </div>
                {event.toolName && (
                  <div className="event-tool">
                    🔧 {event.toolName}
                  </div>
                )}
              </div>
              {results.find(r => r.eventId === event.id) && (
                <div className="event-result">
                  ✅ {results.find(r => r.eventId === event.id)?.hooksExecuted} hooks executed
                </div>
              )}
              {errors.find(e => e.eventId === event.id) && (
                <div className="event-error">
                  ❌ Error: {errors.find(e => e.eventId === event.id)?.message}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedEvent && (
        <div className="event-modal" onClick={() => setSelectedEvent(null)}>
          <div className="event-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="event-modal-header">
              <h4>Hook Event Details</h4>
              <button onClick={() => setSelectedEvent(null)}>×</button>
            </div>
            <div className="event-modal-body">
              <div className="event-field">
                <strong>ID:</strong> {selectedEvent.id}
              </div>
              <div className="event-field">
                <strong>Event Type:</strong> {selectedEvent.eventType}
              </div>
              <div className="event-field">
                <strong>Tool Name:</strong> {selectedEvent.toolName || 'N/A'}
              </div>
              <div className="event-field">
                <strong>Project:</strong> {getProjectName(selectedEvent.projectPath)}
              </div>
              <div className="event-field">
                <strong>Project Path:</strong> {selectedEvent.projectPath || 'N/A'}
              </div>
              <div className="event-field">
                <strong>Timestamp:</strong> {new Date(selectedEvent.timestamp).toLocaleString()}
              </div>
              {selectedEvent.originalHookData && (
                <div className="event-field">
                  <strong>Original Hook Data:</strong>
                  <pre className="json-data">
                    {JSON.stringify(selectedEvent.originalHookData, null, 2)}
                  </pre>
                </div>
              )}
              {selectedEvent.context && (
                <div className="event-field">
                  <strong>Context:</strong>
                  <pre className="json-data">
                    {JSON.stringify(selectedEvent.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HookEvents;