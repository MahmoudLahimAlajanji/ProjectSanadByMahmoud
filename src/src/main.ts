import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module.js';
import { PRIVATE_DIR, PUBLIC_DIR } from './common/upload/upload.js';

async function bootstrap() {
  for (const d of [join(PUBLIC_DIR, 'programs'), join(PRIVATE_DIR, 'cv'), join(PRIVATE_DIR, 'materials')]) {
    mkdirSync(d, { recursive: true });
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.enableCors();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true });
  app.useStaticAssets(PUBLIC_DIR, { prefix: '/uploads' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            
      forbidNonWhitelisted: true, 
      transform: true,
    }),
  );
  app.useStaticAssets(join(process.cwd(), 'public-web'), { prefix: '/app' });
  app.enableShutdownHooks();
  await app.listen(3000, '0.0.0.0');
  console.log(`Sanad API running on http://localhost:3000/api`);
}
bootstrap();
