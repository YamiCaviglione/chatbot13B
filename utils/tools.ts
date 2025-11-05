import { prisma } from "@/lib/prisma";

export const tools = {
  async createTask(args: { title: string; priority?: string; dueDate?: string; category?: string }) {
    const task = await prisma.task.create({
      data: {
        title: args.title,
        priority: args.priority || "medium",
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
        category: args.category || "other",
      },
    });
    return { message: `Tarea creada: ${task.title}`, task };
  },

  async getTasks(args?: { completed?: boolean; priority?: string; category?: string }) {
    const tasks = await prisma.task.findMany({
      where: {
        deleted: false,
        ...(args?.completed !== undefined && { completed: args.completed }),
        ...(args?.priority && { priority: args.priority }),
        ...(args?.category && { category: args.category }),
      },
      orderBy: { createdAt: "desc" },
    });
    return tasks;
  },

  async markTaskCompleted(args: { id: string }) {
    const updated = await prisma.task.update({
      where: { id: args.id },
      data: { completed: true },
    });
    return { message: `Tarea completada: ${updated.title}` };
  },

  async getTaskStats() {
    const tasks = await prisma.task.findMany({ where: { deleted: false } });
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    return { total, completed, pending };
  },
};
