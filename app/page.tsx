'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';

// Interfaz para las tareas
interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  taskId: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  status: 'pending' | 'inProgress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  category?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  subtasks?: Subtask[];
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
  const [showViews, setShowViews] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'calendar' | 'kanban' | 'charts'>('list');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<{ [taskId: string]: string }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [tasksPerPage] = useState(10);
  const [calendarDate, setCalendarDate] = useState(new Date());
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

  // Función para cambiar el estado de una tarea
  const changeTaskStatus = async (taskId: string, newStatus: 'pending' | 'inProgress' | 'completed') => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          id: taskId, 
          status: newStatus,
          completed: newStatus === 'completed'
        }),
      });
      if (response.ok) {
        loadTasks();
      }
    } catch (error) {
      console.error('Error al actualizar estado:', error);
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

  // Funciones para subtareas
  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const createSubtask = async (taskId: string) => {
    const title = newSubtaskTitle[taskId]?.trim();
    if (!title) return;

    try {
      const response = await fetch('/api/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId, title }),
      });

      if (response.ok) {
        setNewSubtaskTitle(prev => ({ ...prev, [taskId]: '' }));
        loadTasks();
      }
    } catch (error) {
      console.error('Error al crear subtarea:', error);
    }
  };

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    try {
      await fetch('/api/subtasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: subtaskId, completed: !completed }),
      });
      loadTasks();
    } catch (error) {
      console.error('Error al actualizar subtarea:', error);
    }
  };

  const deleteSubtask = async (subtaskId: string) => {
    try {
      await fetch(`/api/subtasks?id=${subtaskId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      loadTasks();
    } catch (error) {
      console.error('Error al eliminar subtarea:', error);
    }
  };

  const getSubtaskProgress = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) return null;
    const completed = task.subtasks.filter(s => s.completed).length;
    const total = task.subtasks.length;
    const percentage = (completed / total) * 100;
    return { completed, total, percentage };
  };

  // Función para cargar estadísticas avanzadas
  const loadStats = async () => {
    if (!showStats) {
      setShowStats(true);
      setLoadingStats(true);
      
      try {
        // Cargar estadísticas directamente desde /api/tasks/stats
        const response = await fetch('/api/tasks/stats', {
          method: 'GET',
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Estadísticas recibidas:', data);
          setStats(data.stats);
        } else {
          console.error('Error al cargar estadísticas:', response.status);
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
      case 'high': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'medium': return 'bg-cyan-100 text-cyan-800 border-cyan-300';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-300';
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
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-xs text-gray-500">Bienvenido,</p>
                <p className="font-semibold text-gray-800">{user.name}</p>
              </div>
              <button
                onClick={() => setShowViews(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200 text-sm font-medium flex items-center gap-2"
              >
                👁️ Vistas
              </button>
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
                      <div className="bg-indigo-50 p-2 rounded">"Dame estadísticas"</div>
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
                  (() => {
                    const indexOfLastTask = currentPage * tasksPerPage;
                    const indexOfFirstTask = indexOfLastTask - tasksPerPage;
                    const currentTasks = tasks.slice(indexOfFirstTask, indexOfLastTask);
                    return currentTasks.map((task) => {
                    const progress = getSubtaskProgress(task);
                    const isExpanded = expandedTasks.has(task.id);
                    
                    return (
                      <div
                        key={task.id}
                        className={`bg-white border-2 rounded-lg transition-all hover:shadow-md ${
                          task.completed ? 'border-gray-200 opacity-60' : 'border-blue-200'
                        }`}
                      >
                        <div className="p-3">
                          <div className="flex items-start space-x-2">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => toggleTask(task.id, task.completed)}
                              className="mt-1 w-4 h-4 cursor-pointer transition-all duration-200"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p
                                  className={`font-medium text-sm ${
                                    task.completed ? 'line-through text-gray-500' : 'text-gray-800'
                                  }`}
                                >
                                  {task.title}
                                </p>
                                <button
                                  onClick={() => toggleTaskExpansion(task.id)}
                                  className="ml-2 px-2 py-0.5 text-xs text-cyan-600 hover:text-cyan-800 hover:bg-cyan-50 rounded"
                                  title="Subtareas"
                                >
                                  {isExpanded ? '▼ Subtareas' : '▶ Subtareas'}
                                </button>
                              </div>
                              
                              {/* Barra de progreso de subtareas */}
                              {progress && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                    <span>{progress.completed}/{progress.total} subtareas</span>
                                    <span>{progress.percentage.toFixed(0)}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div
                                      className="bg-cyan-600 h-1.5 rounded-full transition-all duration-300"
                                      style={{ width: `${progress.percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              )}

                              <div className="mt-2 space-y-1">
                                <div className="flex flex-wrap gap-1 items-center">
                                  {/* Selector de estado */}
                                  <select
                                    value={task.status}
                                    onChange={(e) => changeTaskStatus(task.id, e.target.value as 'pending' | 'inProgress' | 'completed')}
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer ${
                                      task.status === 'completed' ? 'bg-cyan-100 text-cyan-800' :
                                      task.status === 'inProgress' ? 'bg-indigo-100 text-indigo-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    <option value="pending">⏳ Pendiente</option>
                                    <option value="inProgress">🔄 En proceso</option>
                                    <option value="completed">✅ Completada</option>
                                  </select>
                                  
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                    {task.priority === 'high' && '🔴 Alta'}
                                    {task.priority === 'medium' && '🟡 Media'}
                                    {task.priority === 'low' && '🟢 Baja'}
                                  </span>
                                  {task.category && (
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">
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

                        {/* Subtareas expandibles */}
                        {isExpanded && task.subtasks && task.subtasks.length > 0 && (
                          <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="space-y-1">
                              {task.subtasks.map((subtask) => (
                                <div key={subtask.id} className="flex items-center justify-between group">
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={subtask.completed}
                                      onChange={() => toggleSubtask(subtask.id, subtask.completed)}
                                      className="w-3 h-3 cursor-pointer"
                                    />
                                    <span className={`text-xs ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                      {subtask.title}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => deleteSubtask(subtask.id)}
                                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-xs"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Input para nueva subtarea */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={newSubtaskTitle[task.id] || ''}
                                onChange={(e) => setNewSubtaskTitle(prev => ({ ...prev, [task.id]: e.target.value }))}
                                onKeyPress={(e) => e.key === 'Enter' && createSubtask(task.id)}
                                placeholder="Nueva subtarea..."
                                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              />
                              <button
                                onClick={() => createSubtask(task.id)}
                                className="px-3 py-1 bg-cyan-600 text-white text-xs rounded hover:bg-cyan-700"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                    });
                  })()
                )}
              </div>

              {/* Paginación */}
              {tasks.length > tasksPerPage && (
                <div className="border-t border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ← Anterior
                    </button>
                    <span className="text-xs text-gray-600">
                      Página {currentPage} de {Math.ceil(tasks.length / tasksPerPage)}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(tasks.length / tasksPerPage)))}
                      disabled={currentPage >= Math.ceil(tasks.length / tasksPerPage)}
                      className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}

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
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 text-white">
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
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-6 rounded-xl border border-cyan-200">
                    <h3 className="font-bold text-xl text-cyan-900 mb-4 flex items-center gap-2">
                      <span>📊</span> Resumen General
                    </h3>
                    <div className="space-y-3 text-gray-700">
                      <div className="flex justify-between items-center">
                        <span>Total de tareas:</span>
                        <span className="font-bold text-xl">{stats.totalTasks}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Completadas:</span>
                        <span className="font-bold text-xl text-cyan-600">{stats.completedTasks}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Pendientes:</span>
                        <span className="font-bold text-xl text-gray-600">{stats.pendingTasks}</span>
                      </div>
                      <div className="pt-3 border-t border-cyan-300">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Tasa de completitud:</span>
                          <span className="font-bold text-2xl text-cyan-600">{stats.completionRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Por categoría */}
                  {stats.byCategory && Object.keys(stats.byCategory).length > 0 && (
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-xl border border-indigo-200">
                      <h3 className="font-bold text-xl text-indigo-900 mb-4 flex items-center gap-2">
                        <span>📂</span> Por Categoría
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(stats.byCategory).map(([cat, data]: any) => (
                          <div key={cat} className="bg-white p-3 rounded-lg">
                            <div className="flex justify-between items-center mb-1">
                              <span className="capitalize font-medium text-gray-700">{cat}</span>
                              <span className="font-bold text-indigo-600">{data.completionRate.toFixed(0)}%</span>
                            </div>
                            <div className="text-sm text-gray-600">
                              {data.completed}/{data.total} completadas
                            </div>
                            <div className="mt-2 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
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
                    <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-6 rounded-xl border border-cyan-200">
                      <h3 className="font-bold text-xl text-cyan-900 mb-4 flex items-center gap-2">
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
                        <div className="pt-3 border-t border-cyan-300">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Estado:</span>
                            <span className={`font-bold text-xl flex items-center gap-2 ${
                              stats.productivityTrend.status === 'mejorando' ? 'text-cyan-600' :
                              stats.productivityTrend.status === 'empeorando' ? 'text-gray-600' :
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
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-xl border border-indigo-200">
                      <h3 className="font-bold text-xl text-indigo-900 mb-4 flex items-center gap-2">
                        <span>🔮</span> Predicciones
                      </h3>
                      <div className="space-y-3 text-gray-700">
                        <div className="bg-white p-3 rounded-lg">
                          <div className="text-sm text-gray-600 mb-1">Tiempo promedio de completitud:</div>
                          <div className="font-bold text-lg text-indigo-600">{stats.predictions.averageCompletionTime}</div>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <div className="text-sm text-gray-600 mb-1">Tareas pendientes:</div>
                          <div className="font-bold text-lg text-indigo-600">{stats.predictions.pendingTasksCount}</div>
                        </div>
                        {stats.predictions.estimatedCompletionDate && (
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-sm text-gray-600 mb-1">Fecha estimada de finalización:</div>
                            <div className="font-bold text-lg text-indigo-600">
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
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-300 md:col-span-2">
                      <h3 className="font-bold text-xl text-gray-800 mb-4 flex items-center gap-2">
                        <span>⚠️</span> Categorías Descuidadas
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {stats.neglectedCategories.map((cat: any) => (
                          <div key={cat.category} className="bg-white p-4 rounded-lg border border-gray-300">
                            <div className="capitalize font-bold text-lg text-gray-700 mb-2">{cat.category}</div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <div>{cat.pending} tareas pendientes</div>
                              <div>{cat.completionRate.toFixed(0)}% completadas</div>
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

      {/* Modal de Vistas */}
      {showViews && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowViews(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">👁️ Visualizaciones Avanzadas</h2>
                  <p className="text-sm opacity-90 mt-1">Explora tus tareas de diferentes formas</p>
                </div>
                <button
                  onClick={() => setShowViews(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-all duration-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Selector de vistas */}
            <div className="bg-gray-50 border-b border-gray-200 p-4">
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setActiveView('calendar')}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    activeView === 'calendar' 
                      ? 'bg-indigo-600 text-white shadow-lg' 
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📅 Calendario
                </button>
                <button
                  onClick={() => setActiveView('kanban')}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    activeView === 'kanban' 
                      ? 'bg-indigo-600 text-white shadow-lg' 
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📋 Kanban
                </button>
                <button
                  onClick={() => setActiveView('charts')}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    activeView === 'charts' 
                      ? 'bg-indigo-600 text-white shadow-lg' 
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📊 Gráficos
                </button>
              </div>
            </div>

            {/* Contenido de las vistas */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
              
              {/* Vista de Calendario */}
              {activeView === 'calendar' && (
                <div className="space-y-4">
                  {/* Header del calendario con mes/año y controles de navegación */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                      className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-medium"
                    >
                      ← Anterior
                    </button>
                    
                    <h3 className="text-2xl font-bold text-gray-800">
                      📅 {calendarDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).charAt(0).toUpperCase() + calendarDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).slice(1)}
                    </h3>
                    
                    <button
                      onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                      className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-medium"
                    >
                      Siguiente →
                    </button>
                  </div>

                  {/* Botón para volver a hoy */}
                  <div className="flex justify-center mb-2">
                    <button
                      onClick={() => setCalendarDate(new Date())}
                      className="px-4 py-1 text-xs bg-cyan-100 text-cyan-700 rounded-full hover:bg-cyan-200"
                    >
                      📍 Hoy
                    </button>
                  </div>

                  {/* Grid del calendario */}
                  <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                    {/* Días de la semana */}
                    <div className="grid grid-cols-7 bg-gradient-to-r from-indigo-500 to-purple-500">
                      {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                        <div key={day} className="py-3 text-center text-sm font-semibold text-white border-r border-white/20 last:border-r-0">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Celdas de los días */}
                    <div className="grid grid-cols-7">
                      {(() => {
                        const today = new Date();
                        const year = calendarDate.getFullYear();
                        const month = calendarDate.getMonth();
                        const firstDay = new Date(year, month, 1);
                        const lastDay = new Date(year, month + 1, 0);
                        const daysInMonth = lastDay.getDate();
                        const startingDayOfWeek = firstDay.getDay();
                        const cells = [];

                        // Celdas vacías antes del primer día
                        for (let i = 0; i < startingDayOfWeek; i++) {
                          cells.push(
                            <div key={`empty-${i}`} className="h-24 bg-gray-50 border-r border-b border-gray-200"></div>
                          );
                        }

                        // Celdas de los días del mes
                        for (let day = 1; day <= daysInMonth; day++) {
                          const cellDate = new Date(year, month, day);
                          const isToday = cellDate.toDateString() === today.toDateString();
                          const dayTasks = tasks.filter(t => {
                            if (!t.dueDate) return false;
                            const taskDate = new Date(t.dueDate);
                            return taskDate.toDateString() === cellDate.toDateString();
                          });

                          cells.push(
                            <div
                              key={`day-${day}`}
                              className={`h-24 p-2 border-r border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                                isToday ? 'bg-cyan-50' : 'bg-white'
                              }`}
                            >
                              <div className={`text-sm font-semibold mb-1 ${
                                isToday ? 'text-cyan-600' : 'text-gray-700'
                              }`}>
                                {day}
                                {isToday && <span className="ml-1 text-xs">•</span>}
                              </div>
                              <div className="space-y-1 overflow-y-auto" style={{ maxHeight: '60px' }}>
                                {dayTasks.map(task => (
                                  <div
                                    key={task.id}
                                    className={`text-xs px-1.5 py-0.5 rounded truncate ${
                                      task.completed 
                                        ? 'bg-gray-100 text-gray-500 line-through' 
                                        : task.priority === 'high'
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : task.priority === 'medium'
                                        ? 'bg-cyan-100 text-cyan-700'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                    title={task.title}
                                  >
                                    {task.title}
                                  </div>
                                ))}
                                {dayTasks.length > 2 && (
                                  <div className="text-xs text-gray-500 italic">
                                    +{dayTasks.length - 2} más
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Celdas vacías después del último día si es necesario
                        const totalCells = startingDayOfWeek + daysInMonth;
                        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
                        for (let i = 0; i < remainingCells; i++) {
                          cells.push(
                            <div key={`empty-end-${i}`} className="h-24 bg-gray-50 border-r border-b border-gray-200"></div>
                          );
                        }

                        return cells;
                      })()}
                    </div>
                  </div>

                  {/* Leyenda */}
                  <div className="flex items-center gap-4 justify-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-indigo-100 border border-indigo-300"></div>
                      <span className="text-gray-600">Alta prioridad</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-cyan-100 border border-cyan-300"></div>
                      <span className="text-gray-600">Media prioridad</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-gray-100 border border-gray-300"></div>
                      <span className="text-gray-600">Baja prioridad</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-cyan-50 border-2 border-cyan-300"></div>
                      <span className="text-gray-600">Hoy</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vista Kanban */}
              {activeView === 'kanban' && (
                <div>
                  <h3 className="text-xl font-bold text-gray-800 mb-4">📋 Tablero Kanban</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* To Do */}
                    <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                      <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                        To Do ({tasks.filter(t => !t.completed).length})
                      </h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {tasks.filter(t => !t.completed).map(task => (
                          <div key={task.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-2">
                              <input 
                                type="checkbox" 
                                checked={false}
                                onChange={() => toggleTask(task.id, task.completed)}
                                className="mt-1 w-4 h-4"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-800">{task.title}</p>
                                <div className="flex gap-1 mt-2">
                                  <span className={`px-2 py-0.5 rounded text-xs ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                  </span>
                                  {task.category && (
                                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800">
                                      {task.category}
                                    </span>
                                  )}
                                </div>
                                {task.dueDate && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    📅 {new Date(task.dueDate).toLocaleDateString('es-AR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* In Progress (simulado - tareas con alta prioridad) */}
                    <div className="bg-indigo-50 rounded-xl p-4 border-2 border-indigo-300">
                      <h4 className="font-semibold text-indigo-700 mb-3 flex items-center gap-2">
                        <span className="w-3 h-3 bg-indigo-500 rounded-full"></span>
                        In Progress ({tasks.filter(t => !t.completed && t.priority === 'high').length})
                      </h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {tasks.filter(t => !t.completed && t.priority === 'high').map(task => (
                          <div key={task.id} className="bg-white p-3 rounded-lg shadow-sm border border-indigo-200 hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-2">
                              <input 
                                type="checkbox" 
                                checked={false}
                                onChange={() => toggleTask(task.id, task.completed)}
                                className="mt-1 w-4 h-4"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-800">{task.title}</p>
                                <div className="flex gap-1 mt-2">
                                  <span className={`px-2 py-0.5 rounded text-xs ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                  </span>
                                  {task.category && (
                                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800">
                                      {task.category}
                                    </span>
                                  )}
                                </div>
                                {task.dueDate && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    📅 {new Date(task.dueDate).toLocaleDateString('es-AR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Done */}
                    <div className="bg-cyan-50 rounded-xl p-4 border-2 border-cyan-300">
                      <h4 className="font-semibold text-cyan-700 mb-3 flex items-center gap-2">
                        <span className="w-3 h-3 bg-cyan-500 rounded-full"></span>
                        Done ({tasks.filter(t => t.completed).length})
                      </h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {tasks.filter(t => t.completed).map(task => (
                          <div key={task.id} className="bg-white p-3 rounded-lg shadow-sm border border-cyan-200 hover:shadow-md transition-shadow opacity-75">
                            <div className="flex items-start gap-2">
                              <input 
                                type="checkbox" 
                                checked={true}
                                onChange={() => toggleTask(task.id, task.completed)}
                                className="mt-1 w-4 h-4"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-500 line-through">{task.title}</p>
                                <div className="flex gap-1 mt-2">
                                  <span className={`px-2 py-0.5 rounded text-xs ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                  </span>
                                  {task.category && (
                                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800">
                                      {task.category}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Vista de Gráficos */}
              {activeView === 'charts' && stats && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">📊 Gráficos de Productividad</h3>
                  
                  {/* Gráfico de Completitud */}
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-6 rounded-xl border border-cyan-200">
                    <h4 className="font-semibold text-cyan-900 mb-4">Tasa de Completitud General</h4>
                    <div className="relative">
                      <div className="h-8 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all duration-1000 flex items-center justify-end pr-3"
                          style={{ width: `${stats.completionRate}%` }}
                        >
                          <span className="text-white font-bold text-sm">{stats.completionRate.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-between text-sm text-gray-600">
                        <span>{stats.completedTasks} completadas</span>
                        <span>{stats.pendingTasks} pendientes</span>
                      </div>
                    </div>
                  </div>

                  {/* Gráfico por Categorías */}
                  {stats.byCategory && Object.keys(stats.byCategory).length > 0 && (
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-xl border border-indigo-200">
                      <h4 className="font-semibold text-indigo-900 mb-4">Completitud por Categoría</h4>
                      <div className="space-y-3">
                        {Object.entries(stats.byCategory).map(([cat, data]: any) => (
                          <div key={cat}>
                            <div className="flex justify-between mb-1">
                              <span className="capitalize text-sm font-medium text-gray-700">{cat}</span>
                              <span className="text-sm text-gray-600">{data.completionRate.toFixed(0)}%</span>
                            </div>
                            <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-1000 flex items-center justify-end pr-2"
                                style={{ width: `${data.completionRate}%` }}
                              >
                                {data.completionRate > 15 && (
                                  <span className="text-white font-bold text-xs">{data.completed}/{data.total}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tendencia Visual */}
                  {stats.productivityTrend && (
                    <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-6 rounded-xl border border-cyan-200">
                      <h4 className="font-semibold text-cyan-900 mb-4">Tendencia de Productividad (últimas 2 semanas)</h4>
                      <div className="flex items-end justify-around h-40 gap-4">
                        <div className="flex-1 flex flex-col items-center">
                          <div className="w-full bg-gradient-to-t from-gray-400 to-gray-500 rounded-t-lg" 
                               style={{ height: `${(stats.productivityTrend.previous / Math.max(stats.productivityTrend.previous, stats.productivityTrend.current, 1)) * 100}%` }}>
                          </div>
                          <p className="text-sm font-semibold text-gray-700 mt-2">Semana Anterior</p>
                          <p className="text-2xl font-bold text-gray-600">{stats.productivityTrend.previous}</p>
                        </div>
                        <div className="flex-1 flex flex-col items-center">
                          <div className="w-full bg-gradient-to-t from-cyan-500 to-cyan-600 rounded-t-lg" 
                               style={{ height: `${(stats.productivityTrend.current / Math.max(stats.productivityTrend.previous, stats.productivityTrend.current, 1)) * 100}%` }}>
                          </div>
                          <p className="text-sm font-semibold text-cyan-700 mt-2">Última Semana</p>
                          <p className="text-2xl font-bold text-cyan-600">{stats.productivityTrend.current}</p>
                        </div>
                      </div>
                      <div className="mt-4 text-center">
                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold ${
                          stats.productivityTrend.status === 'mejorando' ? 'bg-cyan-200 text-cyan-800' :
                          stats.productivityTrend.status === 'empeorando' ? 'bg-gray-200 text-gray-800' :
                          'bg-gray-200 text-gray-800'
                        }`}>
                          {stats.productivityTrend.status === 'mejorando' && '↗️ Mejorando'}
                          {stats.productivityTrend.status === 'empeorando' && '↘️ Empeorando'}
                          {stats.productivityTrend.status === 'estable' && '→ Estable'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeView === 'charts' && !stats && (
                <div className="text-center text-gray-500 py-12">
                  <div className="text-6xl mb-4">📊</div>
                  <p className="text-lg font-semibold">Cargando estadísticas...</p>
                  <button
                    onClick={loadStats}
                    className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Cargar Gráficos
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
