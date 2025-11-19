import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { groq, GROQ_MODEL, validateGroqConfig } from '@/lib/groq';
import type Groq from 'groq-sdk';

/**
 * Función para crear los tools con el usuario autenticado
 */
function createTools(userId: string) {
  return {
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
          priority: (priority as "low" | "medium" | "high") || 'medium',
          dueDate: dueDate ? new Date(dueDate) : null,
          category,
          userId: userId,
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
    description: 'Actualizar una tarea existente. IMPORTANTE: Debes tener el taskId (campo id) de una tarea obtenido previamente con searchTasks.',
    parameters: z.object({
      taskId: z.string().describe('ID exacto de la tarea (campo id obtenido con searchTasks)'),
      title: z.string().optional().describe('Nuevo título'),
      completed: z.boolean().optional().describe('Estado de completitud'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Nueva prioridad'),
      dueDate: z.string().optional().describe('Nueva fecha límite'),
      category: z.string().optional().describe('Nueva categoría'),
    }),
    execute: async ({ taskId, title, completed, priority, dueDate, category }: any) => {
      // Verificar ownership - primero buscar la tarea
      const existingTask = await prisma.task.findFirst({
        where: { id: taskId, userId: userId },
      });
      
      if (!existingTask) {
        return { error: 'Tarea no encontrada o no tienes permiso', success: false };
      }

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
    description: 'Eliminar una tarea por ID exacto',
    parameters: z.object({
      taskId: z.string().describe('ID de la tarea a eliminar'),
    }),
    execute: async ({ taskId }: any) => {
      const existingTask = await prisma.task.findFirst({
        where: { id: taskId, userId: userId },
      });
      
      if (!existingTask) {
        return { error: 'Tarea no encontrada o no tienes permiso para eliminarla', success: false };
      }

      const deleted = await prisma.task.delete({
        where: { id: taskId },
      });
      return {
        success: true,
        deletedTask: deleted.title,
        message: `Tarea "${deleted.title}" eliminada correctamente`,
      };
    },
  },

  editTaskByTitle: {
    description: 'Buscar y editar una tarea por su título. USA ESTA HERRAMIENTA para editar tareas cuando el usuario menciona el título.',
    parameters: z.object({
      titleQuery: z.string().describe('Título o palabras clave de la tarea a buscar'),
      title: z.string().optional().describe('Nuevo título'),
      completed: z.boolean().optional().describe('Nuevo estado de completitud'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Nueva prioridad'),
      dueDate: z.string().optional().describe('Nueva fecha límite'),
      category: z.string().optional().describe('Nueva categoría'),
    }),
    execute: async ({ titleQuery, title, completed, priority, dueDate, category }: any) => {
      // Función para normalizar texto (sin tildes, minúsculas, sin espacios extra)
      const normalize = (text: string) => 
        text.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remover tildes
          .replace(/\s+/g, ' ') // Múltiples espacios a uno
          .trim();

      // Buscar todas las tareas del usuario
      const allTasks = await prisma.task.findMany({
        where: { userId: userId },
      });

      // Buscar la tarea que mejor coincida
      const normalizedQuery = normalize(titleQuery);
      const queryWords = normalizedQuery.split(' ');
      
      let bestMatch = null;
      let bestScore = 0;

      for (const task of allTasks) {
        const normalizedTitle = normalize(task.title);
        
        // Calcular score: cuántas palabras de la query están en el título
        let score = 0;
        for (const word of queryWords) {
          if (normalizedTitle.includes(word)) {
            score++;
          }
        }
        
        // Si todas las palabras están presentes o hay coincidencia exacta
        if (score > bestScore || normalizedTitle.includes(normalizedQuery)) {
          bestScore = score;
          bestMatch = task;
        }
      }

      if (!bestMatch || bestScore === 0) {
        return { error: `No se encontró ninguna tarea similar a "${titleQuery}"`, success: false };
      }

      const task = bestMatch;
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (completed !== undefined) {
        updateData.completed = completed;
        if (completed) updateData.completedAt = new Date();
      }
      if (priority !== undefined) updateData.priority = priority;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      if (category !== undefined) updateData.category = category;

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: updateData,
      });

      return {
        success: true,
        task: updated,
        message: `Tarea "${task.title}" actualizada correctamente`,
      };
    },
  },

  deleteTaskByTitle: {
    description: 'Buscar y eliminar una tarea por su título. USA ESTA HERRAMIENTA para eliminar tareas cuando el usuario menciona el título.',
    parameters: z.object({
      titleQuery: z.string().describe('Título o palabras clave de la tarea a eliminar'),
    }),
    execute: async ({ titleQuery }: any) => {
      // Función para normalizar texto
      const normalize = (text: string) => 
        text.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      // Buscar todas las tareas del usuario
      const allTasks = await prisma.task.findMany({
        where: { userId: userId },
      });

      // Buscar la tarea que mejor coincida
      const normalizedQuery = normalize(titleQuery);
      const queryWords = normalizedQuery.split(' ');
      
      let bestMatch = null;
      let bestScore = 0;

      for (const task of allTasks) {
        const normalizedTitle = normalize(task.title);
        
        let score = 0;
        for (const word of queryWords) {
          if (normalizedTitle.includes(word)) {
            score++;
          }
        }
        
        if (score > bestScore || normalizedTitle.includes(normalizedQuery)) {
          bestScore = score;
          bestMatch = task;
        }
      }

      if (!bestMatch || bestScore === 0) {
        return { error: `No se encontró ninguna tarea similar a "${titleQuery}"`, success: false };
      }

      const task = bestMatch;
      await prisma.task.delete({
        where: { id: task.id },
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
      const where: any = {
        userId: userId, // Solo tareas del usuario
      };

      if (query) {
        where.title = { contains: query, mode: 'insensitive' };
      }
      if (completed !== undefined) {
        where.completed = completed;
      }
      if (priority) {
        where.priority = priority as "low" | "medium" | "high";
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

      const where: any = { userId: userId };
      if (dateFilter) {
        where.createdAt = { gte: dateFilter };
      }

      const allTasks = await prisma.task.findMany({ where });

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
}

export async function POST(request: NextRequest) {
  try {
    // Validar configuración de Groq
    validateGroqConfig();

    // Verificar autenticación
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado. Por favor inicia sesión.' },
        { status: 401 }
      );
    }

    const { messages } = await request.json();

    // Crear tools con el userId del usuario autenticado
    const toolFunctions = createTools(user.id);

    // Crear el prompt del sistema
    const systemPrompt = `Eres un asistente de gestión de tareas inteligente. Ayudas a los usuarios a organizar, crear, actualizar y gestionar sus tareas.

Tienes acceso a 7 herramientas para gestionar tareas:
1. createTask - Crear nuevas tareas. Detecta automáticamente la categoría:
   - "estudios" para académicas (estudiar, examen, universidad)
   - "trabajo" para laborales (reunión, proyecto, oficina)
   - "compras" para compras (comprar, supermercado)
   - "personal" para personales (ejercicio, llamar)
   - "hogar" para del hogar (limpiar, cocinar)

2. editTaskByTitle - USAR SIEMPRE para editar tareas cuando el usuario menciona el nombre/título
3. deleteTaskByTitle - USAR SIEMPRE para eliminar tareas cuando el usuario menciona el nombre/título

4. searchTasks - Buscar y listar tareas
5. getTaskStats - Obtener estadísticas
6. updateTask - Solo si tienes el ID exacto (raro)
7. deleteTask - Solo si tienes el ID exacto (raro)

REGLAS:
- Para EDITAR: Usa editTaskByTitle con el título que menciona el usuario
- Para ELIMINAR: Usa deleteTaskByTitle con el título que menciona el usuario
- Cuando listes tareas, incluye TODAS las encontradas

Sé conciso y amigable. Confirma las acciones realizadas.`;

    // Definir las tools en formato Groq/OpenAI
    const groqTools: Groq.Chat.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'createTask',
          description: 'Crear una nueva tarea en el sistema',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Título de la tarea' },
              priority: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Prioridad de la tarea' 
              },
              dueDate: { type: 'string', description: 'Fecha límite en formato ISO' },
              category: { type: 'string', description: 'Categoría de la tarea' },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'updateTask',
          description: 'Actualizar una tarea existente',
          parameters: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'ID de la tarea a actualizar' },
              title: { type: 'string', description: 'Nuevo título' },
              completed: { type: 'boolean', description: 'Estado de completitud' },
              priority: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Nueva prioridad' 
              },
              dueDate: { type: 'string', description: 'Nueva fecha límite' },
              category: { type: 'string', description: 'Nueva categoría' },
            },
            required: ['taskId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'deleteTask',
          description: 'Eliminar una tarea',
          parameters: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'ID de la tarea a eliminar' },
            },
            required: ['taskId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'editTaskByTitle',
          description: 'Buscar y editar una tarea por su título. USA ESTA cuando el usuario pide editar una tarea mencionando su nombre.',
          parameters: {
            type: 'object',
            properties: {
              titleQuery: { type: 'string', description: 'Título o palabras clave de la tarea' },
              title: { type: 'string', description: 'Nuevo título' },
              completed: { type: 'boolean', description: 'Nuevo estado' },
              priority: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Nueva prioridad' 
              },
              dueDate: { type: 'string', description: 'Nueva fecha límite' },
              category: { type: 'string', description: 'Nueva categoría' },
            },
            required: ['titleQuery'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'deleteTaskByTitle',
          description: 'Buscar y eliminar una tarea por su título. USA ESTA cuando el usuario pide eliminar una tarea mencionando su nombre.',
          parameters: {
            type: 'object',
            properties: {
              titleQuery: { type: 'string', description: 'Título o palabras clave de la tarea a eliminar' },
            },
            required: ['titleQuery'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'searchTasks',
          description: 'Buscar y filtrar tareas',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Texto de búsqueda' },
              completed: { type: 'boolean', description: 'Filtrar por estado completado' },
              priority: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Filtrar por prioridad' 
              },
              category: { type: 'string', description: 'Filtrar por categoría' },
              limit: { type: 'number', description: 'Número máximo de resultados' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getTaskStats',
          description: 'Obtener estadísticas de las tareas',
          parameters: {
            type: 'object',
            properties: {
              period: { 
                type: 'string', 
                enum: ['today', 'week', 'month', 'year', 'all-time'],
                description: 'Período de tiempo' 
              },
            },
          },
        },
      },
    ];

    // Primera llamada a Groq con function calling
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      tools: groqTools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 2000,
    });

    const assistantMessage = response.choices[0].message;
    const toolResults: any[] = [];

    // Ejecutar tool calls si los hay
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // Ejecutar la función correspondiente
        let result;
        if (functionName === 'createTask' && toolFunctions.createTask) {
          result = await toolFunctions.createTask.execute(functionArgs);
        } else if (functionName === 'updateTask' && toolFunctions.updateTask) {
          result = await toolFunctions.updateTask.execute(functionArgs);
        } else if (functionName === 'deleteTask' && toolFunctions.deleteTask) {
          result = await toolFunctions.deleteTask.execute(functionArgs);
        } else if (functionName === 'editTaskByTitle' && toolFunctions.editTaskByTitle) {
          result = await toolFunctions.editTaskByTitle.execute(functionArgs);
        } else if (functionName === 'deleteTaskByTitle' && toolFunctions.deleteTaskByTitle) {
          result = await toolFunctions.deleteTaskByTitle.execute(functionArgs);
        } else if (functionName === 'searchTasks' && toolFunctions.searchTasks) {
          result = await toolFunctions.searchTasks.execute(functionArgs);
        } else if (functionName === 'getTaskStats' && toolFunctions.getTaskStats) {
          result = await toolFunctions.getTaskStats.execute(functionArgs);
        }

        toolResults.push({
          tool: functionName,
          arguments: functionArgs,
          result,
        });
      }

      // Segunda llamada: Pedir al LLM que genere una respuesta natural con los resultados
      const followUpMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
        {
          role: 'assistant',
          content: `He ejecutado las herramientas solicitadas. Resultados:\n${JSON.stringify(toolResults, null, 2)}`,
        },
        {
          role: 'user',
          content: 'Resume los resultados de forma clara y amigable. Si son tareas, lista cada una con su título, prioridad y estado. Si son estadísticas, muestra los números de forma organizada.',
        },
      ];

      const followUpResponse = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: followUpMessages as any,
        temperature: 0.7,
        max_tokens: 2000,
      });

      let finalResponse = followUpResponse.choices[0].message.content;
      if (!finalResponse || finalResponse.trim() === '') {
        finalResponse = 'Lo siento, no pude generar una respuesta. Por favor intenta de nuevo o sé más específico.';
      }
      return NextResponse.json({
        message: finalResponse,
        toolCalls: toolResults,
      });
    }

    // Si no hay tool calls, devolver la respuesta directa
    return NextResponse.json({
      message: assistantMessage.content || 'Procesado correctamente',
      toolCalls: [],
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
