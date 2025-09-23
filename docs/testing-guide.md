# API Testing Guide

## Postman Collection

Import the `postman-collection.json` file into Postman to test the Menu Translation API.

### Setup Instructions

1. **Import Collection**
   - Open Postman
   - Click "Import" button
   - Select `docs/postman-collection.json`
   - Collection will be imported with all test cases

2. **Environment Setup**
   - The collection uses `{{baseUrl}}` variable
   - Default value: `http://localhost:3001`
   - Update if running on different port/host

3. **Start Backend Server**
   ```bash
   npm run dev
   ```

### Test Cases Included

#### ✅ Health Check
- **Endpoint**: `GET /health`
- **Purpose**: Verify server is running
- **Expected**: 200 OK with status and timestamp

#### ✅ Menu Translation - Basic
- **Endpoint**: `POST /api/translate`
- **Purpose**: Upload menu image and get translation
- **Requirements**: 
  - Image file (JPEG/PNG/WebP)
  - Optional: targetLanguage, generateImages
- **Expected**: 200 OK with OCR text and mock translation

#### ✅ Menu Translation - Different Languages
- **Spanish Translation**: Test with targetLanguage="Spanish"
- **French Translation**: Test with targetLanguage="French"
- **Image Generation Control**: Test with generateImages=false

#### ❌ Error Cases
- **No Image**: Test without uploading image file
- **Invalid File Type**: Upload non-image file (.txt, .pdf)
- **Route Not Found**: Test 404 handling

### Sample Test Images

For testing, use menu images with:
- Clear, readable text
- High contrast
- Standard menu format
- JPEG, PNG, or WebP format
- Size under 10MB

### Response Structure

**Success Response:**
```json
{
  "success": true,
  "originalText": "Extracted text from OCR",
  "translatedMenu": [...],
  "targetLanguage": "English",
  "confidence": 85.5,
  "processingTime": 2500
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "processingTime": 150
}
```

### Automated Tests

The collection includes automated tests that validate:
- Response time (< 30 seconds)
- Content-Type headers
- Required response fields
- Error response structure

### Manual Testing Checklist

- [ ] Health check returns 200
- [ ] Upload valid menu image succeeds
- [ ] OCR extracts text from image
- [ ] Different target languages work
- [ ] Image generation toggle works
- [ ] File size validation (> 10MB fails)
- [ ] Invalid file types rejected
- [ ] Missing image file handled
- [ ] Error responses properly formatted