import { io, Socket } from 'socket.io-client';


export interface WebSocketCallbacks {
  onOCRStarted: () => void;
  onOCRProgress: (data: { step: string; message: string; progress?: { current: number; total: number; percentage: number } }) => void;
  onOCRComplete: (data: { text: string; confidence: number; processingTime: number }) => void;
  onOCRError: (data: { error: string; step: string; processingTime: number }) => void;
  
  onTranslationStarted: () => void;
  onTranslationProgress: (data: { step: string; message: string; progress?: { current: number; total: number; percentage: number } }) => void;
  onTranslationComplete: (data: { translatedMenu: any[]; sourceLanguage: string; targetLanguage: string; processingTime: number }) => void;
  onTranslationError: (data: { error: string; step: string; processingTime: number }) => void;
  
  onImageGenerationStarted: () => void;
  onImageGenerationProgress: (data: { step: string; message: string; progress?: { current: number; total: number; percentage: number } }) => void;
  onImageGenerated: (data: { imageUrl: string; itemName: string; processingTime: number; progress?: { current: number; total: number; percentage: number }; fallback?: boolean; error?: string }) => void;
  onImageGenerationError: (data: { error: string; step: string; processingTime: number }) => void;
  
  onProcessingComplete: (data: { success: boolean; totalProcessingTime: number; summary: any }) => void;
  onProcessingError: (data: { error: string; step: string; processingTime: number }) => void;
  
  onConnectionStatus: (connected: boolean) => void;
}

class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private callbacks: Partial<WebSocketCallbacks> = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  connect(callbacks: Partial<WebSocketCallbacks>): void {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    this.callbacks = callbacks;
    
    // Connect to backend WebSocket server
    this.socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server:', this.socket?.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.callbacks.onConnectionStatus?.(true);
      
      // Join a room with the socket ID for targeted messaging
      this.socket?.emit('join_room', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from WebSocket server:', reason);
      this.isConnected = false;
      this.callbacks.onConnectionStatus?.(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.callbacks.onConnectionStatus?.(false);
      }
    });

    this.socket.on('room_joined', (data) => {
      console.log('Joined room:', data);
    });

    // OCR Events
    this.socket.on('ocr_started', () => {
      console.log('OCR started');
      this.callbacks.onOCRStarted?.();
    });

    this.socket.on('ocr_progress', (data) => {
      console.log('OCR progress:', data);
      this.callbacks.onOCRProgress?.(data);
    });

    this.socket.on('ocr_complete', (data) => {
      console.log('OCR completed:', data);
      this.callbacks.onOCRComplete?.(data);
    });

    this.socket.on('ocr_error', (data) => {
      console.error('OCR error:', data);
      this.callbacks.onOCRError?.(data);
    });

    // Translation Events
    this.socket.on('translation_started', () => {
      console.log('Translation started');
      this.callbacks.onTranslationStarted?.();
    });

    this.socket.on('translation_progress', (data) => {
      console.log('Translation progress:', data);
      this.callbacks.onTranslationProgress?.(data);
    });

    this.socket.on('translation_complete', (data) => {
      console.log('Translation completed:', data);
      this.callbacks.onTranslationComplete?.(data);
    });

    this.socket.on('translation_error', (data) => {
      console.error('Translation error:', data);
      this.callbacks.onTranslationError?.(data);
    });

    // Image Generation Events
    this.socket.on('image_generation_started', () => {
      console.log('Image generation started');
      this.callbacks.onImageGenerationStarted?.();
    });

    this.socket.on('image_generation_progress', (data) => {
      console.log('Image generation progress:', data);
      this.callbacks.onImageGenerationProgress?.(data);
    });

    this.socket.on('image_generated', (data) => {
      console.log('Image generated:', data);
      this.callbacks.onImageGenerated?.(data);
    });

    this.socket.on('image_generation_error', (data) => {
      console.error('Image generation error:', data);
      this.callbacks.onImageGenerationError?.(data);
    });

    // Processing Events
    this.socket.on('processing_complete', (data) => {
      console.log('Processing completed:', data);
      this.callbacks.onProcessingComplete?.(data);
    });

    this.socket.on('processing_error', (data) => {
      console.error('Processing error:', data);
      this.callbacks.onProcessingError?.(data);
    });
  }

  async uploadImage(imageFile: File | Blob, targetLanguage = 'English', generateImages = true): Promise<{ success: boolean; socketId?: string; message?: string; error?: string }> {
    if (!this.socket?.id) {
      throw new Error('WebSocket not connected');
    }

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('targetLanguage', targetLanguage);
    formData.append('generateImages', generateImages.toString());
    formData.append('socketId', this.socket.id);

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/translate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.socket) {
      console.log('Disconnecting from WebSocket server');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.callbacks.onConnectionStatus?.(false);
    }
  }

  getSocketId(): string | null {
    return this.socket?.id || null;
  }

  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  // Utility method to convert canvas to blob
  canvasToBlob(canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/jpeg', quality);
    });
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();