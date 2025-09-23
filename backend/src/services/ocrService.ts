import Tesseract from 'tesseract.js';
import { validateImageQuality } from '../utils/imageUtils';

export interface OCRResult {
  text: string;
  confidence: number;
  processingTime: number;
}

export class OCRService {
  private static instance: OCRService;
  private worker: Tesseract.Worker | null = null;
  private isInitialized = false;

  static getInstance(): OCRService {
    if (!OCRService.instance) {
      OCRService.instance = new OCRService();
    }
    return OCRService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.worker = await Tesseract.createWorker('eng');
      
      await this.worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?()[]{}/@#$%^&*-+=|\\:;"\'<> ',
      });

      this.isInitialized = true;
      console.log('OCR Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OCR service:', error);
      throw new Error('OCR service initialization failed');
    }
  }

  async extractText(imageBuffer: Buffer, mimetype: string = 'image/jpeg'): Promise<OCRResult> {
    const startTime = Date.now();

    // Validate image quality first
    const validation = validateImageQuality(imageBuffer, mimetype);
    if (!validation.isValid) {
      throw new Error(validation.message || 'Invalid image');
    }

    if (!this.isInitialized || !this.worker) {
      await this.initialize();
    }

    try {
      const { data } = await this.worker!.recognize(imageBuffer);
      
      const processingTime = Date.now() - startTime;
      
      // Additional validation for extracted text
      const cleanText = data.text.trim();
      if (cleanText.length === 0) {
        throw new Error('No text could be extracted from the image');
      }
      
      if (data.confidence < 30) {
        console.warn(`Low confidence OCR result: ${data.confidence}%`);
      }
      
      return {
        text: cleanText,
        confidence: data.confidence,
        processingTime,
      };
    } catch (error) {
      console.error('OCR extraction failed:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to extract text from image');
    }
  }

  async preprocess(imageBuffer: Buffer): Promise<Buffer> {
    // Basic image preprocessing could be added here
    // For now, return the original buffer
    return imageBuffer;
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

export const ocrService = OCRService.getInstance();