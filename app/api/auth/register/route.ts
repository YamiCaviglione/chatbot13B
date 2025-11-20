import { NextRequest, NextResponse } from 'next/server';
import { registerSchema } from '@/lib/validators/authSchema';
import { hashPassword, createToken, setAuthCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ZodError } from 'zod';

/**
 * POST /api/auth/register
 * Registra un nuevo usuario
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validar datos de entrada
    const { email, name, password } = registerSchema.parse(body);

    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'El email ya está registrado' },
        { status: 400 }
      );
    }

    // Hash de la contraseña
    const hashedPassword = await hashPassword(password);

    // Crear usuario
    const user = await prisma.user.create({
      data: {
        email,
        name,
        hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Crear preferencias por defecto para el usuario
    await prisma.userPreferences.create({
      data: {
        userId: user.id,
      },
    });

    // Crear token JWT
    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    // Crear respuesta con cookie
    const response = NextResponse.json(
      {
        message: 'Usuario registrado exitosamente',
        user,
      },
      { status: 201 }
    );

    // Establecer cookie de autenticación
    response.headers.set('Set-Cookie', setAuthCookie(token));

    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error en registro:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
