import { MenuItem } from '../types';

export interface WebSocketEvents {
  // Client to Server
  join_room: (socketId: string) => void;
  
  // Server to Client
  ocr_started: () => void;
  ocr_complete: (data: OCRCompleteData) => void;
  ocr_error: (data: ErrorData) => void;
  
  translation_started: () => void;
  translation_complete: (data: TranslationCompleteData) => void;
  translation_error: (data: ErrorData) => void;
  
  image_generation_started: () => void;
  image_generated: (data: ImageGeneratedData) => void;
  image_generation_error: (data: ErrorData) => void;
  
  processing_complete: (data: ProcessingCompleteData) => void;
  processing_error: (data: ErrorData) => void;
}

export interface OCRCompleteData {
  text: string;
  confidence: number;
  processingTime: number;
}

export interface TranslationCompleteData {
  translatedMenu: MenuItem[];
  sourceLanguage: string;
  targetLanguage: string;
  processingTime: number;
}

export interface ImageGeneratedData {
  imageUrl: string;
  itemName: string;
  processingTime: number;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  fallback?: boolean;
  error?: string;
}

export interface ProcessingCompleteData {
  success: boolean;
  totalProcessingTime: number;
  summary: {
    ocrTime: number;
    translationTime: number;
    imageGenTime: number;
    itemCount: number;
  };
}

export interface ErrorData {
  error: string;
  step: 'ocr' | 'translation' | 'image_generation' | 'general';
  processingTime: number;
}