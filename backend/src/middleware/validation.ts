import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const validateTranslationRequest = [
  body('targetLanguage')
    .optional()
    .isString()
    .isLength({ min: 2, max: 50 })
    .withMessage('Target language must be between 2 and 50 characters'),
  
  body('generateImages')
    .optional()
    .isBoolean()
    .withMessage('generateImages must be a boolean value'),
  
  body('socketId')
    .notEmpty()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('socketId is required and must be a string'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
      });
    }
    next();
  },
];

export const validateImageFile = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Image file is required',
    });
  }

  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed',
    });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.file.size > maxSize) {
    return res.status(400).json({
      success: false,
      error: 'File too large. Maximum size is 10MB',
    });
  }

  next();
};