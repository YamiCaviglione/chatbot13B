import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().min(1, "El título es obligatorio"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z
    .string()
    .datetime()
    .optional()
    .refine((date) => !date || new Date(date) > new Date(), {
      message: "La fecha debe ser futura",
    }),
  category: z
    .enum(["work", "personal", "shopping", "health", "other"])
    .default("other"),
  completed: z.boolean().optional(),
});
