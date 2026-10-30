import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname, join, basename } from 'path';
import { promises as fs } from 'fs';

export const PUBLIC_DIR = join(process.cwd(), 'uploads', 'public');
export const PRIVATE_DIR = join(process.cwd(), 'uploads', 'private');

const MB = 1024 * 1024;

type Kind = 'image' | 'cv' | 'material';

const RULES: Record<Kind, { max: number; types: Record<string, string[]> }> = {
  image: {
    max: 2 * MB,
    types: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
  },
  cv: {
    max: 2 * MB,
    types: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
    },
  },
  material: {
    max: 10 * MB,
    types: {
      'application/pdf': ['.pdf'],
      'application/zip': ['.zip'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        ['.pptx'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
    },
  },
};


export function uploadOptions(kind: Kind, dir: string, subdir: string) {
  const rule = RULES[kind];
  return {
    storage: diskStorage({
      destination: join(dir, subdir),

      filename: (_req, file, cb) =>
        cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: rule.max, files: 1 },
    fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
      const exts = rule.types[file.mimetype];
      const ext = extname(file.originalname).toLowerCase();
      
      if (!exts || !exts.includes(ext)) {
        return cb(
          new BadRequestException(
            `Allowed types: ${Object.values(rule.types).flat().join(', ')}`,
          ),
          false,
        );
      }
      cb(null, true);
    },
  };
}


export async function removeFile(dir: string, subdir: string, name?: string | null) {
  if (!name) return;
  await fs.unlink(join(dir, subdir, basename(name))).catch(() => undefined);
}

export function filePath(dir: string, subdir: string, name: string) {
  return join(dir, subdir, basename(name)); // basename = حماية من path traversal
}
