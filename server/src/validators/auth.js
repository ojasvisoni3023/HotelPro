import { z } from 'zod';
import { email, name, password, phone } from './common.js';

export const registerSchema = z.object({
  name,
  email,
  password,
  phone,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({ token: z.string().min(20).max(200), password });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const profileSchema = z
  .object({
    name: name.optional(),
    phone,
    address: z
      .object({
        line1: z.string().trim().max(120).optional(),
        city: z.string().trim().max(60).optional(),
        state: z.string().trim().max(60).optional(),
        country: z.string().trim().max(60).optional(),
        postalCode: z.string().trim().max(12).optional(),
      })
      .optional(),
  })
  .strict();
