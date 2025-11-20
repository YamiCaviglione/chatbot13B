import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

// Schema para crear subtarea
const createSubtaskSchema = z.object({
  taskId: z.string(),
  title: z.string().min(1),
  order: z.number().optional(),
});

// Schema para actualizar subtarea
const updateSubtaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
  order: z.number().optional(),
});

// CREATE SUBTASK
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSubtaskSchema.parse(body);

    // Verificar que la tarea pertenece al usuario
    const task = await prisma.task.findFirst({
      where: {
        id: parsed.taskId,
        userId: user.id,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    // Calcular el orden si no se proporciona
    const order = parsed.order !== undefined
      ? parsed.order
      : await prisma.subtask.count({ where: { taskId: parsed.taskId } });

    const subtask = await prisma.subtask.create({
      data: {
        title: parsed.title,
        taskId: parsed.taskId,
        order,
      },
    });

    return NextResponse.json(subtask, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// UPDATE SUBTASK
export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = updateSubtaskSchema.parse(body);

    // Verificar que la subtarea pertenece a una tarea del usuario
    const subtask = await prisma.subtask.findFirst({
      where: {
        id: parsed.id,
        task: {
          userId: user.id,
        },
      },
    });

    if (!subtask) {
      return NextResponse.json({ error: "Subtarea no encontrada" }, { status: 404 });
    }

    const updated = await prisma.subtask.update({
      where: { id: parsed.id },
      data: {
        ...(parsed.title && { title: parsed.title }),
        ...(parsed.completed !== undefined && { completed: parsed.completed }),
        ...(parsed.order !== undefined && { order: parsed.order }),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// DELETE SUBTASK
export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("Falta el ID de la subtarea");

    // Verificar que la subtarea pertenece a una tarea del usuario
    const subtask = await prisma.subtask.findFirst({
      where: {
        id,
        task: {
          userId: user.id,
        },
      },
    });

    if (!subtask) {
      return NextResponse.json({ error: "Subtarea no encontrada" }, { status: 404 });
    }

    await prisma.subtask.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Subtarea eliminada exitosamente" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
