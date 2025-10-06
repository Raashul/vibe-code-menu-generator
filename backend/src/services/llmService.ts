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

  private generatePrompt(
    extractedText: string,
    targetLanguage: string
  ): string {
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

CRITICAL JSON FORMATTING RULES:
- Use double quotes for all strings
- Escape any quotes inside strings with \\"
- Do not include trailing commas
- Ensure proper comma separation between array elements
- Do not include any text outside the JSON object

RESPONSE FORMAT:
Return ONLY a valid JSON object with this exact structure:
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
- ONLY return valid JSON, absolutely no additional text or explanations
- If you cannot identify any menu items, return {"sourceLanguage": "unknown", "items": []}
- Ensure all strings are properly escaped for JSON
- Categories must be one of: "Appetizers", "Main Courses", "Desserts", "Beverages", "Sides", "Specials", or "Other"
- Do not include markdown code blocks or formatting`;
  }

  async translateMenu(
    extractedText: string,
    targetLanguage: string = 'English'
  ): Promise<LLMResult> {
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
            content:
              'You are a professional menu translator. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
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
      throw new Error(
        `Failed to translate menu: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private parseResponse(response: string): {
    sourceLanguage: string;
    items: MenuItem[];
  } {
    try {
      // Log the raw response for debugging
      console.log('Raw LLM response length:', response.length);
      console.log('Raw LLM response preview:', response.substring(0, 1000) + '...');

      // Clean the response - remove any markdown code blocks or extra text
      let cleanResponse = response.trim();

      // Remove markdown code blocks if present
      cleanResponse = cleanResponse
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '');

      // Find the JSON object - look for the first { and last }
      const firstBrace = cleanResponse.indexOf('{');
      const lastBrace = cleanResponse.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
        throw new Error('No valid JSON object found in response');
      }

      const jsonString = cleanResponse.substring(firstBrace, lastBrace + 1);
      console.log('Extracted JSON length:', jsonString.length);

      // Try multiple approaches to parse the JSON
      let parsed: any;
      let parseError: Error | null = null;

      // Attempt 1: Try with common fixes
      try {
        let fixedJson = this.fixCommonJsonIssues(jsonString);
        parsed = JSON.parse(fixedJson);
      } catch (error) {
        parseError = error as Error;
        console.log(
          'First parse attempt failed, trying more aggressive cleaning...'
        );

        // Attempt 2: More aggressive cleaning
        try {
          let aggressiveClean = this.aggressiveJsonClean(jsonString);
          parsed = JSON.parse(aggressiveClean);
        } catch (error2) {
          console.log(
            'Second parse attempt failed, trying manual reconstruction...'
          );

          // Attempt 3: Try to manually extract and reconstruct
          try {
            parsed = this.manualJsonReconstruction(jsonString);
          } catch (error3) {
            // Attempt 4: Last resort - create a simple fallback structure
            console.log('Manual reconstruction failed, creating basic fallback...');
            parsed = {
              sourceLanguage: 'English',
              items: [{
                name: 'Menu Items Detected',
                originalName: 'Menu Items Detected',
                description: 'Unable to parse individual items due to formatting issues. Please try uploading the image again.',
                price: undefined,
                category: 'Other'
              }]
            };
          }
        }
      }

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
      console.error('Raw response for debugging:', response);
      throw new Error(
        `Failed to parse translation response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private fixCommonJsonIssues(jsonString: string): string {
    let fixed = jsonString;

    // Remove or escape control characters (0x00-0x1F except whitespace)
    fixed = fixed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Fix unescaped newlines and tabs in strings
    fixed = fixed.replace(/(?<!\\)\n/g, '\\n');
    fixed = fixed.replace(/(?<!\\)\r/g, '\\r');
    fixed = fixed.replace(/(?<!\\)\t/g, '\\t');

    // Fix unescaped backslashes
    fixed = fixed.replace(/(?<!\\)\\(?!["\\/bfnrt])/g, '\\\\');

    // Fix trailing commas in arrays and objects
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // Fix unescaped quotes in string values (but not in keys)
    fixed = fixed.replace(/"([^"]*?)"/g, (match, content) => {
      // Only escape if this appears to be a string value, not a key
      if (content.includes('"')) {
        const escaped = content.replace(/"/g, '\\"');
        return `"${escaped}"`;
      }
      return match;
    });

    // Fix missing commas between array elements
    fixed = fixed.replace(/}(\s*){/g, '},$1{');

    return fixed;
  }

  private aggressiveJsonClean(jsonString: string): string {
    let cleaned = jsonString;

    // Remove all control characters
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');

    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Try to fix broken string values by ensuring they're properly quoted
    cleaned = cleaned.replace(/:\s*([^",{\[\]\s]+)(?=\s*[,}])/g, ': "$1"');

    // Fix common quote issues
    cleaned = cleaned.replace(/'/g, '"');

    return cleaned;
  }

  private manualJsonReconstruction(jsonString: string): any {
    // Last resort: try to extract the essential information manually
    console.log('Attempting manual JSON reconstruction...');

    const result: { sourceLanguage: string; items: MenuItem[] } = {
      sourceLanguage: 'English',
      items: [],
    };

    // Try to extract sourceLanguage
    const langMatch = jsonString.match(/"sourceLanguage"\s*:\s*"([^"]+)"/);
    if (langMatch) {
      result.sourceLanguage = langMatch[1];
    }

    // Try to extract individual menu items using pattern matching
    try {
      // Look for item patterns like: "name": "...", "originalName": "...", "description": "...", "price": "..."
      const itemPatterns = jsonString.match(/\{[^}]*"name"\s*:[^}]*\}/g);
      
      if (itemPatterns) {
        result.items = itemPatterns.map((itemStr: string, index: number) => {
          const nameMatch = itemStr.match(/"name"\s*:\s*"([^"]+)"/);
          const originalNameMatch = itemStr.match(/"originalName"\s*:\s*"([^"]+)"/);
          const descriptionMatch = itemStr.match(/"description"\s*:\s*"([^"]+)"/);
          const priceMatch = itemStr.match(/"price"\s*:\s*"([^"]+)"/);
          const categoryMatch = itemStr.match(/"category"\s*:\s*"([^"]+)"/);

          return {
            name: nameMatch ? nameMatch[1] : `Item ${index + 1}`,
            originalName: originalNameMatch ? originalNameMatch[1] : `Item ${index + 1}`,
            description: descriptionMatch ? descriptionMatch[1] : '',
            price: priceMatch ? priceMatch[1] : undefined,
            category: categoryMatch ? categoryMatch[1] : 'Other'
          };
        }).filter((item: any) => item.name && item.originalName);
      }
    } catch (error) {
      console.warn('Pattern matching failed in manual reconstruction:', error);
    }

    console.log(`Manual reconstruction extracted ${result.items.length} items`);
    return result;
  }

  async retryTranslation(
    extractedText: string,
    targetLanguage: string,
    maxRetries: number = 3
  ): Promise<LLMResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Translation attempt ${attempt}/${maxRetries}`);
        return await this.translateMenu(extractedText, targetLanguage);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(
          `Translation attempt ${attempt} failed:`,
          lastError.message
        );

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All translation attempts failed');
  }
}

export const llmService = LLMService.getInstance();
