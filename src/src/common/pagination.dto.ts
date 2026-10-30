import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageDto {
  @IsOptional()
   @Type(() => Number)
    @IsInt()
     @Min(1)
  page: number = 1;

  @IsOptional()
   @Type(() => Number)
   @IsInt()
   @Min(1) 
   @Max(100)
  limit: number = 10;
}

export function pageMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  };
}
