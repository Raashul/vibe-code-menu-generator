import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler';
import { validateTranslationRequest, validateImageFile } from './middleware/validation';
import { ocrService } from './services/ocrService';
import { llmService } from './services/llmService';
import { imageGenService } from './services/imageGenService';
import { websocketService } from './services/websocketService';
import { MenuProcessor } from './services/menuProcessor';
import { imageCacheService } from './services/imageCacheService';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize WebSocket service
websocketService.initialize(httpServer);

// Initialize Redis cache service
imageCacheService.initialize().catch(error => {
  console.warn('Failed to initialize Redis cache service:', error);
});

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

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Menu Translation WebSocket Test</title>
      <script src="/socket.io/socket.io.js"></script>
    </head>
    <body>
      <h1>Menu Translation WebSocket Test</h1>
      <div id="status">Connecting...</div>
      <div id="events"></div>
      
      <script>
        const socket = io();
        const status = document.getElementById('status');
        const events = document.getElementById('events');
        
        function addEvent(type, data) {
          const div = document.createElement('div');
          div.innerHTML = '<strong>' + type + ':</strong> ' + JSON.stringify(data, null, 2);
          div.style.marginBottom = '10px';
          div.style.padding = '10px';
          div.style.backgroundColor = '#f0f0f0';
          events.appendChild(div);
        }
        
        socket.on('connect', () => {
          status.textContent = 'Connected! Socket ID: ' + socket.id;
          addEvent('Connected', { socketId: socket.id });
          
          // Join a test room
          socket.emit('join_room', 'test-socket-123');
        });
        
        socket.on('room_joined', (data) => {
          addEvent('Room Joined', data);
        });
        
        socket.on('ocr_started', () => {
          addEvent('OCR Started', {});
        });
        
        socket.on('ocr_complete', (data) => {
          addEvent('OCR Complete', data);
        });
        
        socket.on('translation_started', () => {
          addEvent('Translation Started', {});
        });
        
        socket.on('translation_complete', (data) => {
          addEvent('Translation Complete', data);
        });
        
        socket.on('image_generation_started', () => {
          addEvent('Image Generation Started', {});
        });
        
        socket.on('image_generated', (data) => {
          const progressText = data.progress ? \`(\${data.progress.current}/\${data.progress.total}-\${data.progress.percentage}%)\` : '';
          const fallbackText = data.fallback ? '[FALLBACK]' : '';
          addEvent('Image Generated ' + progressText + fallbackText, data);
        });
        
        socket.on('processing_complete', (data) => {
          addEvent('Processing Complete', data);
        });
        
        socket.on('disconnect', () => {
          status.textContent = 'Disconnected';
          addEvent('Disconnected', {});
        });
        
        // Handle all error events
        ['ocr_error', 'translation_error', 'image_generation_error', 'processing_error'].forEach(event => {
          socket.on(event, (data) => {
            addEvent('ERROR - ' + event, data);
          });
        });
      </script>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/translate', 
  upload.single('image'), 
  validateImageFile,
  validateTranslationRequest,
  asyncHandler(async (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
      });
    }

    const { targetLanguage = 'English', generateImages = true, socketId } = req.body;

    // Return immediate response - processing will continue in background
    res.status(202).json({
      success: true,
      message: 'Processing started',
      socketId,
      status: 'processing'
    });

    // Start async processing
    MenuProcessor.processMenuAsync({
      imageBuffer: req.file.buffer,
      mimetype: req.file.mimetype,
      targetLanguage,
      generateImages: generateImages === 'true' || generateImages === true,
      socketId,
    });

  } catch (error) {
    console.error('Failed to start processing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start processing',
    });
  }
}));

app.use(notFoundHandler);
app.use(errorHandler);

httpServer.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
});