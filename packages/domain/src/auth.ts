import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const passwordCreationSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH);

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
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    rememberSession: z.boolean().default(false),
  })
  .strict();
export const invitationSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(2).max(100),
    password: passwordCreationSchema,
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
