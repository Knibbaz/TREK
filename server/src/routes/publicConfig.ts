import express, { Request, Response } from 'express';
import { DEFAULT_LANGUAGE, PROJECT_METADATA } from '../config';

const router = express.Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ defaultLanguage: DEFAULT_LANGUAGE, projectMetadata: PROJECT_METADATA });
});

export default router;
