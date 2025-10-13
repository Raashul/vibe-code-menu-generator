# 🍜 Vibe Menu Translator
I got bored, so I wanted to see how far I can go by simplying vibe coding.    

## Idea: 
Basically you snap a pic of a menu or upload a manu, the it generates a sample food pic using SORA  


## What it does

- Upload a photo of any menu
- OCR extracts all the text 
- AI translates everything to English
- Generates appetizing food images for each dish
- Real-time updates via websockets because why not
- Redis caching so I don't blow my OpenAI budget 💸

Built this mostly to avoid ordering mystery dishes when traveling, but it turned into a nice little tech playground.

## Demo

### Home Page

![Demo Step 1](./demo-images/image1.png)

### Image uploaded, OCR + image generation begins

![Demo Step 2](demo-images/image2.png)

### Image generation responses start coming in

![Demo Step 3](demo-images/image3.png)


### Image generation complete

![Demo Step 4](demo-images/image4.png)

## Tech Stack (aka what I threw together)

**Frontend:**
- React 19 
- TypeScript
- Vite 
- Socket.io client

**Backend:**
- Node.js + Express
- TypeScript
- Socket.io
- Tesseract.js (OCR magic)
- OpenAI API
- Redis (cache images to avoid duplicate generation)


## Architecture

Here's how this beautiful mess works:

```mermaid
sequenceDiagram
    participant User
    participant Frontend as React Frontend
    participant WebSocket as WebSocket Connection
    participant Backend as Node.js Backend
    participant Redis as Redis Cache
    participant OCR as OCR Service
    participant LLM as LLM Service
    participant ImageGen as Image Generation Service

    User->>Frontend: Upload/Take photo of menu
    Frontend->>WebSocket: Establish connection with socketId
    Frontend->>Backend: POST /api/translate (image file + socketId)
    Backend->>Frontend: HTTP 202 Accepted (processing started)
    Backend->>WebSocket: Emit 'processing_started' status
    WebSocket-->>Frontend: Processing confirmation
    
    Backend->>OCR: Extract text from image
    OCR-->>Backend: Raw menu text
    Backend->>WebSocket: Emit 'ocr_complete' with extracted text
    WebSocket-->>Frontend: OCR results with progress update
    Frontend-->>User: Show extracted text preview
    
    Backend->>LLM: Parse menu items and translate
    LLM-->>Backend: Structured menu data (translated)
    Backend->>WebSocket: Emit 'translation_complete' with menu items
    WebSocket-->>Frontend: Translation results with progress update
    Frontend-->>User: Show translated menu items (no images yet)
    
    Note over Backend,Redis: Image Generation with Caching
    loop For each menu item
        Backend->>Redis: Check cache for food item image
        alt Cache Hit
            Redis-->>Backend: Return cached image URL
            Backend->>WebSocket: Emit 'image_cached' with cached URL
        else Cache Miss
            Backend->>ImageGen: Generate food image for item
            ImageGen-->>Backend: Generated image URL
            Backend->>Redis: Store image URL in cache (7 days TTL)
            Backend->>WebSocket: Emit 'image_generated' with new URL
        end
        WebSocket-->>Frontend: Image URL update
        Frontend-->>User: Update specific menu item with image
    end
    
    Backend->>WebSocket: Emit 'processing_complete'
    WebSocket-->>Frontend: Final completion status
    Frontend-->>User: Final translated menu with photos
    
    Note over User,ImageGen: Real-time processing with caching:
    Note over Frontend,WebSocket: Live progress updates via socket events
    Note over Backend,WebSocket: Stream results as they complete
    Note over Redis,ImageGen: Redis cache reduces API costs & latency
    Note over Frontend,User: Progressive UI updates with loading states
```

## Getting Started

1. Clone this bad boy
2. Copy `.env.example` to `.env` and add your OpenAI API key
3. Fire up Redis: `docker-compose up -d`
4. Install deps: `npm install`
5. Run the thing: `npm run dev`
6. Hit `http://localhost:5173` and start uploading menu pics!

## Features

- **Real-time processing**: Watch your menu get translated step by step
- **Smart caching**: Same dish? Cached image. Your wallet will thank you.
- **Fallback images**: If image generation fails, we've got backup pics from Unsplash
- **Progressive updates**: No more staring at loading spinners
- **Mobile friendly**: Take pics directly from your phone camera

## Future Ideas (maybe if I get bored again)

- [ ] Support for more languages
- [ ] Nutritional info extraction
- [ ] Price conversion
- [ ] Restaurant recommendations
- [ ] Dietary restriction filtering
- [ ] Menu item reviews/ratings

## Credits

Pretty much built with Claude Code

