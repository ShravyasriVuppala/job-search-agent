import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled route error', { error: err.message, path: req.path });
  res.status(500).json({ success: false, error: err.message });
}
