import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-4-hydrogen'),
  USDA_FDC_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = ServerEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-4-hydrogen',
    USDA_FDC_API_KEY: process.env.USDA_FDC_API_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000',
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function isRealCredential(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('MY_') || trimmed === 'placeholder' || trimmed === 'your_key_here') {
    return false;
  }
  return true;
}

export interface SystemConfigStatus {
  geminiConfigured: boolean;
  geminiModel: string;
  usdaConfigured: boolean;
  telegramConfigured: boolean;
  telegramWebhookSecretConfigured: boolean;
  telegramBotUsername: string | null;
  whatsappConfigured: boolean;
  cronSecretConfigured: boolean;
}

export function getSystemConfigStatus(): SystemConfigStatus {
  const env = getServerEnv();
  return {
    geminiConfigured: isRealCredential(env.GEMINI_API_KEY),
    geminiModel: env.GEMINI_MODEL || 'gemini-4-hydrogen',
    usdaConfigured: isRealCredential(env.USDA_FDC_API_KEY),
    telegramConfigured: isRealCredential(env.TELEGRAM_BOT_TOKEN),
    telegramWebhookSecretConfigured: isRealCredential(env.TELEGRAM_WEBHOOK_SECRET),
    telegramBotUsername: isRealCredential(env.TELEGRAM_BOT_USERNAME) ? env.TELEGRAM_BOT_USERNAME! : null,
    whatsappConfigured:
      isRealCredential(env.WHATSAPP_ACCESS_TOKEN) && isRealCredential(env.WHATSAPP_PHONE_NUMBER_ID),
    cronSecretConfigured: isRealCredential(env.CRON_SECRET),
  };
}
