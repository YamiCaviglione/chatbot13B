import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "El título es obligatorio"),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().datetime().optional(),
  category: z.enum(["work", "personal", "shopping", "health", "other"]).optional(),
});

export const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().optional(),
  completed: z.boolean().optional(),
  status: z.enum(["pending", "inProgress", "completed"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().datetime().optional(),
  category: z.enum(["work", "personal", "shopping", "health", "other"]).optional(),
});

export const searchTaskSchema = z.object({
  query: z.string().optional(),
  completed: z.boolean().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.number().optional(),
});
