import crypto from 'crypto';
import { createClient, RedisClientType } from 'redis';

export interface CachedImage {
  imageUrl: string;
  generatedAt: Date;
  itemName: string;
  description: string;
}

export class ImageCacheService {
  private static instance: ImageCacheService;
  private memoryCache = new Map<string, CachedImage>();
  private redisClient: RedisClientType | null = null;
  private isRedisConnected = false;
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly REDIS_EXPIRE_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

  static getInstance(): ImageCacheService {
    if (!ImageCacheService.instance) {
      ImageCacheService.instance = new ImageCacheService();
    }
    return ImageCacheService.instance;
  }

  async initialize(): Promise<void> {
    if (this.redisClient) return;

    try {
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
        }
      });

      this.redisClient.on('error', (error) => {
        console.warn('Redis error:', error.message);
        this.isRedisConnected = false;
      });

      this.redisClient.on('connect', () => {
        console.log('Redis connected successfully');
        this.isRedisConnected = true;
      });

      this.redisClient.on('disconnect', () => {
        console.log('Redis disconnected');
        this.isRedisConnected = false;
      });

      await this.redisClient.connect();
      console.log('Image Cache Service with Redis initialized');
    } catch (error) {
      console.warn('Failed to connect to Redis, falling back to memory cache:', error);
      this.isRedisConnected = false;
    }
  }

  private generateCacheKey(name: string, description: string = ''): string {
    // Use only the food name for consistent cache keys
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')        // Normalize whitespace
      .trim();
    
    return 'img:' + crypto.createHash('md5').update(normalized).digest('hex');
  }

  async getCachedImage(itemName: string, description: string = ''): Promise<CachedImage | null> {
    const cacheKey = this.generateCacheKey(itemName);

    // Try Redis first
    if (this.isRedisConnected && this.redisClient) {
      try {
        const cachedData = await this.redisClient.get(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData) as CachedImage;
          parsed.generatedAt = new Date(parsed.generatedAt); // Parse date
          
          // Validate URL is still accessible (for DALL-E URLs that expire)
          if (await this.validateImageUrl(parsed.imageUrl)) {
            console.log(`Redis cache HIT for: ${itemName}`);
            // Also update memory cache for faster access
            this.memoryCache.set(cacheKey, parsed);
            return parsed;
          } else {
            console.log(`Redis cache EXPIRED URL for: ${itemName}, removing from cache`);
            // Remove expired URL from cache
            await this.redisClient.del(cacheKey);
            this.memoryCache.delete(cacheKey);
            return null;
          }
        }
      } catch (error) {
        console.warn('Redis get error:', error);
      }
    }

    // Fallback to memory cache
    const memoryCache = this.memoryCache.get(cacheKey);
    if (memoryCache) {
      // Check if cache is expired
      const isExpired = Date.now() - memoryCache.generatedAt.getTime() > this.CACHE_DURATION;
      if (isExpired) {
        this.memoryCache.delete(cacheKey);
        return null;
      }
      
      // Validate URL is still accessible
      if (await this.validateImageUrl(memoryCache.imageUrl)) {
        console.log(`Memory cache HIT for: ${itemName}`);
        return memoryCache;
      } else {
        console.log(`Memory cache EXPIRED URL for: ${itemName}, removing from cache`);
        this.memoryCache.delete(cacheKey);
        return null;
      }
    }

    return null;
  }

  private async validateImageUrl(url: string): Promise<boolean> {
    try {
      // Skip validation for known permanent URLs (Unsplash, placeholders, etc.)
      if (url.includes('unsplash.com') || url.includes('placeholder.com') || url.includes('via.placeholder.com')) {
        return true;
      }
      
      // For DALL-E URLs, do a lightweight HEAD request to check if they're still valid
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn(`URL validation failed for ${url}:`, error);
      return false;
    }
  }

  async setCachedImage(itemName: string, description: string, imageUrl: string): Promise<void> {
    const cacheKey = this.generateCacheKey(itemName);
    const cacheData: CachedImage = {
      imageUrl,
      generatedAt: new Date(),
      itemName,
      description,
    };

    // Store in Redis with expiration
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.setEx(
          cacheKey, 
          this.REDIS_EXPIRE_SECONDS, 
          JSON.stringify(cacheData)
        );
        console.log(`Redis cached image for: ${itemName}`);
      } catch (error) {
        console.warn('Redis set error:', error);
      }
    }

    // Also store in memory cache as backup
    this.memoryCache.set(cacheKey, cacheData);
    console.log(`Memory cached image for: ${itemName}`);
  }

  async getCacheStats(): Promise<{ redis: any; memory: any }> {
    let redisStats = null;
    
    if (this.isRedisConnected && this.redisClient) {
      try {
        const info = await this.redisClient.info('memory');
        const keyCount = await this.redisClient.dbSize();
        redisStats = {
          connected: true,
          keyCount,
          memoryUsage: info,
        };
      } catch (error) {
        redisStats = { connected: false, error: error };
      }
    } else {
      redisStats = { connected: false };
    }

    return {
      redis: redisStats,
      memory: {
        size: this.memoryCache.size,
        hitRate: 0.85 // Mock hit rate - in production, track this
      }
    };
  }

  async clearExpiredCache(): Promise<void> {
    // Clear expired memory cache
    const now = Date.now();
    for (const [key, cached] of this.memoryCache.entries()) {
      if (now - cached.generatedAt.getTime() > this.CACHE_DURATION) {
        this.memoryCache.delete(key);
      }
    }

    // Redis handles expiration automatically via TTL
    console.log('Expired cache entries cleared from memory');
  }

  // Semantic matching for common foods
  private commonFoodImages = new Map([
    // Specific chicken dishes
    ['chili chicken', 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400'],
    ['chicken 65', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400'],
    ['chicken choila', 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400'],
    ['chicken tikka', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400'],
    ['chicken curry', 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400'],
    ['chicken biryani', 'https://images.unsplash.com/photo-1563379091339-03246963d96c?w=400'],
    ['chicken wings', 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400'],
    ['butter chicken', 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400'],
    
    // Sushi items
    ['naruto roll', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'],
    ['california roll', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'],
    ['salmon roll', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'],
    ['tuna roll', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'],
    ['sushi roll', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'],
    ['sushi', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'],
    ['roll', 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'],
    
    // Burgers
    ['chicken burger', 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400'],
    ['beef burger', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'],
    ['veggie burger', 'https://images.unsplash.com/photo-1525059696034-4967a729002e?w=400'],
    ['beyond burger', 'https://images.unsplash.com/photo-1525059696034-4967a729002e?w=400'],
    ['salmon burger', 'https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=400'],
    ['fish burger', 'https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=400'],
    ['burger', 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400'],
    
    // General foods (as last resort)
    ['chicken', 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400'],
    ['beef', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'],
    ['pasta', 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400'],
    ['pizza', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400'],
    ['salad', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'],
    ['soup', 'https://images.unsplash.com/photo-1547592180-85f173990554?w=400'],
    ['fish', 'https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=400'],
    ['dessert', 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400'],
    ['drink', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400']
  ]);

  getFallbackImage(itemName: string): string | null {
    const normalizedName = itemName.toLowerCase();
    
    // Sort keywords by length (descending) to prioritize more specific matches
    const sortedKeywords = Array.from(this.commonFoodImages.keys())
      .sort((a, b) => b.length - a.length);
    
    // Check for keyword matches, starting with most specific
    for (const keyword of sortedKeywords) {
      if (normalizedName.includes(keyword)) {
        const imageUrl = this.commonFoodImages.get(keyword);
        console.log(`Using fallback image for ${itemName} (matched: ${keyword})`);
        return imageUrl!;
      }
    }

    return null;
  }

  async disconnect(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.disconnect();
        console.log('Redis disconnected gracefully');
      } catch (error) {
        console.warn('Error disconnecting Redis:', error);
      }
    }
  }
}

export const imageCacheService = ImageCacheService.getInstance();