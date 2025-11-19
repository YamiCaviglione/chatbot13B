import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { groq, GROQ_MODEL, validateGroqConfig } from '@/lib/groq';
import type Groq from 'groq-sdk';

/**
 * Función auxiliar para parsear fechas naturales a ISO
 */
function parseNaturalDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const now = new Date();
  const lowerStr = dateStr.toLowerCase().trim();
  
  // Mañana (sin incluir "pasado mañana")
  if ((lowerStr.includes('mañana') || lowerStr.includes('manana')) && !lowerStr.includes('pasado')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999); // Final del día
    return tomorrow.toISOString();
  }
  
  // Pasado mañana
  if (lowerStr.includes('pasado mañana') || lowerStr.includes('pasado manana')) {
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(23, 59, 59, 999);
    return dayAfter.toISOString();
  }
  
  // Próxima semana / próximo [día de la semana]
  if (lowerStr.includes('proxima semana') || lowerStr.includes('próxima semana') || 
      lowerStr.includes('proximo') || lowerStr.includes('próximo')) {
    const nextWeek = new Date(now);
    
    // Si menciona un día específico como "próximo lunes"
    const days = ['domingo', 'lunes', 'martes', 'miercoles', 'miércoles', 'jueves', 'viernes', 'sabado', 'sábado'];
    let targetDay = -1;
    for (let i = 0; i < days.length; i++) {
      if (lowerStr.includes(days[i])) {
        targetDay = i % 7;
        break;
      }
    }
    
    if (targetDay >= 0) {
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Ir a la próxima semana
      nextWeek.setDate(nextWeek.getDate() + daysToAdd);
    } else {
      nextWeek.setDate(nextWeek.getDate() + 7);
    }
    
    nextWeek.setHours(23, 59, 59, 999);
    return nextWeek.toISOString();
  }
  
  // "antes del lunes" / "para el lunes"
  if (lowerStr.includes('antes del') || lowerStr.includes('para el') || lowerStr.includes('el ')) {
    const days = ['domingo', 'lunes', 'martes', 'miercoles', 'miércoles', 'jueves', 'viernes', 'sabado', 'sábado'];
    let targetDay = -1;
    for (let i = 0; i < days.length; i++) {
      if (lowerStr.includes(days[i])) {
        targetDay = i % 7;
        break;
      }
    }
    
    if (targetDay >= 0) {
      const targetDate = new Date(now);
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      targetDate.setHours(23, 59, 59, 999);
      return targetDate.toISOString();
    }
  }
  
  // En X días
  const daysMatch = lowerStr.match(/en (\d+) d[ií]as?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    future.setHours(23, 59, 59, 999);
    return future.toISOString();
  }
  
  // Formato DD/MM o DD/MM/YYYY
  const dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1; // Meses en JS son 0-indexed
    let year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
    
    // Si es año corto (25 → 2025)
    if (year < 100) year += 2000;
    
    // Si la fecha ya pasó este año, usar el próximo año
    const targetDate = new Date(year, month, day, 23, 59, 59, 999);
    if (targetDate < now && !dateMatch[3]) {
      targetDate.setFullYear(year + 1);
    }
    
    return targetDate.toISOString();
  }
  
  // Si ya es formato ISO o fecha válida, devolverla
  try {
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      parsedDate.setHours(23, 59, 59, 999);
      return parsedDate.toISOString();
    }
  } catch (e) {
    // Ignorar errores de parseo
  }
  
  return null;
}

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
      dueDate: z.string().optional().describe('Fecha límite (puede ser natural como "mañana" o ISO)'),
      category: z.string().optional().describe('Categoría de la tarea'),
    }),
    execute: async ({ title, priority, dueDate, category }: any) => {
      // Parsear fecha natural si existe
      let parsedDueDate = null;
      if (dueDate) {
        parsedDueDate = parseNaturalDate(dueDate);
        
        // Validar que la fecha no sea anterior a hoy (solo comparar fechas, no horas)
        if (parsedDueDate) {
          const dueDateObj = new Date(parsedDueDate);
          const now = new Date();
          
          // Normalizar ambas fechas a medianoche para comparar solo días
          const dueDateDay = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate());
          const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          if (dueDateDay < todayDay) {
            return {
              success: false,
              error: 'La fecha límite no puede ser anterior a la fecha actual',
            };
          }
        }
      }
      
      // Asegurar que siempre haya una categoría (nunca 'other')
      const finalCategory = category || 'personal';
      
      const task = await prisma.task.create({
        data: {
          title,
          priority: (priority as "low" | "medium" | "high") || 'medium',
          dueDate: parsedDueDate ? new Date(parsedDueDate) : null,
          category: finalCategory,
          userId: userId,
        },
      });
      return {
        success: true,
        task,
        message: `Tarea creada: "${title}" con prioridad ${priority || 'media'}${parsedDueDate ? ` para ${new Date(parsedDueDate).toLocaleDateString()}` : ''}`,
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
    description: 'Obtener estadísticas avanzadas de las tareas con análisis predictivo',
    parameters: z.object({
      period: z.enum(['today', 'week', 'month', 'year', 'all-time']).optional().describe('Período de tiempo'),
      includeAdvanced: z.boolean().optional().describe('Incluir estadísticas avanzadas (tendencias, predicciones)'),
    }),
    execute: async ({ period, includeAdvanced }: any) => {
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

      const allTasks = await prisma.task.findMany({ 
        where,
        orderBy: { createdAt: 'asc' }
      });

      const completedTasks = allTasks.filter((t) => t.completed);
      const pendingTasks = allTasks.filter((t) => !t.completed);

      // Estadísticas básicas por prioridad
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

      // Estadísticas por categoría
      const categories = [...new Set(allTasks.map(t => t.category).filter(Boolean))];
      const byCategory: any = {};
      
      for (const cat of categories) {
        const catTasks = allTasks.filter(t => t.category === cat);
        const catCompleted = catTasks.filter(t => t.completed);
        byCategory[cat!] = {
          total: catTasks.length,
          completed: catCompleted.length,
          completionRate: catTasks.length > 0 ? (catCompleted.length / catTasks.length) * 100 : 0
        };
      }

      const stats: any = {
        totalTasks: allTasks.length,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        completionRate: allTasks.length > 0 ? (completedTasks.length / allTasks.length) * 100 : 0,
        byPriority,
        byCategory,
      };

      // Estadísticas avanzadas
      if (includeAdvanced) {
        // 1. Tendencia de productividad (basado en fecha de completitud)
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
        
        stats.productivityTrend = {
          current: last7Completed,
          previous: prev7Completed,
          change: last7Completed - prev7Completed,
          status: last7Completed > prev7Completed ? 'mejorando' : 
                  last7Completed < prev7Completed ? 'empeorando' : 'estable'
        };

        // 2. Categorías descuidadas (menos del 50% completitud y tienen tareas)
        const neglectedCategories = Object.entries(byCategory)
          .filter(([_, data]: any) => data.total > 0 && data.completionRate < 50)
          .map(([cat, data]: any) => ({ 
            category: cat, 
            completionRate: data.completionRate,
            pending: data.total - data.completed 
          }));

        stats.neglectedCategories = neglectedCategories;

        // 3. Predicción de finalización
        const tasksWithDuration = completedTasks.filter(t => t.completedAt && t.createdAt);
        if (tasksWithDuration.length > 0) {
          const avgDuration = tasksWithDuration.reduce((sum, t) => {
            const duration = new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime();
            return sum + duration;
          }, 0) / tasksWithDuration.length;

          const avgDays = Math.round(avgDuration / (24 * 60 * 60 * 1000));
          
          stats.predictions = {
            averageCompletionTime: `${avgDays} días`,
            estimatedCompletionDate: pendingTasks.length > 0 
              ? new Date(now.getTime() + (avgDuration * pendingTasks.length)).toISOString()
              : null,
            pendingTasksCount: pendingTasks.length
          };
        }
      }

      return {
        success: true,
        stats,
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
    const systemPrompt = `Eres un asistente de gestión de tareas inteligente y conversacional. Entiendes el lenguaje natural y ayudas a crear tareas de forma automática.

🎯 COMPORTAMIENTO PRINCIPAL:
- Cuando el usuario dice "tengo que X", "necesito X", "debo X" → Crea tareas automáticamente
- Identifica múltiples tareas en un solo mensaje (usa "y", "también", comas)
- Responde de forma natural y amigable
- SIEMPRE responde algo, nunca quedes en silencio

📋 HERRAMIENTAS DISPONIBLES:
1. createTask - Crear tareas nuevas
2. editTaskByTitle - Editar tareas por nombre
3. deleteTaskByTitle - Eliminar tareas por nombre
4. searchTasks - Buscar y listar tareas
5. getTaskStats - Ver estadísticas (usa includeAdvanced: true)
6. updateTask - Actualizar por ID
7. deleteTask - Eliminar por ID

✅ CATEGORÍAS (NUNCA uses "other"):
- "estudios" → académico, universidad, examen, estudiar
- "trabajo" → laboral, reunión, proyecto
- "compras" → supermercado, comprar, tienda
- "salud" → médico, ejercicio, gym
- "hogar" → limpiar, barrer, cocinar, ordenar, vereda
- "finanzas" → pagar, banco, factura
- "social" → cumpleaños, amigos, eventos
- "personal" → viaje, valija, hobby, desarrollo

📅 FECHAS NATURALES:
- "mañana" → usa dueDate con fecha ISO de mañana
- "próxima semana" → +7 días
- "en X días" → +X días

🚨 REGLAS CRÍTICAS:
- Identifica tareas de contexto: "barrer la vereda" = tarea hogar
- "comprar ropa" = tarea compras
- "hacer la valija" = tarea personal
- SIEMPRE confirma las tareas creadas con detalles
- Si piden estadísticas, usa getTaskStats con includeAdvanced: true`;

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
          description: 'Obtener estadísticas avanzadas de las tareas con análisis predictivo',
          parameters: {
            type: 'object',
            properties: {
              period: { 
                type: 'string', 
                enum: ['today', 'week', 'month', 'year', 'all-time'],
                description: 'Período de tiempo' 
              },
              includeAdvanced: { 
                type: 'boolean', 
                description: 'Incluir análisis avanzados (tendencias, predicciones, categorías descuidadas)' 
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
    let directContent = assistantMessage.content;
    
    // Si el contenido es null o vacío, generar respuesta por defecto
    if (!directContent || directContent.trim() === '') {
      directContent = '¡Claro! ¿En qué más puedo ayudarte?';
    }
    
    return NextResponse.json({
      message: directContent,
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
