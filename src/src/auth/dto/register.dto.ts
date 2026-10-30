import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {

  @IsEmail() 
  email: string;

  @IsString()
   @MinLength(3) 
   @MaxLength(30) 
   username: string;

  @IsString()
   @MinLength(8)
    @MaxLength(72) 
    password: string;

  @IsString()
   @IsNotEmpty() 
   firstName: string;

  @IsString()
   @IsNotEmpty() 
   lastName: string;

  @IsOptional()
   @Matches(/^(\+963|009|09)\d+$/)
    Phone?: string;
}