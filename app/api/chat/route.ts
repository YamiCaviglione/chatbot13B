import { NextRequest, NextResponse } from 'next/server';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Definición de los tools disponibles
const tools = {
  createTask: {
    description: 'Crear una nueva tarea en el sistema',
    parameters: z.object({
      title: z.string().describe('Título de la tarea'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Prioridad de la tarea'),
      dueDate: z.string().optional().describe('Fecha límite en formato ISO'),
      category: z.string().optional().describe('Categoría de la tarea'),
    }),
    execute: async ({ title, priority, dueDate, category }: any) => {
      const task = await prisma.task.create({
        data: {
          title,
          priority: priority || 'medium',
          dueDate: dueDate ? new Date(dueDate) : null,
          category,
        },
      });
      return {
        success: true,
        task,
        message: `Tarea creada: "${title}" con prioridad ${priority || 'media'}`,
      };
    },
  },

  updateTask: {
    description: 'Actualizar una tarea existente',
    parameters: z.object({
      taskId: z.string().describe('ID de la tarea a actualizar'),
      title: z.string().optional().describe('Nuevo título'),
      completed: z.boolean().optional().describe('Estado de completitud'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Nueva prioridad'),
      dueDate: z.string().optional().describe('Nueva fecha límite'),
      category: z.string().optional().describe('Nueva categoría'),
    }),
    execute: async ({ taskId, title, completed, priority, dueDate, category }: any) => {
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (completed !== undefined) {
        updateData.completed = completed;
        if (completed) {
          updateData.completedAt = new Date();
        }
      }
      if (priority !== undefined) updateData.priority = priority;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      if (category !== undefined) updateData.category = category;

      const task = await prisma.task.update({
        where: { id: taskId },
        data: updateData,
      });

      return {
        success: true,
        task,
        message: 'Tarea actualizada correctamente',
      };
    },
  },

  deleteTask: {
    description: 'Eliminar una tarea',
    parameters: z.object({
      taskId: z.string().describe('ID de la tarea a eliminar'),
    }),
    execute: async ({ taskId }: any) => {
      const task = await prisma.task.delete({
        where: { id: taskId },
      });
      return {
        success: true,
        deletedTask: task.title,
        message: `Tarea "${task.title}" eliminada correctamente`,
      };
    },
  },

  searchTasks: {
    description: 'Buscar y filtrar tareas',
    parameters: z.object({
      query: z.string().optional().describe('Texto de búsqueda'),
      completed: z.boolean().optional().describe('Filtrar por estado completado'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Filtrar por prioridad'),
      category: z.string().optional().describe('Filtrar por categoría'),
      limit: z.number().optional().describe('Número máximo de resultados'),
    }),
    execute: async ({ query, completed, priority, category, limit }: any) => {
      const where: any = {};

      if (query) {
        where.title = { contains: query };
      }
      if (completed !== undefined) {
        where.completed = completed;
      }
      if (priority) {
        where.priority = priority;
      }
      if (category) {
        where.category = category;
      }

      const tasks = await prisma.task.findMany({
        where,
        take: limit || 50,
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        tasks,
        totalFound: tasks.length,
        message: `Se encontraron ${tasks.length} tareas`,
      };
    },
  },

  getTaskStats: {
    description: 'Obtener estadísticas de las tareas',
    parameters: z.object({
      period: z.enum(['today', 'week', 'month', 'year', 'all-time']).optional().describe('Período de tiempo'),
    }),
    execute: async ({ period }: any) => {
      const now = new Date();
      let dateFilter: Date | undefined;

      if (period === 'today') {
        dateFilter = new Date(now.setHours(0, 0, 0, 0));
      } else if (period === 'week') {
        dateFilter = new Date(now.setDate(now.getDate() - 7));
      } else if (period === 'month') {
        dateFilter = new Date(now.setMonth(now.getMonth() - 1));
      } else if (period === 'year') {
        dateFilter = new Date(now.setFullYear(now.getFullYear() - 1));
      }

      const allTasks = await prisma.task.findMany({
        where: dateFilter ? { createdAt: { gte: dateFilter } } : {},
      });

      const completedTasks = allTasks.filter((t) => t.completed);
      const pendingTasks = allTasks.filter((t) => !t.completed);

      const byPriority = {
        high: {
          total: allTasks.filter((t) => t.priority === 'high').length,
          completed: completedTasks.filter((t) => t.priority === 'high').length,
        },
        medium: {
          total: allTasks.filter((t) => t.priority === 'medium').length,
          completed: completedTasks.filter((t) => t.priority === 'medium').length,
        },
        low: {
          total: allTasks.filter((t) => t.priority === 'low').length,
          completed: completedTasks.filter((t) => t.priority === 'low').length,
        },
      };

      return {
        success: true,
        stats: {
          totalTasks: allTasks.length,
          completedTasks: completedTasks.length,
          pendingTasks: pendingTasks.length,
          completionRate: allTasks.length > 0 ? (completedTasks.length / allTasks.length) * 100 : 0,
          byPriority,
        },
        message: `Estadísticas del período: ${period || 'todos los tiempos'}`,
      };
    },
  },
};

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    // Configurar el modelo de OpenRouter
    const model = openrouter('anthropic/claude-3.5-sonnet');

    // Crear el prompt del sistema
    const systemPrompt = `Eres un asistente de gestión de tareas inteligente. Ayudas a los usuarios a organizar, crear, actualizar y gestionar sus tareas.

Tienes acceso a 5 herramientas para gestionar tareas:
1. createTask - Para crear nuevas tareas
2. updateTask - Para actualizar tareas existentes
3. deleteTask - Para eliminar tareas
4. searchTasks - Para buscar y filtrar tareas
5. getTaskStats - Para obtener estadísticas

Cuando un usuario pida crear, actualizar, eliminar o buscar tareas, usa las herramientas correspondientes.
Sé conciso pero amigable en tus respuestas. Confirma las acciones realizadas.`;

    // Generar respuesta con tools
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      tools: tools as any,
    });

    // Extraer el texto de la respuesta
    let responseText = result.text;

    // Si no hay texto pero hay tool results, crear un resumen
    if (!responseText && result.steps) {
      const toolResults = result.steps
        .filter((step: any) => step.toolResults && step.toolResults.length > 0)
        .flatMap((step: any) => step.toolResults);

      if (toolResults.length > 0) {
        responseText = toolResults
          .map((tr: any) => tr.result.message || 'Acción completada')
          .join('\n');
      }
    }

    return NextResponse.json({
      message: responseText || 'Procesado correctamente',
      toolCalls: result.steps?.flatMap((step: any) => step.toolCalls || []),
    });
  } catch (error: any) {
    console.error('Error en /api/chat:', error);
    return NextResponse.json(
      {
        error: 'Error al procesar el mensaje',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
