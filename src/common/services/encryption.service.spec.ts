import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('EncryptionService', () => {
  const validHexKey = crypto.randomBytes(32).toString('hex');

  it('should encrypt and decrypt a string correctly (round-trip)', () => {
    const configService = {
      get: jest.fn().mockReturnValue(validHexKey),
    } as unknown as ConfigService;

    const service = new EncryptionService(configService);
    const secretText = '928e15a2d14d4a6292345f04960f4bd3';

    const encrypted = service.encrypt(secretText);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toEqual(secretText);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toEqual(secretText);
  });

  it('should throw error when encrypting without a valid key configured', () => {
    const configService = {
      get: jest.fn().mockReturnValue(null),
    } as unknown as ConfigService;

    const service = new EncryptionService(configService);
    expect(() => service.encrypt('secret')).toThrow(
      InternalServerErrorException,
    );
  });

  it('should throw error when decrypting corrupted ciphertext or wrong auth tag', () => {
    const configService = {
      get: jest.fn().mockReturnValue(validHexKey),
    } as unknown as ConfigService;

    const service = new EncryptionService(configService);
    const encrypted = service.encrypt('secret');
    const [iv, ciphertext] = encrypted.split(':');
    const badTag = crypto.randomBytes(16).toString('hex');
    const tampered = `${iv}:${ciphertext}:${badTag}`;

    expect(() => service.decrypt(tampered)).toThrow(
      InternalServerErrorException,
    );
  });

  it('should throw error for invalid format', () => {
    const configService = {
      get: jest.fn().mockReturnValue(validHexKey),
    } as unknown as ConfigService;

    const service = new EncryptionService(configService);
    expect(() => service.decrypt('invalid-format')).toThrow(
      InternalServerErrorException,
    );
  });
});
