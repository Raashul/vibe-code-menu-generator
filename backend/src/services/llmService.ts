import OpenAI from 'openai';
import { MenuItem } from '../types';

export interface LLMResult {
  translatedMenu: MenuItem[];
  sourceLanguage: string;
  targetLanguage: string;
  processingTime: number;
}

export class LLMService {
  private static instance: LLMService;
  private openai: OpenAI | null = null;
  private isInitialized = false;

  static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    try {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });

      // Test the connection
      await this.openai.models.list();
      
      this.isInitialized = true;
      console.log('LLM Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize LLM service:', error);
      throw new Error('LLM service initialization failed');
    }
  }

  private generatePrompt(extractedText: string, targetLanguage: string): string {
    return `You are a professional menu translator and food expert. Your task is to parse and translate a restaurant menu from OCR-extracted text.

INPUT TEXT (from OCR):
${extractedText}

INSTRUCTIONS:
1. Parse the text to identify individual menu items
2. For each item, extract: name, description, price, and category
3. Translate all text to ${targetLanguage}
4. Maintain original formatting and pricing
5. Categorize items appropriately (Appetizers, Main Courses, Desserts, Beverages, etc.)
6. If price is unclear, omit it rather than guessing
7. Provide clear, appetizing descriptions

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "sourceLanguage": "detected_language",
  "items": [
    {
      "name": "translated_name",
      "originalName": "original_name", 
      "description": "translated_description",
      "price": "original_price_if_available",
      "category": "appropriate_category"
    }
  ]
}

IMPORTANT:
- Only return valid JSON, no additional text
- If you cannot identify any menu items, return {"sourceLanguage": "unknown", "items": []}
- Ensure all strings are properly escaped for JSON
- Categories should be: "Appetizers", "Main Courses", "Desserts", "Beverages", "Sides", "Specials", or "Other"`;
  }

  async translateMenu(extractedText: string, targetLanguage: string = 'English'): Promise<LLMResult> {
    const startTime = Date.now();

    if (!this.isInitialized || !this.openai) {
      await this.initialize();
    }

    try {
      const prompt = this.generatePrompt(extractedText, targetLanguage);
      
      const completion = await this.openai!.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional menu translator. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from LLM service');
      }

      const parsedResponse = this.parseResponse(response);
      const processingTime = Date.now() - startTime;

      return {
        translatedMenu: parsedResponse.items,
        sourceLanguage: parsedResponse.sourceLanguage,
        targetLanguage,
        processingTime,
      };
    } catch (error) {
      console.error('LLM translation failed:', error);
      throw new Error(`Failed to translate menu: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseResponse(response: string): { sourceLanguage: string; items: MenuItem[] } {
    try {
      // Clean the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid response format: missing items array');
      }

      // Validate and clean menu items
      const validItems: MenuItem[] = parsed.items
        .filter((item: any) => item.name && item.originalName)
        .map((item: any) => ({
          name: String(item.name).trim(),
          originalName: String(item.originalName).trim(),
          description: item.description ? String(item.description).trim() : '',
          price: item.price ? String(item.price).trim() : undefined,
          category: item.category ? String(item.category).trim() : 'Other',
        }));

      return {
        sourceLanguage: parsed.sourceLanguage || 'unknown',
        items: validItems,
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      throw new Error('Failed to parse translation response');
    }
  }

  async retryTranslation(extractedText: string, targetLanguage: string, maxRetries: number = 3): Promise<LLMResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Translation attempt ${attempt}/${maxRetries}`);
        return await this.translateMenu(extractedText, targetLanguage);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`Translation attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All translation attempts failed');
  }
}

export const llmService = LLMService.getInstance();