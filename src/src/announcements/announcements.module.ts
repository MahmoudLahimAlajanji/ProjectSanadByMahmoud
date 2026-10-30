import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';
import { AnnouncementsController } from './announcements.controller.js';
import { ProgramsModule } from '../programs/programs.module.js';

@Module({
  imports: [ProgramsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
