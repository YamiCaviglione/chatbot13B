'use client';

import { useState, useEffect, useRef } from 'react';

// Interfaz para las tareas
interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  category?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

// Interfaz para los mensajes
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cargar tareas al iniciar
  useEffect(() => {
    loadTasks();
  }, []);

  // Scroll automático al final de los mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Función para cargar todas las tareas
  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error al cargar tareas:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Función para enviar mensaje
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || 'Lo siento, no pude procesar tu solicitud.',
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Recargar tareas después de la respuesta
      setTimeout(() => {
        loadTasks();
      }, 500);
      
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Función para obtener el color de prioridad
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            AI Todo Manager
          </h1>
          <p className="text-gray-600">
            Gestiona tus tareas conversando naturalmente con la IA
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panel de Chat - 2/3 del ancho */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg h-[calc(100vh-200px)] flex flex-col">
              {/* Área de mensajes */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-gray-500 mt-8">
                    <p className="text-lg mb-4">¡Hola! Soy tu asistente de tareas.</p>
                    <p className="text-sm">Puedes pedirme que:</p>
                    <ul className="text-sm mt-2 space-y-1">
                      <li>✅ Cree nuevas tareas</li>
                      <li>📝 Actualice tareas existentes</li>
                      <li>🔍 Busque y filtre tareas</li>
                      <li>🗑️ Elimine tareas</li>
                      <li>📊 Muestre estadísticas</li>
                    </ul>
                  </div>
                )}

                {messages.map((message: any) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 rounded-lg px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ref para scroll automático */}
              <div ref={messagesEndRef} />
            </div>

            {/* Área de input */}
            <div className="border-t border-gray-200 p-4">
              <form onSubmit={handleSubmit} className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Enviando...' : 'Enviar'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Panel de Tareas - 1/3 del ancho */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-lg h-[calc(100vh-200px)] flex flex-col">
            {/* Header del panel */}
            <div className="border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Mis Tareas</h2>
              <button
                onClick={loadTasks}
                disabled={loadingTasks}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Recargar tareas"
              >
                <svg
                  className={`w-5 h-5 text-gray-600 ${loadingTasks ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Panel de Tareas - 1/3 del ancho */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg h-[calc(100vh-200px)] flex flex-col">
              {/* Header del panel */}
              <div className="border-b border-gray-200 p-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">Mis Tareas</h2>
                <button
                  onClick={loadTasks}
                  disabled={loadingTasks}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Recargar tareas"
                >
                  <svg
                    className={`w-5 h-5 text-gray-600 ${loadingTasks ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>

              {/* Lista de tareas */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingTasks ? (
                  <div className="text-center text-gray-500 mt-8">
                    <p>Cargando tareas...</p>
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    <p>No tienes tareas aún.</p>
                    <p className="text-sm mt-2">
                      Pídele a la IA que cree una nueva tarea.
                    </p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`border rounded-lg p-3 transition-all hover:shadow-md ${
                        task.completed ? 'bg-gray-50 opacity-60' : 'bg-white'
                      }`}
                    >
                      {/* Título de la tarea */}
                      <div className="flex items-start space-x-2">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          readOnly
                          className="mt-1 w-4 h-4"
                        />
                        <div className="flex-1">
                          <p
                            className={`font-medium ${
                              task.completed
                                ? 'line-through text-gray-500'
                                : 'text-gray-800'
                            }`}
                          >
                            {task.title}
                          </p>
                        </div>
                      </div>

                      {/* Metadatos */}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {/* Prioridad */}
                        <span
                          className={`px-2 py-1 rounded-full border ${getPriorityColor(
                            task.priority
                          )}`}
                        >
                          {task.priority === 'high' && '⚡ Alta'}
                          {task.priority === 'medium' && '📌 Media'}
                          {task.priority === 'low' && '📋 Baja'}
                        </span>

                        {/* Categoría */}
                        {task.category && (
                          <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                            {task.category}
                          </span>
                        )}

                        {/* Fecha límite */}
                        {task.dueDate && (
                          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                            📅 {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer con contador */}
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <div className="text-sm text-gray-600">
                  <p>
                    <span className="font-semibold">
                      {tasks.filter((t) => !t.completed).length}
                    </span>{' '}
                    pendientes de{' '}
                    <span className="font-semibold">{tasks.length}</span> totales
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
