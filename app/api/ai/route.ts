import { NextResponse } from "next/server";
import { openrouter } from "@/utils/openrouter";
import { tools } from "@/utils/tools";

/**
 * API Route alternativa para usar OpenRouter directamente con tool calling
 * Util para pruebas o cuando no se necesita streaming
 */
export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    // Validar que el mensaje existe
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'El mensaje es requerido y debe ser un string' },
        { status: 400 }
      );
    }

    // Llamada a OpenRouter con las herramientas definidas
    const completion = await openrouter.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un asistente inteligente que ayuda a gestionar tareas. Puedes crear, actualizar, buscar y eliminar tareas, ademas de proporcionar estadisticas de productividad."
        },
        { role: "user", content: message },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "createTask",
            description: "Crea una nueva tarea en el sistema",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Titulo de la tarea" },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  description: "Prioridad de la tarea"
                },
                dueDate: { type: "string", description: "Fecha limite en formato ISO" },
                category: {
                  type: "string",
                  enum: ["work", "personal", "shopping", "health", "other"],
                  description: "Categoria de la tarea"
                },
              },
              required: ["title"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "updateTask",
            description: "Actualiza una tarea existente",
            parameters: {
              type: "object",
              properties: {
                id: { type: "string", description: "ID de la tarea" },
                title: { type: "string", description: "Nuevo titulo" },
                completed: { type: "boolean", description: "Estado de completitud" },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  description: "Nueva prioridad"
                },
                dueDate: { type: "string", description: "Nueva fecha limite" },
                category: {
                  type: "string",
                  enum: ["work", "personal", "shopping", "health", "other"],
                  description: "Nueva categoria"
                },
              },
              required: ["id"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "deleteTask",
            description: "Elimina una tarea del sistema",
            parameters: {
              type: "object",
              properties: {
                id: { type: "string", description: "ID de la tarea a eliminar" },
              },
              required: ["id"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "searchTasks",
            description: "Busca y filtra tareas segun criterios",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "Texto de busqueda" },
                completed: { type: "boolean", description: "Filtrar por estado" },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  description: "Filtrar por prioridad"
                },
                category: {
                  type: "string",
                  enum: ["work", "personal", "shopping", "health", "other"],
                  description: "Filtrar por categoria"
                },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "getTaskStats",
            description: "Obtiene estadisticas de productividad del usuario",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    });

    // Verificar si hay tool calls en la respuesta
    const toolCall = completion.choices[0].message.tool_calls?.[0];
    
    // Si no hay tool call, devolver la respuesta de texto normal
    if (!toolCall || toolCall.type !== "function") {
      return NextResponse.json({
        reply: completion.choices[0].message.content || "No se pudo procesar la respuesta"
      });
    }

    // Extraer informacion del tool call
    // Se fuerza el tipo para evitar errores de TypeScript
    const { name, arguments: argsStr } = toolCall.function as {
      name: string;
      arguments: string;
    };

    // Validar que el tool existe
    const validTools = ["createTask", "updateTask", "deleteTask", "searchTasks", "getTaskStats"];
    if (!validTools.includes(name)) {
      return NextResponse.json(
        { error: `Tool no valido: ${name}` },
        { status: 400 }
      );
    }

    // Ejecutar el tool correspondiente
    const fn = name as keyof typeof tools;
    const args = JSON.parse(argsStr);
    
    const result = await tools[fn](args);

    return NextResponse.json({
      toolUsed: fn,
      result,
      message: completion.choices[0].message.content
    });

  } catch (error: unknown) {
    console.error('Error en AI route:', error);
    
    // Mejor manejo de errores
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return NextResponse.json(
      { error: `Error del servidor: ${errorMessage}` },
      { status: 500 }
    );
  }
}
