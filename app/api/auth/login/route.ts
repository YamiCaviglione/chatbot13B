import { NextRequest, NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validators/authSchema';
import { comparePassword, createToken, setAuthCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ZodError } from 'zod';

/**
 * POST /api/auth/login
 * Inicia sesión de usuario
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validar datos de entrada
    const { email, password } = loginSchema.parse(body);

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    // Verificar contraseña
    const isValidPassword = await comparePassword(password, user.hashedPassword);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      );
    }

    // Crear token JWT
    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    // Crear respuesta con cookie
    const response = NextResponse.json(
      {
        message: 'Inicio de sesión exitoso',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      },
      { status: 200 }
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

    console.error('Error en login:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
