'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';

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

// Función para renderizar markdown básico
function formatMarkdown(text: string): string {
  let formatted = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // Negrita
    .replace(/\*(.+?)\*/g, '<em>$1</em>') // Cursiva
    .replace(/\n/g, '<br />'); // Saltos de línea
  
  // Convertir listas simples
  const lines = formatted.split('<br />');
  let inList = false;
  let result = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('- ')) {
      if (!inList) {
        result += '<ul>';
        inList = true;
      }
      result += '<li>' + line.trim().substring(2) + '</li>';
    } else {
      if (inList) {
        result += '</ul>';
        inList = false;
      }
      result += line;
      if (i < lines.length - 1) result += '<br />';
    }
  }
  
  if (inList) {
    result += '</ul>';
  }
  
  return result;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { user, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  // Protección de ruta
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Cargar tareas al iniciar
  useEffect(() => {
    if (user) {
      loadTasks();
    }
  }, [user]);

  // Scroll automático deshabilitado para mejor UX
  // useEffect(() => {
  //   messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  // }, [messages]);

  // Función para cargar tareas
  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await fetch('/api/tasks', {
        credentials: 'include',
      });
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

  // Función para marcar/desmarcar tarea
  const toggleTask = async (taskId: string, completed: boolean) => {
    // Actualización optimista en el frontend
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, completed: !completed, updatedAt: new Date().toISOString() } : t
    ));
    
    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: taskId, completed: !completed }),
      });
      if (!response.ok) {
        // Revertir cambio si falla
        setTasks(prev => prev.map(t => 
          t.id === taskId ? { ...t, completed: completed } : t
        ));
      }
    } catch (error) {
      console.error('Error al actualizar tarea:', error);
      // Revertir cambio si hay error
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, completed: completed } : t
      ));
    }
  };

  // Función para borrar todas las completadas
  const deleteCompleted = async () => {
    const completedTasks = tasks.filter(t => t.completed);
    for (const task of completedTasks) {
      try {
        await fetch(`/api/tasks?id=${task.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch (error) {
        console.error('Error al eliminar tarea:', error);
      }
    }
    loadTasks();
  };

  // Función para desmarcar todas
  const uncheckAll = async () => {
    const completedTasks = tasks.filter(t => t.completed);
    for (const task of completedTasks) {
      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: task.id, completed: false }),
        });
      } catch (error) {
        console.error('Error al actualizar tarea:', error);
      }
    }
    loadTasks();
  };

  // Función para cargar estadísticas avanzadas
  const loadStats = async () => {
    if (!showStats) {
      setShowStats(true);
      setLoadingStats(true);
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: 'Quiero ver todas las estadísticas avanzadas de mis tareas incluyendo tendencias y predicciones'
            }]
          }),
        });
        if (response.ok) {
          const data = await response.json();
          console.log('Respuesta de estadísticas:', data);
          
          // Extraer las estadísticas del toolCall
          const statsToolCall = data.toolCalls?.find((tc: any) => tc.tool === 'getTaskStats');
          if (statsToolCall?.result?.stats) {
            setStats(statsToolCall.result.stats);
          } else if (data.toolCalls && data.toolCalls.length > 0) {
            // Buscar en todos los toolCalls
            for (const tc of data.toolCalls) {
              if (tc.result?.stats) {
                setStats(tc.result.stats);
                break;
              }
            }
          } else {
            console.log('No se encontraron estadísticas en la respuesta');
          }
        }
      } catch (error) {
        console.error('Error al cargar estadísticas:', error);
      } finally {
        setLoadingStats(false);
      }
    } else {
      setShowStats(false);
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
        credentials: 'include',
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        data = {};
      }

      if (!response.ok) {
        const errorMsg = data?.error || data?.message || 'Error en la respuesta del servidor';
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${errorMsg}`,
        };
        setMessages(prev => [...prev, errorMessage]);
        return;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || 'Lo siento, no pude procesar tu solicitud.',
      };

      setMessages(prev => [...prev, assistantMessage]);
      // Solo recargar tareas si se usó una herramienta de tareas
      if (data.toolCalls && data.toolCalls.some((tc: any) => 
        ['createTask', 'updateTask', 'deleteTask', 'editTaskByTitle'].includes(tc.tool)
      )) {
        loadTasks();
      }
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Lo siento, hubo un error. Por favor intenta de nuevo.`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Color de prioridad
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                🤖 AI To Do Manager
              </h1>
              <p className="text-sm text-gray-600">Gestiona tus tareas con inteligencia artificial</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-xs text-gray-500">Bienvenido,</p>
                <p className="font-semibold text-gray-800">{user.name}</p>
              </div>
              <button
                onClick={loadStats}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200 text-sm font-medium flex items-center gap-2"
              >
                📊 Estadísticas
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 text-sm font-medium"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Panel de Chat */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
              
              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-gray-500 mt-12">
                    <div className="text-6xl mb-4">💬</div>
                    <p className="text-lg font-semibold mb-2">¡Hola! Soy tu asistente de tareas</p>
                    <p className="text-sm mb-4">Prueba comandos como:</p>
                    <div className="grid grid-cols-2 gap-2 max-w-md mx-auto text-xs">
                      <div className="bg-blue-50 p-2 rounded">"Crea una tarea urgente"</div>
                      <div className="bg-green-50 p-2 rounded">"Muestra mis tareas"</div>
                      <div className="bg-yellow-50 p-2 rounded">"Busca tareas de trabajo"</div>
                      <div className="bg-purple-50 p-2 rounded">"Dame estadísticas"</div>
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <div 
                          className="whitespace-pre-wrap text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl px-5 py-3 border border-gray-200">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-200 p-4 bg-gray-50">
                <form onSubmit={handleSubmit} className="flex space-x-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escribe tu mensaje aquí..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isLoading ? '⏳' : '📤'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Panel de Tareas */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
              
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Mis Tareas</h2>
                    <p className="text-xs opacity-90">
                      {tasks.filter(t => !t.completed).length} pendientes
                    </p>
                  </div>
                  <button
                    onClick={loadTasks}
                    disabled={loadingTasks}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    title="Recargar"
                  >
                    <svg
                      className={`w-5 h-5 ${loadingTasks ? 'animate-spin' : ''}`}
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

              {/* Lista */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {loadingTasks ? (
                  <div className="text-center text-gray-500 mt-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm">Cargando...</p>
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center text-gray-500 mt-12">
                    <div className="text-4xl mb-2">📝</div>
                    <p className="font-semibold">Sin tareas</p>
                    <p className="text-xs mt-1">Pídele a la IA que cree una</p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`bg-white border-2 rounded-lg p-3 transition-all hover:shadow-md ${
                        task.completed ? 'border-gray-200 opacity-60' : 'border-blue-200'
                      }`}
                    >
                      <div className="flex items-start space-x-2">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(task.id, task.completed)}
                          className="mt-1 w-4 h-4 cursor-pointer transition-all duration-200"
                        />
                        <div className="flex-1">
                          <p
                            className={`font-medium text-sm ${
                              task.completed ? 'line-through text-gray-500' : 'text-gray-800'
                            }`}
                          >
                            {task.title}
                          </p>
                          <div className="mt-2 space-y-1">
                            <div className="flex flex-wrap gap-1">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                {task.priority === 'high' && '🔴 Alta'}
                                {task.priority === 'medium' && '🟡 Media'}
                                {task.priority === 'low' && '🟢 Baja'}
                              </span>
                              {task.category && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800">
                                  {task.category}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                              {task.dueDate && (
                                <div className="flex items-center gap-1">
                                  <span>📅</span>
                                  <span>Vence: {new Date(task.dueDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <span>🕐</span>
                                <span>Creada: {new Date(task.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                              </div>
                              {task.updatedAt !== task.createdAt && (
                                <div className="flex items-center gap-1">
                                  <span>✏️</span>
                                  <span>Editada: {new Date(task.updatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {tasks.length > 0 && (
                <div className="border-t border-gray-200 bg-white">
                  <div className="p-3 space-y-2">
                    <div className="text-xs text-gray-600 flex justify-between">
                      <span> {tasks.filter(t => t.completed).length} completadas</span>
                      <span> {tasks.length} total</span>
                    </div>

                    {tasks.filter(t => t.completed).length > 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={deleteCompleted}
                          className="flex-1 px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-colors font-medium"
                        >
                          Borrar completadas
                        </button>
                        <button
                          onClick={uncheckAll}
                          className="flex-1 px-3 py-1.5 bg-gray-500 text-white text-xs rounded-lg hover:bg-gray-600 transition-colors font-medium"
                        >
                          Desmarcar todas
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Modal de Estadísticas */}
      {showStats && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowStats(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">📊 Estadísticas Avanzadas</h2>
                  <p className="text-sm opacity-90 mt-1">Análisis completo de tus tareas</p>
                </div>
                <button
                  onClick={() => setShowStats(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-all duration-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contenido del modal */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 100px)' }}>
              {loadingStats ? (
                <div className="text-center text-gray-500 py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-lg">Calculando estadísticas...</p>
                </div>
              ) : stats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Resumen general */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
                    <h3 className="font-bold text-xl text-blue-900 mb-4 flex items-center gap-2">
                      <span>📊</span> Resumen General
                    </h3>
                    <div className="space-y-3 text-gray-700">
                      <div className="flex justify-between items-center">
                        <span>Total de tareas:</span>
                        <span className="font-bold text-xl">{stats.totalTasks}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Completadas:</span>
                        <span className="font-bold text-xl text-green-600">{stats.completedTasks}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Pendientes:</span>
                        <span className="font-bold text-xl text-orange-600">{stats.pendingTasks}</span>
                      </div>
                      <div className="pt-3 border-t border-blue-300">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Tasa de completitud:</span>
                          <span className="font-bold text-2xl text-blue-600">{stats.completionRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Por categoría */}
                  {stats.byCategory && Object.keys(stats.byCategory).length > 0 && (
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200">
                      <h3 className="font-bold text-xl text-purple-900 mb-4 flex items-center gap-2">
                        <span>📂</span> Por Categoría
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(stats.byCategory).map(([cat, data]: any) => (
                          <div key={cat} className="bg-white p-3 rounded-lg">
                            <div className="flex justify-between items-center mb-1">
                              <span className="capitalize font-medium text-gray-700">{cat}</span>
                              <span className="font-bold text-purple-600">{data.completionRate.toFixed(0)}%</span>
                            </div>
                            <div className="text-sm text-gray-600">
                              {data.completed}/{data.total} completadas
                            </div>
                            <div className="mt-2 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${data.completionRate}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tendencia de productividad */}
                  {stats.productivityTrend && (
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
                      <h3 className="font-bold text-xl text-green-900 mb-4 flex items-center gap-2">
                        <span>📈</span> Tendencia de Productividad
                      </h3>
                      <div className="space-y-3 text-gray-700">
                        <div className="flex justify-between items-center">
                          <span>Última semana:</span>
                          <span className="font-bold text-lg">{stats.productivityTrend.current} completadas</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Semana anterior:</span>
                          <span className="font-bold text-lg">{stats.productivityTrend.previous} completadas</span>
                        </div>
                        <div className="pt-3 border-t border-green-300">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Estado:</span>
                            <span className={`font-bold text-xl flex items-center gap-2 ${
                              stats.productivityTrend.status === 'mejorando' ? 'text-green-600' :
                              stats.productivityTrend.status === 'empeorando' ? 'text-red-600' :
                              'text-gray-600'
                            }`}>
                              {stats.productivityTrend.status === 'mejorando' && '↗️ Mejorando'}
                              {stats.productivityTrend.status === 'empeorando' && '↘️ Empeorando'}
                              {stats.productivityTrend.status === 'estable' && '→ Estable'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Predicciones */}
                  {stats.predictions && (
                    <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-6 rounded-xl border border-cyan-200">
                      <h3 className="font-bold text-xl text-cyan-900 mb-4 flex items-center gap-2">
                        <span>🔮</span> Predicciones
                      </h3>
                      <div className="space-y-3 text-gray-700">
                        <div className="bg-white p-3 rounded-lg">
                          <div className="text-sm text-gray-600 mb-1">Tiempo promedio de completitud:</div>
                          <div className="font-bold text-lg text-cyan-600">{stats.predictions.averageCompletionTime}</div>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <div className="text-sm text-gray-600 mb-1">Tareas pendientes:</div>
                          <div className="font-bold text-lg text-cyan-600">{stats.predictions.pendingTasksCount}</div>
                        </div>
                        {stats.predictions.estimatedCompletionDate && (
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-sm text-gray-600 mb-1">Fecha estimada de finalización:</div>
                            <div className="font-bold text-lg text-cyan-600">
                              {new Date(stats.predictions.estimatedCompletionDate).toLocaleDateString('es-AR', { 
                                day: '2-digit', 
                                month: 'long', 
                                year: 'numeric' 
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Categorías descuidadas */}
                  {stats.neglectedCategories && stats.neglectedCategories.length > 0 && (
                    <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-xl border border-red-200 md:col-span-2">
                      <h3 className="font-bold text-xl text-red-900 mb-4 flex items-center gap-2">
                        <span>⚠️</span> Categorías Descuidadas
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {stats.neglectedCategories.map((cat: any) => (
                          <div key={cat.category} className="bg-white p-4 rounded-lg border border-red-200">
                            <div className="capitalize font-bold text-lg text-red-700 mb-2">{cat.category}</div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <div>{cat.pending} tareas pendientes</div>
                              <div>Solo {cat.completionRate.toFixed(0)}% completadas</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <div className="text-6xl mb-4">📊</div>
                  <p className="text-lg font-semibold">No hay estadísticas disponibles</p>
                  <p className="text-sm mt-2">Crea algunas tareas para ver tus estadísticas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
