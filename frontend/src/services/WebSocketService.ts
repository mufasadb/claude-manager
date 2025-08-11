type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

type MessageHandler = (data: WebSocketMessage) => void;
type ConnectionHandler = (status: ConnectionStatus) => void;

export class WebSocketService {
  private static ws: WebSocket | null = null;
  private static messageHandlers: MessageHandler[] = [];
  private static connectionHandlers: ConnectionHandler[] = [];
  private static reconnectAttempts = 0;
  private static maxReconnectAttempts = 5;
  private static reconnectInterval = 3000;

  static connect(onMessage: MessageHandler): void {
    const wsUrl = `ws://localhost:3455/ws`;

    this.messageHandlers.push(onMessage);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateConnectionStatus('connecting');
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.updateConnectionStatus('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.messageHandlers.forEach(handler => handler(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.updateConnectionStatus('disconnected');
        
        // Attempt to reconnect if not a clean close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++;
            console.log(`Reconnection attempt ${this.reconnectAttempts}`);
            this.connect(onMessage);
          }, this.reconnectInterval);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus('disconnected');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.updateConnectionStatus('disconnected');
    }
  }

  static disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.reconnectAttempts = 0;
  }

  static onConnectionChange(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  static send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected. Cannot send data:', data);
    }
  }

  private static updateConnectionStatus(status: ConnectionStatus): void {
    this.connectionHandlers.forEach(handler => handler(status));
  }

  static getConnectionStatus(): ConnectionStatus {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
      default:
        return 'disconnected';
    }
  }
}