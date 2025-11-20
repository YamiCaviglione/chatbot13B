import { prisma } from '../prisma';

/**
 * Servicio para manejar operaciones de tareas
 * Centraliza toda la lógica de negocio relacionada con tareas
 */

export interface CreateTaskInput {
  title: string;
  priority?: 'low' | 'medium' | 'high';
  category: 'work' | 'personal' | 'shopping' | 'health' | 'estudios' | 'hogar';
  dueDate?: Date;
  status?: 'todo' | 'inProgress' | 'done';
  userId: string;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high';
  category?: 'work' | 'personal' | 'shopping' | 'health' | 'estudios' | 'hogar';
  dueDate?: Date;
  status?: 'todo' | 'inProgress' | 'done';
  userId: string;
}

export interface SearchTasksInput {
  userId: string;
  query?: string;
  completed?: boolean;
  priority?: string;
  category?: string;
  status?: string;
  includeDeleted?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

/**
 * Crear una nueva tarea con validaciones
 */
export async function createTask(input: CreateTaskInput) {
  // Validar fecha futura si se proporciona
  if (input.dueDate && input.dueDate <= new Date()) {
    throw new Error('La fecha de vencimiento debe ser futura');
  }

  const task = await prisma.task.create({
    data: {
      title: input.title,
      priority: input.priority || 'medium',
      category: input.category,
      dueDate: input.dueDate,
      status: (input.status || 'todo') as any,
      userId: input.userId,
    },
    include: {
      subtasks: true,
    },
  });

  return task;
}

/**
 * Actualizar una tarea existente
 */
export async function updateTask(input: UpdateTaskInput) {
  // Verificar ownership
  const existingTask = await prisma.task.findFirst({
    where: {
      id: input.id,
      userId: input.userId,
      deletedAt: null,
    } as any,
  });

  if (!existingTask) {
    throw new Error('Tarea no encontrada');
  }

  const updateData: any = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
  if (input.status !== undefined) updateData.status = input.status;

  // Manejar completitud con timestamp
  if (input.completed !== undefined) {
    updateData.completed = input.completed;
    updateData.completedAt = input.completed ? new Date() : null;
    if (input.completed) {
      updateData.status = 'done';
    }
  }

  const updated = await prisma.task.update({
    where: { id: input.id },
    data: updateData,
    include: {
      subtasks: true,
    },
  });

  return updated;
}

/**
 * Soft delete: marcar como eliminada
 */
export async function softDeleteTask(taskId: string, userId: string) {
  const existingTask = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
      deletedAt: null,
    } as any,
  });

  if (!existingTask) {
    throw new Error('Tarea no encontrada');
  }

  const deleted = await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: new Date() } as any,
  });

  return deleted;
}

/**
 * Hard delete: eliminar permanentemente
 */
export async function hardDeleteTask(taskId: string, userId: string) {
  const existingTask = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
    },
  });

  if (!existingTask) {
    throw new Error('Tarea no encontrada');
  }

  const deleted = await prisma.task.delete({
    where: { id: taskId },
  });

  return deleted;
}

/**
 * Restaurar una tarea eliminada (soft delete)
 */
export async function restoreTask(taskId: string, userId: string) {
  const existingTask = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
      deletedAt: { not: null },
    } as any,
  });

  if (!existingTask) {
    throw new Error('Tarea eliminada no encontrada');
  }

  const restored = await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: null } as any,
    include: {
      subtasks: true,
    },
  });

  return restored;
}

/**
 * Buscar tareas con filtros avanzados
 */
export async function searchTasks(input: SearchTasksInput) {
  const where: any = {
    userId: input.userId,
  };

  // Por defecto, excluir eliminadas
  if (!input.includeDeleted) {
    where.deletedAt = null;
  }

  // Búsqueda de texto normalizada
  if (input.query) {
    where.title = {
      contains: input.query,
      mode: 'insensitive',
    };
  }

  if (input.completed !== undefined) {
    where.completed = input.completed;
  }

  if (input.priority) {
    where.priority = input.priority;
  }

  if (input.category) {
    where.category = input.category;
  }

  if (input.status) {
    where.status = input.status;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      subtasks: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: input.sortBy
      ? { [input.sortBy]: input.sortOrder || 'asc' }
      : { createdAt: 'desc' },
    take: input.limit || 100,
  });

  return tasks;
}

/**
 * Obtener una tarea por ID
 */
export async function getTaskById(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
      deletedAt: null,
    } as any,
    include: {
      subtasks: {
        orderBy: { order: 'asc' },
      },
    },
  });

  return task;
}

/**
 * Calcular progreso de una tarea basado en subtareas
 */
export function calculateTaskProgress(task: any): number {
  if (!task.subtasks || task.subtasks.length === 0) {
    return task.completed ? 100 : 0;
  }

  const completedSubtasks = task.subtasks.filter((st: any) => st.completed).length;
  return Math.round((completedSubtasks / task.subtasks.length) * 100);
}
