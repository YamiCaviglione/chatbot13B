import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/tasks/stats
 * Obtiene estadisticas completas y detalladas de las tareas del usuario
 */
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

    // Obtener todas las tareas del usuario
    const tasks = await prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Calculos basicos
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    // Tareas vencidas: pendientes con fecha limite pasada
    const now = new Date();
    const overdue = tasks.filter(
      (t) => !t.completed && t.dueDate && new Date(t.dueDate) < now
    ).length;

    // Estadisticas por prioridad
    const byPriority = {
      high: {
        total: tasks.filter((t) => t.priority === "high").length,
        completed: tasks.filter((t) => t.priority === "high" && t.completed).length,
        pending: tasks.filter((t) => t.priority === "high" && !t.completed).length,
      },
      medium: {
        total: tasks.filter((t) => t.priority === "medium").length,
        completed: tasks.filter((t) => t.priority === "medium" && t.completed).length,
        pending: tasks.filter((t) => t.priority === "medium" && !t.completed).length,
      },
      low: {
        total: tasks.filter((t) => t.priority === "low").length,
        completed: tasks.filter((t) => t.priority === "low" && t.completed).length,
        pending: tasks.filter((t) => t.priority === "low" && !t.completed).length,
      },
    };

    // Estadisticas por categoria
    const byCategory = {
      work: {
        total: tasks.filter((t) => t.category === "work").length,
        completed: tasks.filter((t) => t.category === "work" && t.completed).length,
        pending: tasks.filter((t) => t.category === "work" && !t.completed).length,
      },
      personal: {
        total: tasks.filter((t) => t.category === "personal").length,
        completed: tasks.filter((t) => t.category === "personal" && t.completed).length,
        pending: tasks.filter((t) => t.category === "personal" && !t.completed).length,
      },
      shopping: {
        total: tasks.filter((t) => t.category === "shopping").length,
        completed: tasks.filter((t) => t.category === "shopping" && t.completed).length,
        pending: tasks.filter((t) => t.category === "shopping" && !t.completed).length,
      },
      health: {
        total: tasks.filter((t) => t.category === "health").length,
        completed: tasks.filter((t) => t.category === "health" && t.completed).length,
        pending: tasks.filter((t) => t.category === "health" && !t.completed).length,
      },
      other: {
        total: tasks.filter((t) => t.category === "other").length,
        completed: tasks.filter((t) => t.category === "other" && t.completed).length,
        pending: tasks.filter((t) => t.category === "other" && !t.completed).length,
      },
    };

    // Estadisticas temporales (hoy, semana, mes)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const timeline = {
      tasksCreatedToday: tasks.filter(
        (t) => new Date(t.createdAt) >= today
      ).length,
      tasksCompletedToday: tasks.filter(
        (t) => t.completed && t.updatedAt && new Date(t.updatedAt) >= today
      ).length,
      tasksCreatedThisWeek: tasks.filter(
        (t) => new Date(t.createdAt) >= startOfWeek
      ).length,
      tasksCompletedThisWeek: tasks.filter(
        (t) => t.completed && t.updatedAt && new Date(t.updatedAt) >= startOfWeek
      ).length,
      tasksCreatedThisMonth: tasks.filter(
        (t) => new Date(t.createdAt) >= startOfMonth
      ).length,
      tasksCompletedThisMonth: tasks.filter(
        (t) => t.completed && t.updatedAt && new Date(t.updatedAt) >= startOfMonth
      ).length,
    };

    // Proximas tareas con fecha limite
    const upcoming = {
      dueTodayCount: tasks.filter(
        (t) =>
          !t.completed &&
          t.dueDate &&
          new Date(t.dueDate).toDateString() === today.toDateString()
      ).length,
      dueThisWeekCount: tasks.filter(
        (t) =>
          !t.completed &&
          t.dueDate &&
          new Date(t.dueDate) >= today &&
          new Date(t.dueDate) < new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000)
      ).length,
      nextDueTask: tasks
        .filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) >= today)
        .sort(
          (a, b) =>
            new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
        )[0] || null,
    };

    return NextResponse.json({
      summary: {
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: pending,
        completionRate: Math.round(completionRate * 10) / 10,
        overdueTasks: overdue,
      },
      byPriority,
      byCategory,
      timeline,
      upcoming,
    });
  } catch (error: unknown) {
    console.error("Error al obtener estadisticas:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: `Error al obtener estadisticas: ${errorMessage}` },
      { status: 500 }
    );
  }
}
