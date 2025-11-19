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

    // Estadisticas por categoria (dinámico - detecta todas las categorías usadas)
    const uniqueCategories = [...new Set(tasks.map(t => t.category).filter(Boolean))];
    const byCategory: Record<string, any> = {};
    
    for (const cat of uniqueCategories) {
      const catTasks = tasks.filter((t) => t.category === cat);
      byCategory[cat as string] = {
        total: catTasks.length,
        completed: catTasks.filter((t) => t.completed).length,
        pending: catTasks.filter((t) => !t.completed).length,
      };
    }

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

    // Estadísticas avanzadas
    const completedTasks = tasks.filter(t => t.completed);
    const pendingTasks = tasks.filter(t => !t.completed);
    
    // 1. Estadísticas por categoría con tasa de completitud
    const categories = [...new Set(tasks.map(t => t.category).filter(Boolean))];
    const byCategoryAdvanced: any = {};
    
    for (const cat of categories) {
      const catTasks = tasks.filter(t => t.category === cat);
      const catCompleted = catTasks.filter(t => t.completed);
      byCategoryAdvanced[cat!] = {
        total: catTasks.length,
        completed: catCompleted.length,
        completionRate: catTasks.length > 0 ? (catCompleted.length / catTasks.length) * 100 : 0
      };
    }

    // 2. Tendencia de productividad (últimos 7 días vs anteriores 7 días)
    const last7Completed = completedTasks.filter(t => {
      if (!t.completedAt) return false;
      const diff = now.getTime() - new Date(t.completedAt).getTime();
      return diff <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    
    const prev7Completed = completedTasks.filter(t => {
      if (!t.completedAt) return false;
      const diff = now.getTime() - new Date(t.completedAt).getTime();
      return diff > 7 * 24 * 60 * 60 * 1000 && diff <= 14 * 24 * 60 * 60 * 1000;
    }).length;
    
    const productivityTrend = {
      current: last7Completed,
      previous: prev7Completed,
      change: last7Completed - prev7Completed,
      status: last7Completed > prev7Completed ? 'mejorando' : 
              last7Completed < prev7Completed ? 'empeorando' : 'estable'
    };

    // 3. Categorías descuidadas (menos del 50% completitud)
    const neglectedCategories = Object.entries(byCategoryAdvanced)
      .filter(([_, data]: any) => data.total > 0 && data.completionRate < 50)
      .map(([cat, data]: any) => ({ 
        category: cat, 
        completionRate: data.completionRate,
        pending: data.total - data.completed 
      }));

    // 4. Predicciones de finalización
    const tasksWithDuration = completedTasks.filter(t => t.completedAt && t.createdAt);
    let predictions = null;
    
    if (tasksWithDuration.length > 0) {
      const avgDuration = tasksWithDuration.reduce((sum, t) => {
        const duration = new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime();
        return sum + duration;
      }, 0) / tasksWithDuration.length;

      const avgDays = Math.round(avgDuration / (24 * 60 * 60 * 1000));
      
      predictions = {
        averageCompletionTime: `${avgDays} días`,
        estimatedCompletionDate: pendingTasks.length > 0 
          ? new Date(now.getTime() + (avgDuration * pendingTasks.length)).toISOString()
          : null,
        pendingTasksCount: pendingTasks.length
      };
    }

    return NextResponse.json({
      stats: {
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: pending,
        completionRate: Math.round(completionRate * 10) / 10,
        byCategory: byCategoryAdvanced,
        productivityTrend,
        neglectedCategories,
        predictions
      },
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
