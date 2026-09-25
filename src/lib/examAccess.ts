import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_LENGTH = 64;

export interface PasswordSecret {
  passwordHash: string;
  passwordSalt: string;
}

export function validateExamPassword(password: string): string | null {
  const normalized = password.normalize("NFKC");
  if (normalized.length < 4) return "Mật khẩu phải có ít nhất 4 ký tự.";
  if (normalized.length > 128) return "Mật khẩu không được vượt quá 128 ký tự.";
  return null;
}

export function hashExamPassword(password: string): PasswordSecret {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password.normalize("NFKC"), salt, HASH_LENGTH).toString("hex");
  return { passwordHash: hash, passwordSalt: salt };
}

export function verifyExamPassword(password: string, secret: PasswordSecret): boolean {
  try {
    const expected = Buffer.from(secret.passwordHash, "hex");
    const actual = scryptSync(
      password.normalize("NFKC"),
      secret.passwordSalt,
      HASH_LENGTH
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Legacy datetime-local values are interpreted in the project timezone (UTC+7). */
export function parseExamDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const normalized = hasTimezone ? value : `${value}:00+07:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
