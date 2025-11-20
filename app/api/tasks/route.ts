import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTaskSchema, updateTaskSchema, searchTaskSchema } from "@/lib/validators/taskSchema";
import { getCurrentUser } from "@/lib/auth";

// CREATE TASK
export async function POST(req: NextRequest) {
  try {
    // Verificar autenticación
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createTaskSchema.parse(body);

    const task = await prisma.task.create({
      data: {
        ...parsed,
        userId: user.id,
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// READ / SEARCH TASKS
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

    const { searchParams } = new URL(req.url);
    const filters = Object.fromEntries(searchParams.entries());
    const parsed = searchTaskSchema.parse(filters);

    const tasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        deleted: false, // Excluir tareas eliminadas
        ...(parsed.query && {
          title: { contains: parsed.query },
        }),
        ...(parsed.completed !== undefined && { completed: parsed.completed }),
        ...(parsed.priority && { priority: parsed.priority as "low" | "medium" | "high" }),
        ...(parsed.category && { category: parsed.category }),
      } as any,
      include: {
        subtasks: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: parsed.sortBy
        ? { [parsed.sortBy]: parsed.sortOrder || "asc" }
        : { createdAt: "desc" },
      take: parsed.limit || 50,
    });

    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// UPDATE TASK
export async function PUT(req: NextRequest) {
  try {
    // Verificar autenticación
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = updateTaskSchema.parse(body);

    // Verificar que la tarea pertenece al usuario
    const existingTask = await prisma.task.findFirst({
      where: {
        id: parsed.id,
        userId: user.id,
      },
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    const updated = await prisma.task.update({
      where: { id: parsed.id },
      data: {
        title: parsed.title,
        completed: parsed.completed,
        status: parsed.status,
        priority: parsed.priority,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
        category: parsed.category,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// DELETE TASK (Soft delete por defecto, hard delete con ?permanent=true)
export async function DELETE(req: NextRequest) {
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
    const permanent = searchParams.get("permanent") === "true";
    
    if (!id) throw new Error("Falta el ID de la tarea");

    // Verificar que la tarea pertenece al usuario
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    if (permanent) {
      // Hard delete - eliminar permanentemente
      const deleted = await prisma.task.delete({
        where: { id },
      });

      return NextResponse.json({
        message: `Tarea "${deleted.title}" eliminada permanentemente`,
        permanent: true,
      });
    } else {
      // Soft delete - marcar como eliminada
      const deleted = await prisma.task.update({
        where: { id },
        data: {
          deleted: true,
          deletedAt: new Date(),
        } as any,
      });

      return NextResponse.json({
        message: `Tarea "${deleted.title}" movida a la papelera`,
        permanent: false,
        canRestore: true,
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
