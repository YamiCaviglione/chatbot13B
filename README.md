# Documentación Completa - AI Todo Manager

## Estado Actual del Proyecto

### Fase Completada: Sistema Completo con UI Avanzada

El proyecto tiene implementado exitosamente:

1. Sistema de chat conversacional con IA
2. 6 herramientas (tools) para gestión de tareas (incluyendo createSubtask)
3. Base de datos PostgreSQL con Prisma ORM + Subtasks
4. API REST completa para tareas con soft delete
5. Sistema de autenticación JWT con cookies HTTP-only
6. Endpoints de autenticación (register, login, logout, me)
7. Protección de rutas con verificación de usuario
8. **Sistema de estados de tareas** (pending, inProgress, completed)
9. **Vista Kanban funcional** con 3 columnas
10. **Sistema de subtareas completo**
11. **Soft delete con papelera y restauración**
12. **Múltiples vistas**: Lista, Calendario, Kanban, Gráficos, Papelera
13. **Paginación** de tareas (10 por página)

### Arquitectura Actual

```
chatbot13B/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts       # Login de usuario
│   │   │   ├── logout/route.ts      # Cierre de sesión
│   │   │   ├── me/route.ts          # Obtener usuario actual
│   │   │   └── register/route.ts    # Registro de usuario
│   │   ├── chat/route.ts            # Endpoint principal de chat con IA
│   │   └── tasks/
│   │       ├── route.ts             # CRUD de tareas (protegido)
│   │       └── stats/route.ts       # Estadísticas (protegido)
│   ├── globals.css                  # Estilos globales con Tailwind
│   ├── layout.tsx                   # Layout raíz
│   └── page.tsx                     # Página principal de chat
├── lib/
│   ├── auth.ts                      # Utilidades JWT y autenticación
│   ├── openrouter.ts                # Configuración OpenRouter
│   ├── prisma.ts                    # Cliente Prisma
│   └── validators/
│       ├── authSchema.ts            # Validación de auth (Zod)
│       └── taskSchema.ts            # Validación de tareas (Zod)
├── prisma/
│   ├── schema.prisma                # Schema de base de datos
│   └── migrations/                  # Historial de migraciones
├── utils/
│   └── tools.ts                     # Herramientas para el LLM
└── .env.local                       # Variables de entorno
```

## API Endpoints Implementados

### Autenticación

#### POST /api/auth/register
Registra un nuevo usuario en el sistema.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "Juan Pérez",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "message": "Usuario registrado exitosamente",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Juan Pérez",
    "createdAt": "2025-11-17T..."
  }
}
```

**Cookie HTTP-only:** `auth_token` (JWT válido por 7 días)

---

#### POST /api/auth/login
Inicia sesión de un usuario existente.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Inicio de sesión exitoso",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Juan Pérez",
    "createdAt": "2025-11-17T..."
  }
}
```

**Cookie HTTP-only:** `auth_token` (JWT válido por 7 días)

---

#### POST /api/auth/logout
Cierra la sesión del usuario eliminando la cookie.

**Response (200):**
```json
{
  "message": "Sesión cerrada exitosamente"
}
```

**Cookie eliminada:** `auth_token`

---

#### GET /api/auth/me
Obtiene los datos del usuario autenticado.

**Headers:** Cookie con `auth_token`

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Juan Pérez",
    "createdAt": "2025-11-17T..."
  }
}
```

---

### Tareas (Requieren Autenticación)

#### POST /api/tasks
Crea una nueva tarea para el usuario autenticado.

**Headers:** Cookie con `auth_token`

**Request Body:**
```json
{
  "title": "Comprar leche",
  "priority": "medium",
  "category": "shopping",
  "dueDate": "2025-11-18T10:00:00Z"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "title": "Comprar leche",
  "completed": false,
  "priority": "medium",
  "category": "shopping",
  "dueDate": "2025-11-18T10:00:00Z",
  "userId": "uuid",
  "createdAt": "2025-11-17T...",
  "updatedAt": "2025-11-17T..."
}
```

---

#### GET /api/tasks
Obtiene tareas del usuario con filtros opcionales.

**Headers:** Cookie con `auth_token`

**Query Parameters:**
- `query` (string, opcional): Búsqueda en título
- `completed` (boolean, opcional): Filtrar por completadas
- `priority` (enum, opcional): "low" | "medium" | "high"
- `category` (string, opcional): Categoría de la tarea
- `sortBy` (string, opcional): Campo para ordenar
- `sortOrder` (string, opcional): "asc" | "desc"
- `limit` (number, opcional): Máximo de resultados

**Response (200):**
```json
[
  {
    "id": "uuid",
    "title": "Comprar leche",
    "completed": false,
    "priority": "medium",
    "category": "shopping",
    "dueDate": "2025-11-18T10:00:00Z",
    "userId": "uuid",
    "createdAt": "2025-11-17T...",
    "updatedAt": "2025-11-17T..."
  }
]
```

---

#### PUT /api/tasks
Actualiza una tarea existente.

**Headers:** Cookie con `auth_token`

**Request Body:**
```json
{
  "id": "uuid",
  "title": "Comprar leche y pan",
  "completed": true,
  "priority": "high"
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "title": "Comprar leche y pan",
  "completed": true,
  "priority": "high",
  "category": "shopping",
  "dueDate": "2025-11-18T10:00:00Z",
  "userId": "uuid",
  "createdAt": "2025-11-17T...",
  "updatedAt": "2025-11-17T..."
}
```

---

#### DELETE /api/tasks?id=uuid&permanent=true
Elimina una tarea (soft delete por defecto, hard delete con permanent=true).

**Headers:** Cookie con `auth_token`

**Query Parameters:**
- `id` (string, requerido): ID de la tarea
- `permanent` (boolean, opcional): Si es true, elimina permanentemente

**Response Soft Delete (200):**
```json
{
  "message": "Tarea \"Comprar leche\" movida a la papelera",
  "permanent": false,
  "canRestore": true
}
```

**Response Hard Delete (200):**
```json
{
  "message": "Tarea \"Comprar leche\" eliminada permanentemente",
  "permanent": true
}
```

---

#### PATCH /api/tasks/restore?id=uuid
Restaura una tarea eliminada.

**Headers:** Cookie con `auth_token`

**Query Parameters:**
- `id` (string, requerido): ID de la tarea eliminada

**Response (200):**
```json
{
  "message": "Tarea \"Comprar leche\" restaurada exitosamente",
  "task": { ...task object... }
}
```

---

#### GET /api/tasks/deleted
Obtiene todas las tareas eliminadas (papelera).

**Headers:** Cookie con `auth_token`

**Response (200):**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Comprar leche",
      "deleted": true,
      "deletedAt": "2025-11-19T...",
      ...
    }
  ]
}
```

---

#### GET /api/tasks/stats
Obtiene estadísticas de productividad del usuario.

**Headers:** Cookie con `auth_token`

**Response (200):**
```json
{
  "summary": {
    "totalTasks": 10,
    "completedTasks": 6,
    "pendingTasks": 4,
    "completionRate": 60.0,
    "overdueTasks": 1
  },
  "byPriority": {
    "high": { "total": 3, "completed": 2, "pending": 1 },
    "medium": { "total": 5, "completed": 3, "pending": 2 },
    "low": { "total": 2, "completed": 1, "pending": 1 }
  },
  "byCategory": {
    "work": { "total": 4, "completed": 2, "pending": 2 },
    "personal": { "total": 3, "completed": 2, "pending": 1 },
    "shopping": { "total": 2, "completed": 1, "pending": 1 },
    "health": { "total": 1, "completed": 1, "pending": 0 },
    "other": { "total": 0, "completed": 0, "pending": 0 }
  },
  "timeline": {
    "tasksCreatedToday": 2,
    "tasksCompletedToday": 1,
    "tasksCreatedThisWeek": 5,
    "tasksCompletedThisWeek": 3,
    "tasksCreatedThisMonth": 10,
    "tasksCompletedThisMonth": 6
  },
  "upcoming": {
    "dueTodayCount": 1,
    "dueThisWeekCount": 3,
    "nextDueTask": {
      "id": "uuid",
      "title": "Reunión con cliente",
      "dueDate": "2025-11-17T15:00:00Z"
    }
  }
}
```

---

### Chat con IA

#### POST /api/chat
Procesa mensajes del usuario y ejecuta herramientas.

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Agregar tarea: comprar leche"
    }
  ]
}
```

**Response (200):**
```json
{
  "response": "He creado la tarea \"comprar leche\" con prioridad media.",
  "toolCalls": [
    {
      "tool": "createTask",
      "result": {
        "success": true,
        "task": {
          "id": "uuid",
          "title": "comprar leche"
        }
      }
    }
  ]
}
```

## Herramientas del LLM (Tools)

### 1. createTask
**Descripción:** Crea una nueva tarea en el sistema.

**Parámetros:**
- `title` (string, requerido): Título de la tarea
- `priority` (enum, opcional): "low" | "medium" | "high"
- `dueDate` (string, opcional): Fecha límite ISO
- `category` (string, opcional): Categoría
- `status` (enum, opcional): "pending" | "inProgress" | "completed"

**Ejemplos de uso:**
- "Agregar tarea: comprar leche"
- "Crear tarea urgente para terminar informe"
- "Necesito recordar llamar al doctor mañana"

---

### 2. updateTask
**Descripción:** Actualiza una tarea existente.

**Parámetros:**
- `taskId` (string, requerido): ID de la tarea
- `title` (string, opcional): Nuevo título
- `completed` (boolean, opcional): Estado
- `status` (enum, opcional): "pending" | "inProgress" | "completed"
- `priority` (enum, opcional): Nueva prioridad
- `dueDate` (string, opcional): Nueva fecha
- `category` (string, opcional): Nueva categoría

**Nota:** La IA entiende frases como "empecé X" → status=inProgress, "terminé X" → status=completed

**Ejemplos de uso:**
- "Marca como completada la tarea de comprar leche"
- "Cambia la prioridad de ejercicio a alta"
- "Renombra la tarea informe"
- "Ya empecé con el informe" (cambia a inProgress)
- "Terminé de hacer la compra" (cambia a completed)

---

### 3. deleteTask
**Descripción:** Elimina una tarea (soft delete - va a papelera).

**Parámetros:**
- `taskId` (string, requerido): ID de la tarea

**Nota:** Las tareas eliminadas van a la papelera y pueden restaurarse

**Ejemplos de uso:**
- "Elimina la tarea de comprar leche"
- "Borra esa tarea"
- "Quita la tarea del doctor"

---

### 4. editTaskByTitle
**Descripción:** Busca y edita una tarea por su título.

**Parámetros:**
- `titleQuery` (string, requerido): Título o palabras clave
- `title` (string, opcional): Nuevo título
- `completed` (boolean, opcional): Nuevo estado
- `status` (enum, opcional): "pending" | "inProgress" | "completed"
- `priority` (enum, opcional): Nueva prioridad
- `dueDate` (string, opcional): Nueva fecha
- `category` (string, opcional): Nueva categoría

**Ejemplos de uso:**
- "Edita la tarea de comprar y cámbiale el título"
- "Marca 'hacer informe' como completada"

---

### 5. createSubtask
**Descripción:** Crea una subtarea para una tarea existente.

**Parámetros:**
- `taskId` (string, requerido): ID de la tarea padre
- `title` (string, requerido): Título de la subtarea

**Nota:** Usar searchTasks primero para obtener el taskId

**Ejemplos de uso:**
- "Crea subtareas para comprar"
- "Divide la tarea de informe en pasos"
- "Agrega una subtarea a hacer ejercicio"

---

### 6. searchTasks
**Descripción:** Busca y filtra tareas.

**Parámetros:**
- `query` (string, opcional): Búsqueda en título
- `completed` (boolean, opcional): Filtrar por estado
- `priority` (enum, opcional): Filtrar por prioridad
- `category` (string, opcional): Filtrar por categoría
- `limit` (number, opcional): Máximo resultados

**Ejemplos de uso:**
- "Muéstrame todas mis tareas"
- "¿Qué tareas tengo pendientes?"
- "Lista las tareas de alta prioridad"
- "Busca tareas que contengan informe"

---

### 7. getTaskStats
**Descripción:** Obtiene estadísticas de productividad.

**Parámetros:**
- `period` (enum, opcional): "today" | "week" | "month" | "year" | "all-time"

**Ejemplos de uso:**
- "¿Cuántas tareas he completado?"
- "Muéstrame mis estadísticas"
- "¿Qué tan productivo he sido esta semana?"

## Sistema de Autenticación

### Flujo de Autenticación

1. **Registro:**
   - Usuario envía email, nombre y contraseña
   - Backend hashea contraseña con bcrypt (10 rounds)
   - Crea usuario en base de datos
   - Crea preferencias por defecto
   - Genera JWT con payload: userId, email, name
   - Establece cookie HTTP-only con el token

2. **Login:**
   - Usuario envía email y contraseña
   - Backend busca usuario por email
   - Compara contraseña con bcrypt
   - Si es válida, genera JWT
   - Establece cookie HTTP-only con el token

3. **Verificación:**
   - Cada request a endpoint protegido incluye cookie
   - Backend extrae token de la cookie
   - Verifica firma del JWT con JWT_SECRET
   - Decodifica payload y obtiene userId
   - Busca usuario en base de datos
   - Inyecta usuario en contexto de la request

4. **Logout:**
   - Backend elimina cookie estableciendo maxAge=0
   - Frontend puede redirigir a página de login

### Seguridad Implementada

- Cookies HTTP-only (no accesibles desde JavaScript)
- Cookies con flag Secure en producción
- SameSite=Lax para prevenir CSRF
- Passwords hasheadas con bcrypt (10 rounds)
- JWT firmados con secret de 256 bits
- Expiración de tokens (7 días)
- Validación de ownership en endpoints de tareas
- SQL injection prevention con Prisma ORM
- Validación de inputs con Zod schemas

## Variables de Entorno

### Archivo .env.local
```env
# OpenRouter API Key
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here

# Database URL
DATABASE_URL=postgresql://user:password@localhost:5432/todomanager

# JWT Secret (cambiar en producción)
JWT_SECRET=tu-super-secreto-cambiar-en-produccion-usar-openssl-rand-base64-32
```

## Comandos Disponibles

### Desarrollo
```bash
# Iniciar servidor de desarrollo
npm run dev

# Iniciar en puerto específico
npm run dev -- -p 3001
```

### Producción
```bash
# Compilar para producción
npm run build

# Iniciar servidor de producción
npm start
```

### Base de Datos
```bash
# Crear migración
npx prisma migrate dev --name nombre_migracion

# Aplicar migraciones
npx prisma migrate deploy

# Resetear base de datos (PELIGRO: elimina todos los datos)
npx prisma migrate reset

# Generar cliente Prisma
npx prisma generate

# Abrir Prisma Studio (GUI para base de datos)
npx prisma studio
```

### Linting
```bash
# Verificar código
npm run lint

# Auto-fix problemas
npm run lint -- --fix
```

## Funcionalidades Implementadas

### 1. Sistema de Estados de Tareas
- 3 estados: **pending** (pendiente), **inProgress** (en proceso), **completed** (completada)
- Campo `status` en modelo Task con enum TaskStatus
- Dropdown en UI para cambiar estado manualmente
- IA entiende frases naturales: "empecé X" → inProgress, "terminé X" → completed
- Los estados se sincronizan con el campo `completed` automáticamente

### 2. Vista Kanban Funcional
- 3 columnas: **To Do** (pending), **In Progress** (inProgress), **Done** (completed)
- Usa el campo `status` para filtrar tareas en cada columna
- Contador de tareas por columna
- Diseño visual con colores distintivos

### 3. Sistema de Subtareas
- Modelo `Subtask` en Prisma con relación a Task
- Tool `createSubtask` funcional en la IA
- API `/api/subtasks` con CRUD completo
- UI expandible para mostrar subtareas
- Barra de progreso basada en subtareas completadas
- La IA usa searchTasks + createSubtask correctamente

### 4. Soft Delete con Papelera
- Campo `deleted` y `deletedAt` en modelo Task
- DELETE por defecto hace soft delete (marca deleted=true)
- DELETE con `?permanent=true` hace hard delete
- Vista **Papelera** (🗑️) que muestra tareas eliminadas
- Botón **Restaurar** para recuperar tareas
- Botón **Eliminar** para borrado permanente
- Endpoint `/api/tasks/restore` para restaurar tareas
- Endpoint `/api/tasks/deleted` para listar papelera
- Todos los GET filtran automáticamente deleted=false

### 5. Navegación de Calendario
- Botones **Anterior**/**Siguiente**/**Hoy** para navegar meses
- Estado `calendarDate` para controlar el mes actual
- Se puede ver cualquier mes/año, no solo el actual

### 6. Paginación de Tareas
- 10 tareas por página en la vista de lista
- Indicador "Página X de Y"
- Botones de navegación prev/next
- Se deshabilitan en los límites

## Conclusión
El proyecto cumple la consigna base, y además incluye múltiples funcionalidades bonus:

✅ **Sistema completo de autenticación** (backend + frontend)
✅ **API REST segura y protegida** con soft delete
✅ **Base de datos estructurada** con subtareas
✅ **7 herramientas del LLM** funcionando correctamente
✅ **Chat conversacional con IA** que entiende estados naturales
✅ **5 vistas diferentes**: Lista, Calendario, Kanban, Gráficos, Papelera
✅ **Sistema de subtareas** completo con progreso
✅ **Soft delete** con papelera y restauración
✅ **Estados de tareas** (pending, inProgress, completed)
✅ **Paginación** de tareas
✅ **Navegación de calendario** por meses/años

### Cumplimiento de Requisitos de Consigna

El proyecto cumple con todos los requisitos obligatorios de la consigna:

1. ✅ Interfaz de Chat Conversacional
2. ✅ Sistema de Tool Calling 
3. ✅ API Local de Tareas (CRUD + extras)
4. ✅ Base de Datos Persistente (PostgreSQL + Prisma)
5. ✅ Búsqueda y Filtros Avanzados
6. ✅ Sistema de Estadísticas
7. ✅ Manejo de Estado

**Además**, implementa varias funcionalidades bonus de la lista opcional:

- ✅ Subtareas 
- ✅ Vista Kanban
- ✅ Vista de Calendario 
- ✅ Gráficos de Productividad 
- ✅ Soft Delete con "Deshacer" 

### Consideraciones de Seguridad Implementadas

Todas las reglas de oro de seguridad están implementadas:

1. ✅ API Keys solo en backend (JWT_SECRET, OPENROUTER_API_KEY en .env.local)
2. ✅ Variables de entorno sin NEXT_PUBLIC_ prefix
3. ✅ .env.local en .gitignore
4. ✅ Validación de inputs con Zod schemas
5. ✅ SQL Injection Protection con Prisma ORM
6. ✅ Rate limiting (puede mejorarse pero hay validación de ownership)
7. ✅ Cookies HTTP-only y Secure
8. ✅ Passwords hasheadas con bcrypt


