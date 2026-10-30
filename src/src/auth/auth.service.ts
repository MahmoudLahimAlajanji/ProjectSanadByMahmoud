import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../modules/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

const SESSION_DAYS = 7;

const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  register(dto: RegisterDto) {
    return this.createUser(dto, Role.YOUTH); 
  }

  async createUser(dto: RegisterDto, role: Role) {
    const password = await bcrypt.hash(dto.password, 10);
    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          Phone: dto.Phone, 
          email: dto.email.toLowerCase(),
          password,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role,
        },
        omit: { password: true },
      });
    }
     catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email or username already taken');
      }
      throw e;
    }
  }


  async login(dto: LoginDto, userAgent?: string) {
    const identifier = dto.identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() },
           { username: identifier }],
      },
    });
    const ok = await bcrypt.compare(dto.password, user?.password ?? DUMMY_HASH);

    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        userAgent: userAgent?.slice(0, 255),
        refreshTokenHash: '',
        expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
      },
    });
    const tokens = await this.signTokens(user.id, user.role, session.id);
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: this.hash(tokens.refresh_token) },
    });
    return tokens;
  }

  async refresh(refreshToken: string) {
    let payload: { sub: number; sid: string };
    try {
      // بسر مختلف عن الـ Access، فالـ Refresh ما بينفع كـ Access
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    const tokens = await this.signTokens(user.id, user.role, session.id);

    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: this.hash(refreshToken),
        revokedAt: null,
      },
      data: { refreshTokenHash: this.hash(tokens.refresh_token) },
    });
    if (rotated.count === 0) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    return tokens;
  }

  logout(sid: string) {
    return this.prisma.authSession.update({
      where: { id: sid },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
  }

  async logoutOthers(userId: number, currentSid: string) {
    const r = await this.prisma.authSession.updateMany({
      where: { userId, id: { not: currentSid }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: r.count };
  }


  async getProfile(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async signTokens(userId: number, role: Role, sid: string) {
    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, role, sid },
        {
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwt.signAsync(
        { sub: userId, sid, jti: randomUUID() },
        {
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: `${SESSION_DAYS}d`,
        },
      ),
    ]);
    return { access_token, refresh_token };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
