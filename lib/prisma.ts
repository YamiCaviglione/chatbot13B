import { PrismaClient } from "@prisma/client";

// Declaracion global para evitar multiples instancias de Prisma Client en desarrollo
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Instancia unica de Prisma Client (patron Singleton)
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error"],
  });

// En desarrollo, guardar la instancia en el objeto global para hot-reloading
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Export por defecto para compatibilidad con diferentes estilos de import
export default prisma;
