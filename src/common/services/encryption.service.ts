import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {
    const rawKey =
      this.configService.get<string>('STORE_ENCRYPTION_KEY') ||
      process.env.STORE_ENCRYPTION_KEY;
    if (rawKey) {
      const trimmed = rawKey.trim();
      if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
        this.key = Buffer.from(trimmed, 'hex');
      } else if (Buffer.byteLength(trimmed, 'utf8') === 32) {
        this.key = Buffer.from(trimmed, 'utf8');
      } else {
        this.logger.error(
          'STORE_ENCRYPTION_KEY debe ser un string hexadecimal de 64 caracteres (32 bytes) o 32 caracteres UTF-8',
        );
      }
    }
  }

  private getKey(): Buffer {
    if (!this.key) {
      throw new InternalServerErrorException(
        'STORE_ENCRYPTION_KEY no está configurada o es inválida en las variables de entorno',
      );
    }
    return this.key;
  }

  encrypt(plainText: string): string {
    if (!plainText) {
      throw new InternalServerErrorException(
        'No se puede cifrar un texto vacío',
      );
    }
    const key = this.getKey();
    const iv = crypto.randomBytes(12); // 96-bit IV estándar para AES-GCM
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  }

  decrypt(cipherText: string): string {
    if (!cipherText) {
      throw new InternalServerErrorException(
        'No se puede descifrar un texto vacío',
      );
    }
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException(
        'Formato de datos cifrados inválido (se esperaba iv:ciphertext:authTag)',
      );
    }

    const [ivHex, encryptedHex, authTagHex] = parts;
    const key = this.getKey();

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error(
        `Error al descifrar contenido: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Error al descifrar la clave protegida',
      );
    }
  }
}
