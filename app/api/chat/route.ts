import { streamText, CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import prisma from '@/lib/prisma';

/**
 * API Route para el chat conversacional con tool calling
 * Maneja las 5 herramientas principales del gestor de tareas
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages: CoreMessage[] = body.messages;

    // Configurar el stream de texto con las 5 herramientas integradas
    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages,
      tools: {
        // Tool 1: Crear una nueva tarea
        createTask: {
          description: 'Crea una nueva tarea en el sistema del usuario',
          inputSchema: z.object({
            title: z.string().describe('Titulo de la tarea'),
            priority: z.enum(['low', 'medium', 'high']).optional().describe('Prioridad de la tarea'),
            dueDate: z.string().optional().describe('Fecha limite en formato ISO'),
            category: z.enum(['work', 'personal', 'shopping', 'health', 'other']).optional().describe('Categoria de la tarea'),
          }),
          execute: async ({ title, priority, dueDate, category }) => {
            const task = await prisma.task.create({
              data: {
                title,
                priority: priority || 'medium',
                dueDate: dueDate ? new Date(dueDate) : null,
                category: category || 'other',
              },
            });
            return { success: true, task };
          },
        },
        
        // Tool 2: Actualizar una tarea existente
        updateTask: {
          description: 'Actualiza una tarea existente por su ID',
          inputSchema: z.object({
            taskId: z.string().describe('ID unico de la tarea'),
            title: z.string().optional().describe('Nuevo titulo'),
            completed: z.boolean().optional().describe('Estado de completitud'),
            priority: z.enum(['low', 'medium', 'high']).optional().describe('Nueva prioridad'),
            dueDate: z.string().optional().describe('Nueva fecha limite'),
            category: z.enum(['work', 'personal', 'shopping', 'health', 'other']).optional().describe('Nueva categoria'),
          }),
          execute: async ({ taskId, title, completed, priority, dueDate, category }) => {
            // Preparar datos para actualizacion solo con campos definidos
            const updateData: Record<string, any> = {};
            if (title !== undefined) updateData.title = title;
            if (completed !== undefined) updateData.completed = completed;
            if (priority !== undefined) updateData.priority = priority;
            if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
            if (category !== undefined) updateData.category = category;
            
            const task = await prisma.task.update({
              where: { id: taskId },
              data: updateData,
            });
            return { success: true, task };
          },
        },
        
        // Tool 3: Eliminar una tarea (soft delete)
        deleteTask: {
          description: 'Elimina una tarea del sistema mediante soft delete',
          inputSchema: z.object({
            taskId: z.string().describe('ID unico de la tarea a eliminar'),
          }),
          execute: async ({ taskId }) => {
            const deletedTask = await prisma.task.update({
              where: { id: taskId },
              data: { deleted: true },
            });
            return { 
              success: true, 
              message: `Tarea eliminada: ${deletedTask.title}` 
            };
          },
        },
        
        // Tool 4: Buscar y filtrar tareas
        searchTasks: {
          description: 'Busca y filtra tareas segun criterios especificos',
          inputSchema: z.object({
            query: z.string().optional().describe('Texto de busqueda en el titulo'),
            completed: z.boolean().optional().describe('Filtrar por estado completado'),
            priority: z.enum(['low', 'medium', 'high']).optional().describe('Filtrar por prioridad'),
            category: z.enum(['work', 'personal', 'shopping', 'health', 'other']).optional().describe('Filtrar por categoria'),
          }),
          execute: async ({ query, completed, priority, category }) => {
            // Construir objeto de filtros dinamicamente
            const where: Record<string, any> = { deleted: false };
            
            if (query) {
              where.title = { contains: query, mode: 'insensitive' };
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
              orderBy: { createdAt: 'desc' }
            });
            
            return { 
              count: tasks.length, 
              tasks 
            };
          },
        },
        
        // Tool 5: Obtener estadisticas de productividad
        getTaskStats: {
          description: 'Obtiene estadisticas y metricas de productividad del usuario',
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = await prisma.task.findMany({ 
              where: { deleted: false } 
            });
            
            const total = tasks.length;
            const completed = tasks.filter((task) => task.completed).length;
            const pending = total - completed;
            const completionRate = total > 0 ? (completed / total) * 100 : 0;
            
            // Calcular estadisticas por prioridad
            const byPriority = {
              high: tasks.filter((t) => t.priority === 'high').length,
              medium: tasks.filter((t) => t.priority === 'medium').length,
              low: tasks.filter((t) => t.priority === 'low').length,
            };
            
            // Calcular estadisticas por categoria
            const byCategory = {
              work: tasks.filter((t) => t.category === 'work').length,
              personal: tasks.filter((t) => t.category === 'personal').length,
              shopping: tasks.filter((t) => t.category === 'shopping').length,
              health: tasks.filter((t) => t.category === 'health').length,
              other: tasks.filter((t) => t.category === 'other').length,
            };
            
            return{
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
        },
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Error en chat route:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
