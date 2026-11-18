import { z } from 'zod';

export const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

export const AccountTypeSchema = z.enum(['cash', 'bank', 'ewallet', 'other']);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const TransactionTypeSchema = z.enum(['income', 'expense', 'transfer']);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const CategoryKindSchema = z.enum(['income', 'expense']);
export type CategoryKind = z.infer<typeof CategoryKindSchema>;

export const MealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drinks']);
export type MealType = z.infer<typeof MealTypeSchema>;

export const MatchStatusSchema = z.enum([
  'verified_match',
  'estimated_portion',
  'uncertain',
  'unavailable',
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const AccountInputSchema = z.object({
  id: z.string().max(128).regex(ID_PATTERN).optional(),
  name: z.string().trim().min(1, 'Nama akun wajib diisi').max(60, 'Nama akun maksimal 60 karakter'),
  type: AccountTypeSchema,
  openingBalance: z
    .number()
    .int('Saldo awal harus berupa bilangan bulat Rupiah')
    .min(-1_000_000_000_000)
    .max(1_000_000_000_000),
  currency: z.string().default('IDR'),
  isArchived: z.boolean().default(false),
});
export type AccountInput = z.infer<typeof AccountInputSchema>;

export interface AccountRecord extends AccountInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export const CategoryInputSchema = z.object({
  id: z.string().max(128).regex(ID_PATTERN).optional(),
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').max(60),
  kind: CategoryKindSchema,
  groupName: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(40).default('Tag'),
  color: z.string().trim().min(1).max(32).default('emerald'),
  isSystem: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(100),
});
export type CategoryInput = z.infer<typeof CategoryInputSchema>;

export interface CategoryRecord extends CategoryInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export const TransactionInputSchema = z
  .object({
    id: z.string().max(128).regex(ID_PATTERN).optional(),
    type: TransactionTypeSchema,
    amount: z
      .number()
      .int('Nominal harus berupa bilangan bulat Rupiah')
      .positive('Nominal transaksi harus lebih besar dari Rp 0')
      .max(1_000_000_000_000),
    accountId: z.string().min(1, 'Pilih akun sumber').max(128).regex(ID_PATTERN),
    toAccountId: z.string().max(128).default(''),
    categoryId: z.string().max(128).default(''),
    description: z.string().trim().max(160, 'Deskripsi maksimal 160 karakter').default(''),
    merchant: z.string().trim().max(100).default(''),
    paymentMethod: z.string().trim().max(40).default('Tunai'),
    occurredAt: z.string().min(10, 'Waktu transaksi wajib diisi').max(40),
    notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').default(''),
    clientId: z.string().max(128).regex(ID_PATTERN).optional(),
    linkedFoodLogId: z.string().max(128).default(''),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'transfer') {
      if (!val.toAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toAccountId'],
          message: 'Akun tujuan wajib dipilih untuk transfer',
        });
      } else if (val.toAccountId === val.accountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['toAccountId'],
          message: 'Transfer tidak boleh ke akun yang sama',
        });
      }
    } else if (!val.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryId'],
        message: 'Kategori wajib dipilih untuk pemasukan atau pengeluaran',
      });
    }
  });

export type TransactionInput = z.infer<typeof TransactionInputSchema>;

export interface TransactionRecord {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  description: string;
  merchant: string;
  paymentMethod: string;
  occurredAt: string;
  notes: string;
  clientId: string;
  linkedFoodLogId: string;
  syncStatus?: 'synced' | 'pending_sync' | 'sync_error';
  createdAt: string;
  updatedAt: string;
}

export const BudgetInputSchema = z
  .object({
    id: z.string().max(128).regex(ID_PATTERN).optional(),
    name: z.string().trim().min(1, 'Nama anggaran wajib diisi').max(80),
    scope: z.enum(['total', 'category']),
    categoryId: z.string().max(128).default(''),
    period: z.enum(['weekly', 'monthly']),
    limitAmount: z
      .number()
      .int('Batas anggaran harus bilangan bulat Rupiah')
      .positive('Batas anggaran harus > Rp 0')
      .max(1_000_000_000_000),
    alertThresholds: z.array(z.number().int().min(1).max(200)).min(1).max(5).default([50, 80, 100]),
  })
  .superRefine((val, ctx) => {
    if (val.scope === 'category' && !val.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryId'],
        message: 'Pilih kategori untuk anggaran spesifik kategori',
      });
    }
  });

export type BudgetInput = z.infer<typeof BudgetInputSchema>;

export interface BudgetRecord extends BudgetInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export const GeminiDetectedComponentSchema = z.object({
  nameId: z.string().min(1).max(100),
  nameEn: z.string().min(1).max(100),
  estimatedGrams: z.number().min(1).max(3000),
  gramsMin: z.number().min(1).max(3000),
  gramsMax: z.number().min(1).max(5000),
  cookingMethod: z.enum(['goreng', 'rebus', 'bakar', 'kukus', 'tumis', 'mentah', 'lainnya']),
  confidence: z.number().min(0).max(1),
  uncertaintyNote: z.string().max(240).default(''),
});

export const GeminiFoodDetectionSchema = z.object({
  isFoodImage: z.boolean(),
  rejectionReason: z.string().max(240).default(''),
  mealTitleSuggestion: z.string().max(120).default(''),
  components: z.array(GeminiDetectedComponentSchema).max(15),
});
export type GeminiFoodDetection = z.infer<typeof GeminiFoodDetectionSchema>;

export interface FoodItemMatch {
  id: string;
  nameDetected: string;
  nameConfirmed: string;
  cookingMethod: string;
  quantityGrams: number;
  servingUnit: string;
  sourceCode: 'tkpi_kemenkes' | 'usda_fdc' | 'unavailable';
  sourceName: string;
  sourceMatchId: string;
  matchStatus: MatchStatus;
  confidence: number;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  uncertaintyNote?: string;
}

export interface FoodLogRecord {
  id: string;
  userId: string;
  mealType: MealType;
  title: string;
  eatenAt: string;
  transactionId: string;
  userConfirmed: boolean;
  modelName: string;
  items: FoodItemMatch[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  totalSodiumMg: number;
  validItemCount: number;
  totalItemCount: number;
  itemsSummary: string;
  createdAt: string;
  updatedAt: string;
}

export const ReportPreferenceInputSchema = z.object({
  id: z.string().max(128).regex(ID_PATTERN).optional(),
  reportType: z.enum(['financial', 'nutrition']),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'custom_cron']),
  customCron: z.string().max(64).default('0 20 * * *'),
  sendTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format jam HH:MM').default('20:00'),
  channel: z.enum(['telegram', 'whatsapp']),
  isEnabled: z.boolean().default(true),
  timezone: z.string().default('Asia/Jakarta'),
});
export type ReportPreferenceInput = z.infer<typeof ReportPreferenceInputSchema>;

export interface ReportPreferenceRecord extends ReportPreferenceInput {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationStateRecord {
  provider: 'telegram' | 'whatsapp';
  status: 'not_connected' | 'pending' | 'connected' | 'error' | 'waiting_configuration';
  externalId: string;
  pairingCode?: string;
  pairingExpiresAt?: string;
  verifiedAt?: string;
  lastError?: string;
}

export interface ScheduledReportLog {
  id: string;
  preferenceId: string;
  reportType: 'financial' | 'nutrition';
  channel: 'telegram' | 'whatsapp';
  periodStart: string;
  periodEnd: string;
  dedupeKey: string;
  status: 'queued' | 'sent' | 'failed';
  previewText: string;
  sentAt: string;
  error?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'budget_threshold' | 'sync' | 'report' | 'system';
  title: string;
  body: string;
  dedupeKey: string;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  metadataSummary: string;
  createdAt: string;
}

/**
 * Default Onboarding Categories per Section 6.2.
 * Note: "Makan" (Sarapan, Makan siang, Makan malam, Restoran) and "Jajan" (Jajan, Camilan, Minuman, Kopi, Fast food)
 * are strictly separate categories so analytics & reports can distinguish primary meals vs snacks/jajan.
 */
export const DEFAULT_SYSTEM_CATEGORIES: Omit<CategoryRecord, 'userId' | 'createdAt' | 'updatedAt'>[] = [
  // Pengeluaran - Makanan Utama
  { id: 'cat_exp_sarapan', name: 'Sarapan', kind: 'expense', groupName: 'Makanan', icon: 'Sunrise', color: 'emerald', isSystem: true, sortOrder: 1 },
  { id: 'cat_exp_makan_siang', name: 'Makan siang', kind: 'expense', groupName: 'Makanan', icon: 'Utensils', color: 'emerald', isSystem: true, sortOrder: 2 },
  { id: 'cat_exp_makan_malam', name: 'Makan malam', kind: 'expense', groupName: 'Makanan', icon: 'Moon', color: 'emerald', isSystem: true, sortOrder: 3 },
  { id: 'cat_exp_restoran', name: 'Restoran', kind: 'expense', groupName: 'Makanan', icon: 'Store', color: 'emerald', isSystem: true, sortOrder: 4 },
  // Pengeluaran - Jajan & Minuman (Terpisah dari Makan Utama)
  { id: 'cat_exp_jajan', name: 'Jajan', kind: 'expense', groupName: 'Jajan & Minuman', icon: 'Cookie', color: 'amber', isSystem: true, sortOrder: 5 },
  { id: 'cat_exp_camilan', name: 'Camilan', kind: 'expense', groupName: 'Jajan & Minuman', icon: 'Croissant', color: 'amber', isSystem: true, sortOrder: 6 },
  { id: 'cat_exp_minuman', name: 'Minuman', kind: 'expense', groupName: 'Jajan & Minuman', icon: 'CupSoda', color: 'amber', isSystem: true, sortOrder: 7 },
  { id: 'cat_exp_kopi', name: 'Kopi', kind: 'expense', groupName: 'Jajan & Minuman', icon: 'Coffee', color: 'amber', isSystem: true, sortOrder: 8 },
  { id: 'cat_exp_fast_food', name: 'Fast food', kind: 'expense', groupName: 'Jajan & Minuman', icon: 'Flame', color: 'amber', isSystem: true, sortOrder: 9 },
  // Pengeluaran - Kebutuhan
  { id: 'cat_exp_belanja', name: 'Belanja', kind: 'expense', groupName: 'Kebutuhan', icon: 'ShoppingBag', color: 'sky', isSystem: true, sortOrder: 10 },
  { id: 'cat_exp_transportasi', name: 'Transportasi', kind: 'expense', groupName: 'Kebutuhan', icon: 'Car', color: 'sky', isSystem: true, sortOrder: 11 },
  { id: 'cat_exp_pendidikan', name: 'Pendidikan', kind: 'expense', groupName: 'Kebutuhan', icon: 'GraduationCap', color: 'sky', isSystem: true, sortOrder: 12 },
  { id: 'cat_exp_kesehatan', name: 'Kesehatan', kind: 'expense', groupName: 'Kebutuhan', icon: 'HeartPulse', color: 'sky', isSystem: true, sortOrder: 13 },
  { id: 'cat_exp_tagihan', name: 'Tagihan', kind: 'expense', groupName: 'Kebutuhan', icon: 'Receipt', color: 'sky', isSystem: true, sortOrder: 14 },
  { id: 'cat_exp_pribadi', name: 'Kebutuhan pribadi', kind: 'expense', groupName: 'Kebutuhan', icon: 'UserCheck', color: 'sky', isSystem: true, sortOrder: 15 },
  // Pengeluaran - Hiburan
  { id: 'cat_exp_game', name: 'Game', kind: 'expense', groupName: 'Hiburan', icon: 'Gamepad2', color: 'violet', isSystem: true, sortOrder: 16 },
  { id: 'cat_exp_entertainment', name: 'Entertainment', kind: 'expense', groupName: 'Hiburan', icon: 'Film', color: 'violet', isSystem: true, sortOrder: 17 },
  { id: 'cat_exp_subscription', name: 'Subscription', kind: 'expense', groupName: 'Hiburan', icon: 'Repeat', color: 'violet', isSystem: true, sortOrder: 18 },
  { id: 'cat_exp_hobi', name: 'Hobi', kind: 'expense', groupName: 'Hiburan', icon: 'Palette', color: 'violet', isSystem: true, sortOrder: 19 },
  // Pengeluaran - Lainnya
  { id: 'cat_exp_sedekah', name: 'Sedekah', kind: 'expense', groupName: 'Lainnya', icon: 'HeartHandshake', color: 'slate', isSystem: true, sortOrder: 20 },
  { id: 'cat_exp_hadiah_out', name: 'Hadiah', kind: 'expense', groupName: 'Lainnya', icon: 'Gift', color: 'slate', isSystem: true, sortOrder: 21 },
  { id: 'cat_exp_lainnya', name: 'Pengeluaran lainnya', kind: 'expense', groupName: 'Lainnya', icon: 'MoreHorizontal', color: 'slate', isSystem: true, sortOrder: 22 },
  // Pemasukan
  { id: 'cat_inc_gaji', name: 'Gaji', kind: 'income', groupName: 'Pemasukan', icon: 'Briefcase', color: 'emerald', isSystem: true, sortOrder: 23 },
  { id: 'cat_inc_uang_saku', name: 'Uang saku', kind: 'income', groupName: 'Pemasukan', icon: 'Wallet', color: 'emerald', isSystem: true, sortOrder: 24 },
  { id: 'cat_inc_freelance', name: 'Freelance', kind: 'income', groupName: 'Pemasukan', icon: 'Laptop', color: 'emerald', isSystem: true, sortOrder: 25 },
  { id: 'cat_inc_bisnis', name: 'Bisnis', kind: 'income', groupName: 'Pemasukan', icon: 'TrendingUp', color: 'emerald', isSystem: true, sortOrder: 26 },
  { id: 'cat_inc_investasi', name: 'Investasi', kind: 'income', groupName: 'Pemasukan', icon: 'Landmark', color: 'emerald', isSystem: true, sortOrder: 27 },
  { id: 'cat_inc_hadiah_in', name: 'Hadiah', kind: 'income', groupName: 'Pemasukan', icon: 'Sparkles', color: 'emerald', isSystem: true, sortOrder: 28 },
  { id: 'cat_inc_lainnya', name: 'Pemasukan lainnya', kind: 'income', groupName: 'Pemasukan', icon: 'PlusCircle', color: 'emerald', isSystem: true, sortOrder: 29 },
];

export const JAJAN_CATEGORY_IDS = new Set([
  'cat_exp_jajan',
  'cat_exp_camilan',
  'cat_exp_minuman',
  'cat_exp_kopi',
  'cat_exp_fast_food',
]);

export const MAKAN_UTAMA_CATEGORY_IDS = new Set([
  'cat_exp_sarapan',
  'cat_exp_makan_siang',
  'cat_exp_makan_malam',
  'cat_exp_restoran',
]);
