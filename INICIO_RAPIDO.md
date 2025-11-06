# Guia Rapida de Inicio - AI Todo Manager Backend

## Pre-requisitos

- Node.js 18 o superior instalado
- npm o yarn
- Editor de codigo (VS Code recomendado)

## Pasos para Iniciar el Proyecto

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Abre el archivo `.env.local` y configura tus API keys:

```env
# Base de datos (ya configurado para SQLite)
DATABASE_URL="file:./dev.db"

# OpenRouter (para /api/ai)
OPENROUTER_API_KEY=tu-api-key-de-openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# OpenAI (para /api/chat)
OPENAI_API_KEY=tu-api-key-de-openai
```

**Como obtener las API keys:**
- OpenRouter: https://openrouter.ai/keys
- OpenAI: https://platform.openai.com/api-keys

### 3. Configurar Base de Datos

```bash
# Generar cliente Prisma
npx prisma generate

# Aplicar migraciones
npx prisma migrate dev

# (Opcional) Ver la base de datos en navegador
npx prisma studio
```

### 4. Iniciar Servidor de Desarrollo

```bash
npm run dev
```

El servidor estara disponible en: http://localhost:3000

---

## Verificacion de Funcionamiento

### Test 1: Crear una tarea manualmente

```bash
# PowerShell
$body = @{
    title = "Mi primera tarea"
    priority = "high"
    category = "work"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tasks" -Method POST -Body $body -ContentType "application/json"
```

### Test 2: Listar tareas

```bash
Invoke-RestMethod -Uri "http://localhost:3000/api/tasks" -Method GET
```

### Test 3: Obtener estadisticas

```bash
Invoke-RestMethod -Uri "http://localhost:3000/api/tasks/stats" -Method GET
```

### Test 4: Chat con IA (requiere API key configurada)

```bash
$chatBody = @{
    messages = @(
        @{
            role = "user"
            content = "Crea una tarea para comprar leche"
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3000/api/chat" -Method POST -Body $chatBody -ContentType "application/json"
```

---

## Estructura del Proyecto

```
chatbot13B/
├── app/
│   └── api/
│       ├── chat/        # Vercel AI SDK endpoint
│       │   └── route.ts
│       ├── ai/          # OpenRouter endpoint
│       │   └── route.ts
│       └── tasks/       # CRUD de tareas
│           ├── route.ts
│           └── stats/
│               └── route.ts
├── lib/
│   ├── prisma.ts        # Cliente Prisma
│   └── validators/      # Schemas Zod
│       └── taskSchema.ts
├── utils/
│   ├── openrouter.ts    # Cliente OpenRouter
│   └── tools.ts         # Funciones de tools
├── prisma/
│   ├── schema.prisma    # Schema de base de datos
│   └── migrations/      # Migraciones
├── .env.local           # Variables de entorno
├── package.json
└── BACKEND_DOCS.md      # Documentacion completa
```

---

## Endpoints Disponibles

### CRUD de Tareas

- `POST /api/tasks` - Crear tarea
- `GET /api/tasks` - Listar tareas (con filtros opcionales)
- `PUT /api/tasks` - Actualizar tarea
- `DELETE /api/tasks?id=...` - Eliminar tarea
- `GET /api/tasks/stats` - Obtener estadisticas

### Chat con IA

- `POST /api/chat` - Chat con Vercel AI SDK (streaming)
- `POST /api/ai` - Chat con OpenRouter directo

---

## Solucion de Problemas

### Error: "Cannot find module '@prisma/client'"

```bash
npx prisma generate
```

### Error: "Environment variable not found: DATABASE_URL"

Asegurate de que el archivo `.env.local` exista y tenga la variable configurada.

### Error: "No Prisma Client found"

```bash
npm install @prisma/client
npx prisma generate
```

### Puerto 3000 ya en uso

Cambia el puerto en el comando:
```bash
npm run dev -- -p 3001
```

---

## Comandos Utiles

```bash
# Ver base de datos en navegador
npx prisma studio

# Resetear base de datos
npx prisma migrate reset

# Ver logs de Next.js
npm run dev

# Compilar para produccion
npm run build
npm start

# Linter
npm run lint
```

---

## Siguiente Paso: Desarrollar el Frontend

El backend esta completamente funcional. Ahora puedes:

1. Crear componentes de React en `app/`
2. Usar el hook `useChat` de Vercel AI SDK
3. Conectar los endpoints de tareas
4. Diseñar la UI con TailwindCSS

Ver `BACKEND_DOCS.md` para detalles completos.

---

## Soporte

Si encuentras errores:
1. Revisa la consola del servidor
2. Verifica las variables de entorno
3. Asegurate de que Prisma este generado
4. Revisa `BACKEND_DOCS.md` para mas detalles

---

**El backend esta listo para usar!**
