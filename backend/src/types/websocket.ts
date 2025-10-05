import { MenuItem } from '../types';

export interface WebSocketEvents {
  // Client to Server
  join_room: (socketId: string) => void;
  
  // Server to Client
  // OCR Events
  ocr_started: () => void;
  ocr_progress: (data: SubStepProgressData) => void;
  ocr_complete: (data: OCRCompleteData) => void;
  ocr_error: (data: ErrorData) => void;
  
  // Translation Events
  translation_started: () => void;
  translation_progress: (data: SubStepProgressData) => void;
  translation_complete: (data: TranslationCompleteData) => void;
  translation_error: (data: ErrorData) => void;
  
  // Image Generation Events
  image_generation_started: () => void;
  image_generation_progress: (data: SubStepProgressData) => void;
  image_generated: (data: ImageGeneratedData) => void;
  image_generation_error: (data: ErrorData) => void;
  
  // Overall Processing Events
  processing_complete: (data: ProcessingCompleteData) => void;
  processing_error: (data: ErrorData) => void;
}

export interface SubStepProgressData {
  step: string;
  message: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
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