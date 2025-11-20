import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize, parse } from 'cookie';
import { NextRequest } from 'next/server';
import { prisma } from './prisma';

/**
 * Clave secreta para JWT (debe estar en .env.local)
 */
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

/**
 * Nombre de la cookie de autenticación
 */
const AUTH_COOKIE_NAME = 'auth_token';

/**
 * Duración del token (7 días)
 */
const TOKEN_EXPIRATION = '7d';

/**
 * Interfaz del payload del JWT
 */
export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
}

/**
 * Hash de contraseña usando bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Comparar contraseña con hash
 */
export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Crear token JWT
 */
export function createToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRATION,
  });
}

/**
 * Verificar y decodificar token JWT
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Crear cookie de autenticación serializada
 */
export function setAuthCookie(token: string): string {
  return serialize(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 días
    path: '/',
  });
}

/**
 * Eliminar cookie de autenticación
 */
export function deleteAuthCookie(): string {
  return serialize(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Obtener token de las cookies de la request
 */
export function getAuthToken(request: NextRequest): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = parse(cookieHeader);
  return cookies[AUTH_COOKIE_NAME] || null;
}

/**
 * Obtener usuario actual desde el token
 */
export async function getCurrentUser(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  // Verificar que el usuario aún existe en la DB
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  return user;
}
