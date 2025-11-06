import { prisma } from "@/lib/prisma";

/**
 * Conjunto de herramientas (tools) para gestionar tareas
 * Estas funciones son llamadas por el LLM cuando detecta intenciones del usuario
 */
export const tools = {
  /**
   * Crea una nueva tarea en el sistema
   */
  async createTask(args: {
    title: string;
    priority?: string;
    dueDate?: string;
    category?: string;
  }) {
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

  /**
   * Actualiza una tarea existente
   */
  async updateTask(args: {
    id: string;
    title?: string;
    completed?: boolean;
    priority?: string;
    dueDate?: string;
    category?: string;
  }) {
    // Construir objeto de actualizacion solo con campos definidos
    const updateData: Record<string, any> = {};
    if (args.title !== undefined) updateData.title = args.title;
    if (args.completed !== undefined) updateData.completed = args.completed;
    if (args.priority !== undefined) updateData.priority = args.priority;
    if (args.dueDate !== undefined) updateData.dueDate = new Date(args.dueDate);
    if (args.category !== undefined) updateData.category = args.category;

    const updated = await prisma.task.update({
      where: { id: args.id },
      data: updateData,
    });
    
    return {
      message: `Tarea actualizada: ${updated.title}`,
      task: updated
    };
  },

  /**
   * Elimina una tarea del sistema (soft delete)
   */
  async deleteTask(args: { id: string }) {
    const deleted = await prisma.task.update({
      where: { id: args.id },
      data: { deleted: true },
    });
    return {
      message: `Tarea eliminada: ${deleted.title}`,
      task: deleted
    };
  },

  /**
   * Busca y filtra tareas segun criterios especificos
   */
  async searchTasks(args?: {
    query?: string;
    completed?: boolean;
    priority?: string;
    category?: string;
  }) {
    // Construir filtros dinamicamente
    const where: Record<string, any> = { deleted: false };
    
    if (args?.query) {
      where.title = { contains: args.query, mode: "insensitive" };
    }
    if (args?.completed !== undefined) {
      where.completed = args.completed;
    }
    if (args?.priority) {
      where.priority = args.priority;
    }
    if (args?.category) {
      where.category = args.category;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    
    return {
      count: tasks.length,
      tasks
    };
  },

  /**
   * Obtiene estadisticas de productividad del usuario
   */
  async getTaskStats() {
    const tasks = await prisma.task.findMany({ where: { deleted: false } });
    
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    
    // Estadisticas por prioridad
    const byPriority = {
      high: tasks.filter((t) => t.priority === "high").length,
      medium: tasks.filter((t) => t.priority === "medium").length,
      low: tasks.filter((t) => t.priority === "low").length,
    };
    
    // Estadisticas por categoria
    const byCategory = {
      work: tasks.filter((t) => t.category === "work").length,
      personal: tasks.filter((t) => t.category === "personal").length,
      shopping: tasks.filter((t) => t.category === "shopping").length,
      health: tasks.filter((t) => t.category === "health").length,
      other: tasks.filter((t) => t.category === "other").length,
    };
    
    return {
      summary: {
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: pending,
        completionRate: Math.round(completionRate * 10) / 10,
      },
      byPriority,
      byCategory,
    };
  },
};
