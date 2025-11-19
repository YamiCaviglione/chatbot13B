import { NextResponse } from 'next/server';
import { deleteAuthCookie } from '@/lib/auth';

/**
 * POST /api/auth/logout
 * Cierra la sesión del usuario eliminando la cookie
 */
export async function POST() {
  try {
    const response = NextResponse.json(
      { message: 'Sesión cerrada exitosamente' },
      { status: 200 }
    );

    // Eliminar cookie de autenticación
    response.headers.set('Set-Cookie', deleteAuthCookie());

    return response;
  } catch (error) {
    console.error('Error en logout:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
