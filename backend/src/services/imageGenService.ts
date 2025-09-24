import OpenAI from 'openai';
import { MenuItem } from '../types';
import { imageCacheService } from './imageCacheService';

export interface ImageGenResult {
  imageUrl: string;
  itemName: string;
  processingTime: number;
}

export interface BatchImageGenResult {
  results: ImageGenResult[];
  totalProcessingTime: number;
  successCount: number;
  failureCount: number;
}

export class ImageGenService {
  private static instance: ImageGenService;
  private openai: OpenAI | null = null;
  private isInitialized = false;

  static getInstance(): ImageGenService {
    if (!ImageGenService.instance) {
      ImageGenService.instance = new ImageGenService();
    }
    return ImageGenService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is required for image generation'
      );
    }

    try {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });

      this.isInitialized = true;
      console.log('Image Generation Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Image Generation service:', error);
      throw new Error('Image Generation service initialization failed');
    }
  }

  private generateFoodPrompt(menuItem: MenuItem): string {
    const { name, description, category } = menuItem;

    // Create a detailed, appetizing prompt for DALL-E
    let prompt = `A high-quality, professional food photography image of ${name}`;

    if (description) {
      prompt += `. ${description}`;
    }

    // Add category-specific styling
    const categoryStyles: Record<string, string> = {
      Appetizers: 'elegantly plated as an appetizer on a small plate',
      'Main Courses':
        'beautifully presented as a main course on a dinner plate',
      Desserts: 'artistically plated as a dessert with elegant presentation',
      Beverages: 'in an appropriate glass with garnish and ice if needed',
      Sides: 'served as a side dish in an appropriate bowl or plate',
      Specials: "presented as a chef's special with premium plating",
    };

    const style =
      categoryStyles[category || 'Other'] || 'professionally plated';
    prompt += `, ${style}`;

    // Add universal styling elements
    prompt +=
      '. Restaurant quality, appetizing, well-lit, clean background, professional food photography, vibrant colors, high detail, 4K quality';

    return prompt;
  }

  async generateFoodImage(menuItem: MenuItem): Promise<ImageGenResult> {
    const startTime = Date.now();

    // Check cache first
    const cachedImage = await imageCacheService.getCachedImage(
      menuItem.name,
      menuItem.description || ''
    );
    if (cachedImage) {
      console.log(`Using cached image for: ${menuItem.name}`);
      return {
        imageUrl: cachedImage.imageUrl,
        itemName: menuItem.name,
        processingTime: Date.now() - startTime,
      };
    }
    console.log(`No cached image found for: ${menuItem.name}`);

    // Try fallback image for common foods
    const fallbackImage = imageCacheService.getFallbackImage(menuItem.name);
    if (fallbackImage) {
      return {
        imageUrl: fallbackImage,
        itemName: menuItem.name,
        processingTime: Date.now() - startTime,
      };
    }

    if (!this.isInitialized || !this.openai) {
      await this.initialize();
    }

    try {
      const prompt = this.generateFoodPrompt(menuItem);

      console.log(`Generating new DALL-E image for: ${menuItem.name}`);

      const response = await this.openai!.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        style: 'natural',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No image data returned from DALL-E');
      }

      const imageUrl = response.data[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL returned from DALL-E');
      }

      // Cache the generated image
      await imageCacheService.setCachedImage(
        menuItem.name,
        menuItem.description || '',
        imageUrl
      );

      const processingTime = Date.now() - startTime;

      return {
        imageUrl,
        itemName: menuItem.name,
        processingTime,
      };
    } catch (error) {
      console.error(`Failed to generate image for ${menuItem.name}:`, error);
      throw new Error(
        `Image generation failed for ${menuItem.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async generateBatchImages(
    menuItems: MenuItem[],
    maxConcurrent: number = 3
  ): Promise<BatchImageGenResult> {
    const startTime = Date.now();
    const results: ImageGenResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process items in batches to avoid rate limits
    for (let i = 0; i < menuItems.length; i += maxConcurrent) {
      const batch = menuItems.slice(i, i + maxConcurrent);

      const batchPromises = batch.map(async (item) => {
        try {
          const result = await this.generateFoodImage(item);
          successCount++;
          return result;
        } catch (error) {
          console.error(`Failed to generate image for ${item.name}:`, error);
          failureCount++;
          // Return a fallback result
          return {
            imageUrl: this.getFallbackImageUrl(item),
            itemName: item.name,
            processingTime: 0,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + maxConcurrent < menuItems.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const totalProcessingTime = Date.now() - startTime;

    return {
      results,
      totalProcessingTime,
      successCount,
      failureCount,
    };
  }

  private getFallbackImageUrl(menuItem: MenuItem): string {
    // Generate a placeholder image URL with the item name
    const encodedName = encodeURIComponent(menuItem.name);
    return `https://via.placeholder.com/400x400/f0f0f0/333333?text=${encodedName}`;
  }

  async generateWithFallback(
    menuItem: MenuItem,
    maxRetries: number = 2
  ): Promise<ImageGenResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `Image generation attempt ${attempt}/${maxRetries} for: ${menuItem.name}`
        );
        return await this.generateFoodImage(menuItem);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(
          `Image generation attempt ${attempt} failed for ${menuItem.name}:`,
          lastError.message
        );

        if (attempt < maxRetries) {
          // Wait before retrying
          const delay = attempt * 2000; // 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Return fallback image if all attempts fail
    console.log(`Using fallback image for: ${menuItem.name}`);
    return {
      imageUrl: this.getFallbackImageUrl(menuItem),
      itemName: menuItem.name,
      processingTime: 0,
    };
  }

  async validateImageUrl(url: string): Promise<boolean> {
    try {
      // Simple validation - check if URL is accessible
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.error('Image URL validation failed:', error);
      return false;
    }
  }

  getOptimizedImageUrl(
    originalUrl: string,
    size: '256x256' | '512x512' | '1024x1024' = '512x512'
  ): string {
    // For DALL-E images, we get them at 1024x1024 by default
    // In a production app, you might want to resize them or use a CDN
    // For now, return the original URL
    return originalUrl;
  }
}

export const imageGenService = ImageGenService.getInstance();
