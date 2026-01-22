import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../../shared/errors/validation-error';

const scrypt = promisify(scryptCallback);

type PasswordHash = {
  salt: string;
  hash: string;
};

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async signup(email: string, password: string): Promise<string> {
    const normalizedEmail = normalizeEmail(email);
    const existing = await this.prisma.account.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      throw new ValidationError('Email ja cadastrado');
    }

    const passwordHash = await hashPassword(password);
    const account = await this.prisma.account.create({
      data: {
        email: normalizedEmail,
        passwordHash: passwordHash.hash,
        passwordSalt: passwordHash.salt,
      },
      select: { id: true },
    });

    return account.id;
  }

  async login(email: string, password: string): Promise<string> {
    const normalizedEmail = normalizeEmail(email);
    const account = await this.prisma.account.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, passwordHash: true, passwordSalt: true },
    });

    if (!account || !account.passwordHash || !account.passwordSalt) {
      throw new ValidationError('Email ou senha invalidos');
    }

    const isValid = await verifyPassword(
      password,
      { hash: account.passwordHash, salt: account.passwordSalt },
    );

    if (!isValid) {
      throw new ValidationError('Email ou senha invalidos');
    }

    return account.id;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16).toString('hex');
  const hashBuffer = (await scrypt(password.trim(), salt, 64)) as Buffer;
  return { salt, hash: hashBuffer.toString('hex') };
}

async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const hashBuffer = (await scrypt(password.trim(), stored.salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(stored.hash, 'hex');
  if (storedBuffer.length !== hashBuffer.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, hashBuffer);
}
