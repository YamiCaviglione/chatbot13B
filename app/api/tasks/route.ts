import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTaskSchema, updateTaskSchema, searchTaskSchema } from "@/lib/validators/taskSchema";

// CREATE TASK
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createTaskSchema.parse(body);

    const task = await prisma.task.create({ data: parsed });
    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// READ / SEARCH TASKS
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = Object.fromEntries(searchParams.entries());
    const parsed = searchTaskSchema.parse(filters);

    const tasks = await prisma.task.findMany({
      where: {
        deleted: false,
        ...(parsed.query && {
          title: { contains: parsed.query },
        }),
        ...(parsed.completed !== undefined && { completed: parsed.completed }),
        ...(parsed.priority && { priority: parsed.priority }),
        ...(parsed.category && { category: parsed.category }),
      },
      orderBy: parsed.sortBy
        ? { [parsed.sortBy]: parsed.sortOrder || "asc" }
        : { createdAt: "desc" },
      take: parsed.limit || 50,
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// UPDATE TASK
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const parsed = updateTaskSchema.parse(body);

    const updated = await prisma.task.update({
      where: { id: parsed.id },
      data: {
        title: parsed.title,
        completed: parsed.completed,
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

// DELETE TASK
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("Falta el ID de la tarea");

    const deleted = await prisma.task.update({
      where: { id },
      data: { deleted: true },
    });

    return NextResponse.json({
      message: `Tarea "${deleted.title}" marcada como eliminada`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
