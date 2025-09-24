import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { 
  WebSocketEvents, 
  OCRCompleteData, 
  TranslationCompleteData, 
  ImageGeneratedData, 
  ProcessingCompleteData, 
  ErrorData 
} from '../types/websocket';

export class WebSocketService {
  private static instance: WebSocketService;
  private io: Server | null = null;
  private isInitialized = false;

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  initialize(httpServer: HttpServer): void {
    if (this.isInitialized) return;

    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.isInitialized = true;
    console.log('WebSocket service initialized successfully');
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('join_room', (roomId: string) => {
        socket.join(roomId);
        console.log(`Client ${socket.id} joined room: ${roomId}`);
        
        // Send confirmation that client joined the room
        socket.emit('room_joined', { roomId, timestamp: new Date().toISOString() });
      });

      socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
      });

      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
        socket.emit('connection_error', { error: error.message });
      });

      // Handle reconnection attempts
      socket.on('reconnect', (attemptNumber) => {
        console.log(`Client ${socket.id} reconnected after ${attemptNumber} attempts`);
      });

      socket.on('reconnect_error', (error) => {
        console.error(`Reconnection failed for ${socket.id}:`, error);
      });

      // Ping/Pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });

    // Handle server-level connection errors
    this.io.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });
  }

  // OCR Events
  emitOCRStarted(socketId: string): void {
    this.io?.to(socketId).emit('ocr_started');
  }

  emitOCRComplete(socketId: string, data: OCRCompleteData): void {
    this.io?.to(socketId).emit('ocr_complete', data);
  }

  emitOCRError(socketId: string, data: ErrorData): void {
    this.io?.to(socketId).emit('ocr_error', data);
  }

  // Translation Events
  emitTranslationStarted(socketId: string): void {
    this.io?.to(socketId).emit('translation_started');
  }

  emitTranslationComplete(socketId: string, data: TranslationCompleteData): void {
    this.io?.to(socketId).emit('translation_complete', data);
  }

  emitTranslationError(socketId: string, data: ErrorData): void {
    this.io?.to(socketId).emit('translation_error', data);
  }

  // Image Generation Events
  emitImageGenerationStarted(socketId: string): void {
    this.io?.to(socketId).emit('image_generation_started');
  }

  emitImageGenerated(socketId: string, data: ImageGeneratedData): void {
    this.io?.to(socketId).emit('image_generated', data);
  }

  emitImageGenerationError(socketId: string, data: ErrorData): void {
    this.io?.to(socketId).emit('image_generation_error', data);
  }

  // Processing Events
  emitProcessingComplete(socketId: string, data: ProcessingCompleteData): void {
    this.io?.to(socketId).emit('processing_complete', data);
  }

  emitProcessingError(socketId: string, data: ErrorData): void {
    this.io?.to(socketId).emit('processing_error', data);
  }

  // Utility Methods
  getConnectedClients(): number {
    return this.io?.engine.clientsCount || 0;
  }

  isClientConnected(socketId: string): boolean {
    return this.io?.sockets.adapter.rooms.has(socketId) || false;
  }

  disconnectClient(socketId: string): void {
    const socket = this.io?.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(true);
    }
  }
}

export const websocketService = WebSocketService.getInstance();