import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler';
import { validateTranslationRequest, validateImageFile } from './middleware/validation';
import { ocrService } from './services/ocrService';
import { llmService } from './services/llmService';
import { imageGenService } from './services/imageGenService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/translate', 
  upload.single('image'), 
  validateImageFile,
  validateTranslationRequest,
  asyncHandler(async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
      });
    }

    const { targetLanguage = 'English', generateImages = true } = req.body;

    // Extract text from image using OCR
    const ocrResult = await ocrService.extractText(req.file.buffer, req.file.mimetype);
    
    if (!ocrResult.text || ocrResult.text.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Unable to extract readable text from image',
        confidence: ocrResult.confidence,
        processingTime: Date.now() - startTime,
      });
    }

    // Translate menu using LLM
    const llmResult = await llmService.retryTranslation(ocrResult.text, targetLanguage);
    
    // Generate images for menu items if requested
    let menuWithImages = llmResult.translatedMenu;
    
    if (generateImages && llmResult.translatedMenu.length > 0) {
      try {
        console.log(`Generating one shared image for ${llmResult.translatedMenu.length} menu items...`);
        
        // TODO: For production, generate individual images for each menu item using imageGenService.generateBatchImages()
        // For testing, generate one image and reuse it across all items to save API costs and time
        const firstItem = llmResult.translatedMenu[0];
        const singleImageResult = await imageGenService.generateWithFallback(firstItem);
        
        // Apply the same image URL to all menu items
        menuWithImages = llmResult.translatedMenu.map(item => ({
          ...item,
          imageUrl: singleImageResult.imageUrl
        }));
        
        console.log(`Single image generation completed for all ${llmResult.translatedMenu.length} items`);
      } catch (error) {
        console.error('Image generation failed:', error);
        // Fallback to placeholder images
        menuWithImages = llmResult.translatedMenu.map(item => ({
          ...item,
          imageUrl: `https://via.placeholder.com/400x400/f0f0f0/333333?text=${encodeURIComponent(item.name)}`
        }));
      }
    }

    const response = {
      success: true,
      originalText: ocrResult.text,
      translatedMenu: menuWithImages,
      sourceLanguage: llmResult.sourceLanguage,
      targetLanguage: llmResult.targetLanguage,
      confidence: ocrResult.confidence,
      processingTime: Date.now() - startTime,
    };

    res.json(response);
  } catch (error) {
    console.error('Translation error:', error);
    
    let errorMessage = 'Failed to process image';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('OCR') || error.message.includes('extract text')) {
        errorMessage = 'Failed to extract text from image. Please ensure the image contains clear, readable text.';
        statusCode = 400;
      } else if (error.message.includes('initialization')) {
        errorMessage = 'Service initialization failed. Please try again.';
        statusCode = 503;
      } else if (error.message.includes('OPENAI_API_KEY')) {
        errorMessage = 'Translation service not configured. Please contact support.';
        statusCode = 503;
      } else if (error.message.includes('translate') || error.message.includes('LLM')) {
        errorMessage = 'Failed to translate menu. Please try again.';
        statusCode = 500;
      } else if (error.message.includes('image generation')) {
        errorMessage = 'Translation succeeded but image generation failed. Menu returned without images.';
        statusCode = 200; // Partial success
      }
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      processingTime: Date.now() - startTime,
    });
  }
}));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});