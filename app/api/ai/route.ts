import { NextResponse } from "next/server";
import { openrouter } from "@/utils/openrouter";
import { tools } from "@/utils/tools";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const completion = await openrouter.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Sos un asistente que gestiona tareas con las herramientas disponibles." },
        { role: "user", content: message },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "createTask",
            description: "Crea una nueva tarea",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                priority: { type: "string" },
                dueDate: { type: "string" },
                category: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "getTasks",
            description: "Obtiene la lista de tareas según filtros",
            parameters: {
              type: "object",
              properties: {
                completed: { type: "boolean" },
                priority: { type: "string" },
                category: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "markTaskCompleted",
            description: "Marca una tarea como completada",
            parameters: {
              type: "object",
              properties: { id: { type: "string" } },
              required: ["id"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "getTaskStats",
            description: "Devuelve estadísticas de tareas",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    });

    const toolCall = completion.choices[0].message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
    return NextResponse.json({ reply: completion.choices[0].message.content });
    }

    //forza el tipo a FunctionToolCall:
    /*
    Se asegura de que el tool call sea del tipo "function".
    Forza la desestructuración con un tipo explícito (evita el error del compilador).
    Funciona igual en OpenRouter o OpenAI SDK (todas las variantes de gpt-4o, gpt-4o-mini, etc).
    */
    const { name, arguments: argsStr } = toolCall.function as {
    name: string;
    arguments: string;
    };

    const fn = name as keyof typeof tools;
    const args = JSON.parse(argsStr);

    const result = await tools[fn](args);

    return NextResponse.json({ toolUsed: fn, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
