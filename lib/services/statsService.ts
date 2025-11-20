import { prisma } from '@/lib/prisma';

/**
 * Servicio para calcular estadísticas avanzadas de productividad
 */

export interface ProductivityStats {
  summary: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    deletedTasks: number;
    completionRate: number;
    overdueTasks: number;
  };
  byCategory: CategoryStats[];
  byPriority: {
    high: PriorityStats;
    medium: PriorityStats;
    low: PriorityStats;
  };
  productivity: {
    trend: 'improving' | 'declining' | 'stable';
    trendPercentage: number;
    averageCompletionTime: number; // en días
    tasksCompletedThisWeek: number;
    tasksCompletedLastWeek: number;
  };
  predictions: {
    estimatedCompletionDate: Date | null;
    tasksPerDay: number;
    daysToComplete: number;
  };
  neglectedCategories: string[];
}

export interface CategoryStats {
  category: string;
  total: number;
  completed: number;
  pending: number;
  completionRate: number;
  averageCompletionTime: number;
  lastActivityDate: Date | null;
}

interface PriorityStats {
  total: number;
  completed: number;
  pending: number;
}

/**
 * Obtener estadísticas completas de productividad
 */
export async function getProductivityStats(userId: string): Promise<ProductivityStats> {
  // Obtener todas las tareas (incluidas eliminadas para el conteo)
  const allTasks = await prisma.task.findMany({
    where: { userId },
    include: { subtasks: true },
  });

  const activeTasks = allTasks.filter((t: any) => !t.deletedAt);
  const deletedTasks = allTasks.filter((t: any) => t.deletedAt);
  const completedTasks = activeTasks.filter(t => t.completed);
  const pendingTasks = activeTasks.filter(t => !t.completed);
  
  // Tareas vencidas
  const now = new Date();
  const overdueTasks = pendingTasks.filter(
    t => t.dueDate && t.dueDate < now
  ).length;

  // Tasa de completitud general
  const completionRate = activeTasks.length > 0
    ? Math.round((completedTasks.length / activeTasks.length) * 100)
    : 0;

  // Estadísticas por categoría
  const byCategory = await calculateCategoryStats(activeTasks);

  // Estadísticas por prioridad
  const byPriority = calculatePriorityStats(activeTasks);

  // Tendencia de productividad
  const productivity = await calculateProductivityTrend(userId, completedTasks);

  // Predicciones
  const predictions = calculatePredictions(pendingTasks, productivity.tasksPerDay);

  // Categorías descuidadas (sin actividad reciente)
  const neglectedCategories = identifyNeglectedCategories(byCategory);

  return {
    summary: {
      totalTasks: activeTasks.length,
      completedTasks: completedTasks.length,
      pendingTasks: pendingTasks.length,
      deletedTasks: deletedTasks.length,
      completionRate,
      overdueTasks,
    },
    byCategory,
    byPriority,
    productivity,
    predictions,
    neglectedCategories,
  };
}

/**
 * Calcular estadísticas por categoría
 */
async function calculateCategoryStats(tasks: Array<any>): Promise<CategoryStats[]> {
  const categories = ['work', 'personal', 'shopping', 'health', 'estudios', 'hogar'];
  
  const stats: CategoryStats[] = [];

  for (const category of categories) {
    const categoryTasks = tasks.filter(t => t.category === category);
    const completed = categoryTasks.filter(t => t.completed);
    const pending = categoryTasks.filter(t => !t.completed);

    // Calcular tiempo promedio de completitud
    const completionTimes = completed
      .filter(t => t.completedAt && t.createdAt)
      .map(t => {
        const diff = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
        return diff / (1000 * 60 * 60 * 24); // convertir a días
      });

    const averageCompletionTime = completionTimes.length > 0
      ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
      : 0;

    // Última actividad
    const lastActivityDate = categoryTasks.length > 0
      ? new Date(Math.max(...categoryTasks.map(t => new Date(t.updatedAt).getTime())))
      : null;

    const completionRate = categoryTasks.length > 0
      ? Math.round((completed.length / categoryTasks.length) * 100)
      : 0;

    stats.push({
      category,
      total: categoryTasks.length,
      completed: completed.length,
      pending: pending.length,
      completionRate,
      averageCompletionTime,
      lastActivityDate,
    });
  }

  return stats;
}

/**
 * Calcular estadísticas por prioridad
 */
function calculatePriorityStats(tasks: Array<any>) {
  const high = tasks.filter(t => t.priority === 'high');
  const medium = tasks.filter(t => t.priority === 'medium');
  const low = tasks.filter(t => t.priority === 'low');

  return {
    high: {
      total: high.length,
      completed: high.filter(t => t.completed).length,
      pending: high.filter(t => !t.completed).length,
    },
    medium: {
      total: medium.length,
      completed: medium.filter(t => t.completed).length,
      pending: medium.filter(t => !t.completed).length,
    },
    low: {
      total: low.length,
      completed: low.filter(t => t.completed).length,
      pending: low.filter(t => !t.completed).length,
    },
  };
}

/**
 * Calcular tendencia de productividad (mejorando/empeorando)
 */
async function calculateProductivityTrend(userId: string, completedTasks: Array<any>) {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Tareas completadas esta semana
  const tasksCompletedThisWeek = completedTasks.filter(
    t => t.completedAt && new Date(t.completedAt) >= oneWeekAgo
  ).length;

  // Tareas completadas la semana anterior
  const tasksCompletedLastWeek = completedTasks.filter(
    t => t.completedAt && 
        new Date(t.completedAt) >= twoWeeksAgo && 
        new Date(t.completedAt) < oneWeekAgo
  ).length;

  // Calcular tendencia
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  let trendPercentage = 0;

  if (tasksCompletedLastWeek > 0) {
    const change = ((tasksCompletedThisWeek - tasksCompletedLastWeek) / tasksCompletedLastWeek) * 100;
    trendPercentage = Math.round(Math.abs(change));

    if (change > 10) trend = 'improving';
    else if (change < -10) trend = 'declining';
  } else if (tasksCompletedThisWeek > 0) {
    trend = 'improving';
    trendPercentage = 100;
  }

  // Calcular tiempo promedio de completitud
  const completionTimes = completedTasks
    .filter(t => t.completedAt && t.createdAt)
    .map(t => {
      const diff = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
      return diff / (1000 * 60 * 60 * 24);
    });

  const averageCompletionTime = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
    : 0;

  // Tareas por día (promedio de esta semana)
  const tasksPerDay = Math.round((tasksCompletedThisWeek / 7) * 10) / 10;

  return {
    trend,
    trendPercentage,
    averageCompletionTime,
    tasksCompletedThisWeek,
    tasksCompletedLastWeek,
    tasksPerDay,
  };
}

/**
 * Calcular predicciones de cuándo se completarán las tareas pendientes
 */
function calculatePredictions(pendingTasks: Array<any>, tasksPerDay: number) {
  const totalPending = pendingTasks.length;

  if (tasksPerDay === 0 || totalPending === 0) {
    return {
      estimatedCompletionDate: null,
      tasksPerDay: 0,
      daysToComplete: 0,
    };
  }

  const daysToComplete = Math.ceil(totalPending / tasksPerDay);
  const estimatedCompletionDate = new Date();
  estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + daysToComplete);

  return {
    estimatedCompletionDate,
    tasksPerDay,
    daysToComplete,
  };
}

/**
 * Identificar categorías descuidadas (sin actividad en > 7 días)
 */
function identifyNeglectedCategories(categoryStats: CategoryStats[]): string[] {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return categoryStats
    .filter(stat => {
      // Tiene tareas pendientes pero sin actividad reciente
      return stat.pending > 0 && 
             stat.lastActivityDate && 
             stat.lastActivityDate < sevenDaysAgo;
    })
    .map(stat => stat.category);
}
