import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// RESTORE TASK (Restaurar tarea eliminada)
export async function PATCH(req: NextRequest) {
  try {
    // Verificar autenticación
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) throw new Error("Falta el ID de la tarea");

    // Verificar que la tarea pertenece al usuario y está eliminada
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        userId: user.id,
        deleted: true,
      } as any,
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: "Tarea no encontrada o no está eliminada" },
        { status: 404 }
      );
    }

    // Restaurar tarea
    const restored = await prisma.task.update({
      where: { id },
      data: {
        deleted: false,
        deletedAt: null,
      } as any,
    });

    return NextResponse.json({
      message: `Tarea "${restored.title}" restaurada exitosamente`,
      task: restored,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
