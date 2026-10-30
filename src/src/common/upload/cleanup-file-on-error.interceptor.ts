import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError } from 'rxjs';
import { promises as fs } from 'fs';

/**
 * بيمسح الملف المرفوع إذا فشل الطلب لأي سبب (مثلاً الـ body ما عدّى الـ ValidationPipe).
 * لازم يجي بعد FileInterceptor بنفس @UseInterceptors(...) لأن multer بيحفظ الملف قبل الـ pipes.
 */
@Injectable()
export class CleanupFileOnError implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      catchError(async (err) => {
        if (req.file?.path) await fs.unlink(req.file.path).catch(() => undefined);
        throw err;
      }),
    );
  }
}
