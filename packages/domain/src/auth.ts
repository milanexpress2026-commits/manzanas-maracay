import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._@+-]*$/, 'Usa letras, números, punto, guion o correo para el usuario.');
export const loginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1).max(256),
    rememberSession: z.boolean().default(false),
  })
  .strict();
export const invitationSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(2).max(100),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(256),
  })
  .strict();
export type SessionUser = { id: string; username: string; displayName: string };
export const appEnvironmentSchema = z.enum(['local', 'test', 'staging', 'production']);
export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type SessionInfo = {
  user: SessionUser;
  environment: AppEnvironment;
  operationsReady: boolean;
};
