export interface MenuItem {
  name: string;
  originalName: string;
  description: string;
  price?: string;
  category?: string;
  imageUrl?: string;
}

export interface TranslationResponse {
  success: boolean;
  originalText: string;
  translatedMenu: MenuItem[];
  sourceLanguage?: string;
  targetLanguage: string;
  confidence?: number;
  processingTime: number;
  error?: string;
}

export interface TranslationRequest {
  targetLanguage?: string;
  generateImages?: boolean;
}