import { prisma } from '../prisma';

/**
 * Servicio para manejar operaciones de subtareas
 */

export interface CreateSubtaskInput {
  taskId: string;
  title: string;
  order?: number;
  userId: string; // Para verificar ownership
}

export interface UpdateSubtaskInput {
  id: string;
  title?: string;
  completed?: boolean;
  order?: number;
  userId: string;
}

/**
 * Crear una nueva subtarea
 */
export async function createSubtask(input: CreateSubtaskInput) {
  // Verificar que la tarea existe y pertenece al usuario
  const task = await prisma.task.findFirst({
    where: {
      id: input.taskId,
      userId: input.userId,
      deletedAt: null,
    } as any,
  });

  if (!task) {
    throw new Error('Tarea no encontrada');
  }

  // Si no se especifica orden, ponerla al final
  const order = input.order ?? (await getNextSubtaskOrder(input.taskId));

  const subtask = await prisma.subtask.create({
    data: {
      taskId: input.taskId,
      title: input.title,
      order,
    },
  });

  // Actualizar progreso de la tarea padre
  await updateTaskProgress(input.taskId);

  return subtask;
}

/**
 * Actualizar una subtarea existente
 */
export async function updateSubtask(input: UpdateSubtaskInput) {
  // Verificar ownership a través de la tarea padre
  const subtask = await prisma.subtask.findUnique({
    where: { id: input.id },
    include: {
      task: true,
    },
  });

  if (!subtask || subtask.task.userId !== input.userId) {
    throw new Error('Subtarea no encontrada');
  }

  const updateData: any = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.order !== undefined) updateData.order = input.order;
  if (input.completed !== undefined) {
    updateData.completed = input.completed;
    updateData.completedAt = input.completed ? new Date() : null;
  }

  const updated = await prisma.subtask.update({
    where: { id: input.id },
    data: updateData,
  });

  // Actualizar progreso de la tarea padre
  await updateTaskProgress(subtask.taskId);

  // Si todas las subtareas están completadas, marcar la tarea como completada
  if (input.completed !== undefined) {
    await checkAndCompleteTask(subtask.taskId);
  }

  return updated;
}

/**
 * Eliminar una subtarea
 */
export async function deleteSubtask(subtaskId: string, userId: string) {
  const subtask = await prisma.subtask.findUnique({
    where: { id: subtaskId },
    include: {
      task: true,
    },
  });

  if (!subtask || subtask.task.userId !== userId) {
    throw new Error('Subtarea no encontrada');
  }

  const deleted = await prisma.subtask.delete({
    where: { id: subtaskId },
  });

  // Actualizar progreso de la tarea padre
  await updateTaskProgress(subtask.taskId);

  return deleted;
}

/**
 * Obtener todas las subtareas de una tarea
 */
export async function getSubtasksByTask(taskId: string, userId: string) {
  // Verificar ownership
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
    },
  });

  if (!task) {
    throw new Error('Tarea no encontrada');
  }

  const subtasks = await prisma.subtask.findMany({
    where: { taskId },
    orderBy: { order: 'asc' },
  });

  return subtasks;
}

/**
 * Reordenar subtareas
 */
export async function reorderSubtasks(taskId: string, userId: string, subtaskIds: string[]) {
  // Verificar ownership
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
    },
  });

  if (!task) {
    throw new Error('Tarea no encontrada');
  }

  // Actualizar el orden de cada subtarea
  const updates = subtaskIds.map((id, index) =>
    prisma.subtask.update({
      where: { id },
      data: { order: index },
    })
  );

  await prisma.$transaction(updates);

  return { success: true };
}

/**
 * Obtener el siguiente número de orden para subtareas
 */
async function getNextSubtaskOrder(taskId: string): Promise<number> {
  const lastSubtask = await prisma.subtask.findFirst({
    where: { taskId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  return (lastSubtask?.order ?? -1) + 1;
}

/**
 * Actualizar el progreso de una tarea basado en sus subtareas
 */
async function updateTaskProgress(taskId: string) {
  const subtasks = await prisma.subtask.findMany({
    where: { taskId },
  });

  if (subtasks.length === 0) return;

  const completedCount = subtasks.filter((st: any) => st.completed).length;
  const progress = Math.round((completedCount / subtasks.length) * 100);

  // Este progreso podría guardarse en un campo nuevo si quisieras
  // Por ahora solo lo calculamos dinámicamente
  return progress;
}

/**
 * Verificar si todas las subtareas están completadas y marcar la tarea como completada
 */
async function checkAndCompleteTask(taskId: string) {
  const subtasks = await prisma.subtask.findMany({
    where: { taskId },
  });

  if (subtasks.length === 0) return;

  const allCompleted = subtasks.every((st: any) => st.completed);

  if (allCompleted) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        completed: true,
        completedAt: new Date(),
        status: 'done',
      } as any,
    });
  }
}
