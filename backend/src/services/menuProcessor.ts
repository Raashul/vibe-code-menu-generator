import { ocrService } from './ocrService';
import { llmService } from './llmService';
import { imageGenService } from './imageGenService';
import { websocketService } from './websocketService';

export interface ProcessMenuRequest {
  imageBuffer: Buffer;
  mimetype: string;
  targetLanguage: string;
  generateImages: boolean;
  socketId: string;
}

export class MenuProcessor {
  static async processMenuAsync(request: ProcessMenuRequest): Promise<void> {
    const { imageBuffer, mimetype, targetLanguage, generateImages, socketId } = request;
    const startTime = Date.now();
    let ocrTime = 0;
    let translationTime = 0;
    let imageGenTime = 0;

    try {
      // Step 1: OCR Processing
      websocketService.emitOCRStarted(socketId);
      const ocrStartTime = Date.now();
      
      try {
        // Sub-step: Reading image
        websocketService.emitOCRProgress(socketId, {
          step: 'reading_image',
          message: '📖 Reading menu image...'
        });
        
        const ocrResult = await ocrService.extractText(imageBuffer, mimetype);
        ocrTime = Date.now() - ocrStartTime;
        
        websocketService.emitOCRComplete(socketId, {
          text: ocrResult.text,
          confidence: ocrResult.confidence,
          processingTime: ocrTime,
        });

        // Check if we got readable text
        if (!ocrResult.text || ocrResult.text.length < 10) {
          throw new Error('Unable to extract readable text from image');
        }

        // Step 2: LLM Translation
        websocketService.emitTranslationStarted(socketId);
        const translationStartTime = Date.now();
        
        try {
          // Sub-step: Analyzing menu structure
          websocketService.emitTranslationProgress(socketId, {
            step: 'analyzing_menu',
            message: '🤖 Analyzing menu structure...'
          });
          
          // Sub-step: Translating content
          websocketService.emitTranslationProgress(socketId, {
            step: 'translating_content',
            message: '🌍 Translating menu items...'
          });
          
          const llmResult = await llmService.retryTranslation(ocrResult.text, targetLanguage);
          translationTime = Date.now() - translationStartTime;
          
          websocketService.emitTranslationComplete(socketId, {
            translatedMenu: llmResult.translatedMenu,
            sourceLanguage: llmResult.sourceLanguage,
            targetLanguage: llmResult.targetLanguage,
            processingTime: translationTime,
          });

          // Step 3: Image Generation (if requested)
          if (generateImages && llmResult.translatedMenu.length > 0) {
            websocketService.emitImageGenerationStarted(socketId);
            const imageGenStartTime = Date.now();
            
            // Sub-step: Preparing image generation
            websocketService.emitImageGenerationProgress(socketId, {
              step: 'preparing_generation',
              message: '🎨 Preparing to generate images...',
              progress: {
                current: 0,
                total: llmResult.translatedMenu.length,
                percentage: 0
              }
            });
            
            try {
              console.log(`Generating individual images for ${llmResult.translatedMenu.length} menu items...`);
              
              // Generate images with parallel processing (batches of 2 to avoid rate limits)
              const BATCH_SIZE = 2;
              let processedCount = 0;
              
              for (let i = 0; i < llmResult.translatedMenu.length; i += BATCH_SIZE) {
                const batch = llmResult.translatedMenu.slice(i, i + BATCH_SIZE);
                
                // Process batch in parallel
                const batchPromises = batch.map(async (menuItem, batchIndex) => {
                  const globalIndex = i + batchIndex;
                  try {
                    console.log(`Generating image ${globalIndex + 1}/${llmResult.translatedMenu.length} for: ${menuItem.name}`);
                    
                    // Sub-step progress for individual items
                    websocketService.emitImageGenerationProgress(socketId, {
                      step: 'generating_image',
                      message: `✨ Generating image for ${menuItem.name}...`,
                      progress: {
                        current: processedCount,
                        total: llmResult.translatedMenu.length,
                        percentage: Math.round((processedCount / llmResult.translatedMenu.length) * 100)
                      }
                    });
                    
                    const itemImageResult = await imageGenService.generateWithFallback(menuItem);
                    processedCount++;
                    
                    return {
                      success: true,
                      data: {
                        imageUrl: itemImageResult.imageUrl,
                        itemName: menuItem.name,
                        processingTime: itemImageResult.processingTime,
                        progress: {
                          current: processedCount,
                          total: llmResult.translatedMenu.length,
                          percentage: Math.round((processedCount / llmResult.translatedMenu.length) * 100)
                        }
                      }
                    };
                  } catch (itemError) {
                    console.error(`Failed to generate image for ${menuItem.name}:`, itemError);
                    processedCount++;
                    
                    return {
                      success: false,
                      data: {
                        imageUrl: `https://via.placeholder.com/400x400/f0f0f0/333333?text=${encodeURIComponent(menuItem.name)}`,
                        itemName: menuItem.name,
                        processingTime: 0,
                        progress: {
                          current: processedCount,
                          total: llmResult.translatedMenu.length,
                          percentage: Math.round((processedCount / llmResult.translatedMenu.length) * 100)
                        },
                        fallback: true,
                        error: 'Image generation failed, using placeholder'
                      }
                    };
                  }
                });
                
                // Wait for batch to complete and send WebSocket updates
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(result => {
                  websocketService.emitImageGenerated(socketId, result.data);
                });
                
                // Small delay between batches
                if (i + BATCH_SIZE < llmResult.translatedMenu.length) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }
              
              imageGenTime = Date.now() - imageGenStartTime;
              console.log(`All images generated in ${imageGenTime}ms`);
              
            } catch (imageError) {
              console.error('Batch image generation failed:', imageError);
              websocketService.emitImageGenerationError(socketId, {
                error: 'Failed to generate food images, but translation is complete',
                step: 'image_generation',
                processingTime: Date.now() - imageGenStartTime,
              });
            }
          }

          // Step 4: Processing Complete
          const totalTime = Date.now() - startTime;
          websocketService.emitProcessingComplete(socketId, {
            success: true,
            totalProcessingTime: totalTime,
            summary: {
              ocrTime,
              translationTime,
              imageGenTime,
              itemCount: llmResult.translatedMenu.length,
            },
          });

        } catch (translationError) {
          console.error('Translation failed:', translationError);
          websocketService.emitTranslationError(socketId, {
            error: translationError instanceof Error ? translationError.message : 'Translation failed',
            step: 'translation',
            processingTime: Date.now() - translationStartTime,
          });
        }

      } catch (ocrError) {
        console.error('OCR failed:', ocrError);
        websocketService.emitOCRError(socketId, {
          error: ocrError instanceof Error ? ocrError.message : 'OCR failed',
          step: 'ocr',
          processingTime: Date.now() - ocrStartTime,
        });
      }

    } catch (generalError) {
      console.error('Menu processing failed:', generalError);
      websocketService.emitProcessingError(socketId, {
        error: generalError instanceof Error ? generalError.message : 'Processing failed',
        step: 'general',
        processingTime: Date.now() - startTime,
      });
    }
  }
}