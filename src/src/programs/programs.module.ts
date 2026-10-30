import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service.js';
import { ProgramsController } from './programs.controller.js';

@Module({
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
