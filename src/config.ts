import dotenv from "dotenv";
dotenv.config();
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MAILGUN_API_KEY: z.string().min(1),
  MAILGUN_DOMAIN: z.string().min(1),
  MAILGUN_WEBHOOK_SIGNING_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().default("https://jlkognkltdkzerzpcqpu.supabase.co"),
  SUPABASE_ANON_KEY: z.string().min(1).default("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impsa29nbmtsdGRremVyenBjcXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTEwMjksImV4cCI6MjA4NTk4NzAyOX0.uqGEaFxmwInG3m5_dx5ZPEv7ex0a4AbIq2-fk2gkH7U"),
  IMESSAGE_GATEWAY_URL: z.string().url().optional(),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export const env = envSchema.parse(process.env);
