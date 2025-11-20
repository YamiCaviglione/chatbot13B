import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET DELETED TASKS (Obtener tareas eliminadas)
export async function GET(req: NextRequest) {
  try {
    // Verificar autenticación
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const tasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        deleted: true,
      },
      include: {
        subtasks: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
