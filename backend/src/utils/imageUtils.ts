export function validateImageQuality(buffer: Buffer, mimetype: string): { isValid: boolean; message?: string } {
  const minSize = 1024; // 1KB minimum
  const maxSize = 10 * 1024 * 1024; // 10MB maximum
  
  if (buffer.length < minSize) {
    return {
      isValid: false,
      message: 'Image file is too small. Please upload a larger image.',
    };
  }
  
  if (buffer.length > maxSize) {
    return {
      isValid: false,
      message: 'Image file is too large. Maximum size is 10MB.',
    };
  }
  
  // Check for valid image headers
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF]);
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
  const webpHeader = Buffer.from('WEBP');
  
  const hasValidHeader = 
    buffer.subarray(0, 3).equals(jpegHeader) ||
    buffer.subarray(0, 4).equals(pngHeader) ||
    buffer.subarray(8, 12).equals(webpHeader);
  
  if (!hasValidHeader) {
    return {
      isValid: false,
      message: 'Invalid image format. Please upload a valid JPEG, PNG, or WebP image.',
    };
  }
  
  return { isValid: true };
}

export function estimateTextComplexity(text: string): 'low' | 'medium' | 'high' {
  const wordCount = text.split(/\s+/).length;
  const hasSpecialChars = /[^\w\s.,!?()-]/.test(text);
  const hasNumbers = /\d/.test(text);
  
  if (wordCount < 10 && !hasSpecialChars) return 'low';
  if (wordCount < 50 && !hasSpecialChars) return 'medium';
  return 'high';
}