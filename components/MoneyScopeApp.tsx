'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '@/lib/firebase';
import {
  DEFAULT_SYSTEM_CATEGORIES,
  type AccountInput,
  type AccountRecord,
  type AppNotification,
  type AuditLogEntry,
  type BudgetInput,
  type BudgetRecord,
  type CategoryInput,
  type CategoryRecord,
  type FoodLogRecord,
  type ReportPreferenceRecord,
  type ScheduledReportLog,
  type TransactionInput,
  type TransactionRecord,
} from '@/lib/schemas';
import {
  PERIOD_LABELS,
  formatIndonesianDate,
  formatJakartaDateKey,
  resolvePeriod,
  type PeriodPreset,
} from '@/lib/periods';
import {
  aggregatePeriodMetrics,
  calculateAccountBalances,
  evaluateBudgets,
  exportTransactionsCsv,
  formatIDR,
  generateSmartInsights,
  parseTransactionsCsv,
} from '@/lib/finance';
import {
  clearAllOfflineData,
  enqueueOfflineTransaction,
  getOfflineQueuedTransactions,
  removeOfflineQueuedTransaction,
} from '@/lib/offline-queue';
import { DailyCashFlowChart, CategoryDistributionChart } from './AnalyticsCharts';
import { QuickAddModal } from './modals/QuickAddModal';
import { NutritionModuleView } from './views/NutritionModuleView';
import { ReportsIntegrationsView } from './views/ReportsIntegrationsView';
import { BudgetsAccountsCategoriesView } from './views/BudgetsAccountsCategoriesView';
import { SettingsProfileView } from './views/SettingsProfileView';
import { PWAInstallButton, OfflineConnectivityBanner } from './PWAInstallBanner';
import {
  Plus,
  LayoutDashboard,
  ArrowRightLeft,
  BarChart3,
  Utensils,
  Send,
  Wallet,
  Settings,
  Search,
  Upload,
  Download,
  Trash2,
  Edit3,
  Undo2,
  Calculator,
  Bell,
  LogIn,
  LogOut,
  CheckCircle2,
  FilterX,
  Calendar,
} from 'lucide-react';

type ActiveSection =
  | 'dashboard'
  | 'transactions'
  | 'analytics'
  | 'budgets_accounts'
  | 'nutrition'
  | 'reports'
  | 'settings';

const LOCAL_STORAGE_KEY = 'moneyscope_workspace_v1';

interface LocalWorkspaceState {
  displayName: string;
  theme: 'dark' | 'light' | 'system';
  onboardingCompleted: boolean;
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  transactions: TransactionRecord[];
  budgets: BudgetRecord[];
  foodLogs: FoodLogRecord[];
  reportPreferences: ReportPreferenceRecord[];
  reportLogs: ScheduledReportLog[];
  notifications: AppNotification[];
  auditLogs: AuditLogEntry[];
}

function buildInitialCategories(userId: string): CategoryRecord[] {
  const now = new Date().toISOString();
  return DEFAULT_SYSTEM_CATEGORIES.map((c) => ({
    ...c,
    userId,
    createdAt: now,
    updatedAt: now,
  }));
}

function buildInitialAccount(userId: string): AccountRecord {
  const now = new Date().toISOString();
  return {
    id: 'acc_default_main',
    userId,
    name: 'Dompet Utama',
    type: 'cash',
    openingBalance: 0,
    currency: 'IDR',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function MoneyScopeApp() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');

  // Workspace Data State (Zero fake transactions — adheres 100% to Real Data Policy)
  const [displayName, setDisplayName] = useState('Pengguna MoneyScope');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [accounts, setAccounts] = useState<AccountRecord[]>(() => [
    buildInitialAccount('local_user'),
  ]);
  const [categories, setCategories] = useState<CategoryRecord[]>(() =>
    buildInitialCategories('local_user')
  );
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [foodLogs, setFoodLogs] = useState<FoodLogRecord[]>([]);
  const [reportPreferences, setReportPreferences] = useState<ReportPreferenceRecord[]>([]);
  const [reportLogs, setReportLogs] = useState<ScheduledReportLog[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // System & Connectivity State
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [usdaConfigured, setUsdaConfigured] = useState(false);

  // Period & Drill-down Filter State (Synced with URL searchParams)
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');
  const [customStartStr, setCustomStartStr] = useState('2026-11-01');
  const [customEndStr, setCustomEndStr] = useState('2026-11-30');
  const [drillDateKey, setDrillDateKey] = useState<string | null>(null);
  const [drillCategoryId, setDrillCategoryId] = useState<string | null>(null);

  // Transactions View Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');

  // Modals, Undo & Insights Formula State
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);
  const [lastDeletedTx, setLastDeletedTx] = useState<TransactionRecord | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvTextInput, setCsvTextInput] = useState('');
  const [openInsightFormulaId, setOpenInsightFormulaId] = useState<string | null>(null);
  const [showFormulaDailyAvg, setShowFormulaDailyAvg] = useState(false);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);

  // Onboarding Quick Setup State
  const [onboardName, setOnboardName] = useState('');
  const [onboardAccName, setOnboardAccName] = useState('Rekening Utama');
  const [onboardOpeningStr, setOnboardOpeningStr] = useState('0');
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  const currentUserId = firebaseUser?.uid ?? 'local_user';

  // Apply theme class to <html> without flash
  const applyThemeToDom = useCallback((nextTheme: 'dark' | 'light' | 'system') => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = nextTheme === 'dark' || (nextTheme === 'system' && prefersDark);
    root.classList.toggle('dark', isDark);
  }, []);

  // Load initial URL params, local workspace state, and system status
  useEffect(() => {
    testFirestoreConnection();

    if (typeof window !== 'undefined') {
      queueMicrotask(() => {
        setIsOnline(navigator.onLine);
        const params = new URLSearchParams(window.location.search);
        const urlPeriod = params.get('period') as PeriodPreset | null;
        if (urlPeriod && urlPeriod in PERIOD_LABELS) {
          setPeriodPreset(urlPeriod);
        }
        const urlDate = params.get('date');
        if (urlDate) setDrillDateKey(urlDate);
        const urlCat = params.get('category');
        if (urlCat) setDrillCategoryId(urlCat);
        if (params.get('autostart') === '1') {
          setOnboardingCompleted(true);
        }

        try {
          const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<LocalWorkspaceState>;
            if (parsed.displayName) setDisplayName(parsed.displayName);
            if (parsed.theme) {
              setTheme(parsed.theme);
              applyThemeToDom(parsed.theme);
            } else {
              applyThemeToDom('dark');
            }
            if (typeof parsed.onboardingCompleted === 'boolean') {
              setOnboardingCompleted(parsed.onboardingCompleted);
            }
            if (Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
              setAccounts(parsed.accounts);
            }
            if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
              setCategories(parsed.categories);
            }
            if (Array.isArray(parsed.transactions)) setTransactions(parsed.transactions);
            if (Array.isArray(parsed.budgets)) setBudgets(parsed.budgets);
            if (Array.isArray(parsed.foodLogs)) setFoodLogs(parsed.foodLogs);
            if (Array.isArray(parsed.reportPreferences)) setReportPreferences(parsed.reportPreferences);
            if (Array.isArray(parsed.reportLogs)) setReportLogs(parsed.reportLogs);
            if (Array.isArray(parsed.notifications)) setNotifications(parsed.notifications);
            if (Array.isArray(parsed.auditLogs)) setAuditLogs(parsed.auditLogs);
          } else {
            applyThemeToDom('dark');
          }
        } catch {
          applyThemeToDom('dark');
        }
      });
    }

    fetch('/api/integrations/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.status) {
          setGeminiConfigured(Boolean(d.status.geminiConfigured));
          setUsdaConfigured(Boolean(d.status.usdaConfigured));
        }
      })
      .catch(() => undefined);

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });

    return () => unsubAuth();
  }, [applyThemeToDom]);

  // Persist local workspace state safely
  useEffect(() => {
    if (!authReady || firebaseUser || typeof window === 'undefined') return;
    try {
      const payload: LocalWorkspaceState = {
        displayName,
        theme,
        onboardingCompleted,
        accounts,
        categories,
        transactions,
        budgets,
        foodLogs,
        reportPreferences,
        reportLogs,
        notifications,
        auditLogs,
      };
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    authReady,
    firebaseUser,
    displayName,
    theme,
    onboardingCompleted,
    accounts,
    categories,
    transactions,
    budgets,
    foodLogs,
    reportPreferences,
    reportLogs,
    notifications,
    auditLogs,
  ]);

  // Sync URL query parameters when period or drill-down changes
  const updateUrlFilterParams = useCallback(
    (nextPeriod: PeriodPreset, nextDate: string | null, nextCat: string | null) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('period', nextPeriod);
      if (nextDate) url.searchParams.set('date', nextDate);
      else url.searchParams.delete('date');
      if (nextCat) url.searchParams.set('category', nextCat);
      else url.searchParams.delete('category');
      window.history.replaceState({}, '', url.toString());
    },
    []
  );

  // Attach Firestore real-time listeners when authenticated with Firebase
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const uid = firebaseUser.uid;

    const userDocRef = doc(db, 'users', uid);
    const unsubUser = onSnapshot(
      userDocRef,
      async (snap) => {
        if (!snap.exists()) {
          try {
            const batch = writeBatch(db);
            batch.set(userDocRef, {
              userId: uid,
              displayName: firebaseUser.displayName || 'Pengguna MoneyScope',
              locale: 'id-ID',
              timezone: 'Asia/Jakarta',
              theme: 'dark',
              onboardingCompleted: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            const defaultAccRef = doc(db, 'users', uid, 'accounts', 'acc_default_main');
            batch.set(defaultAccRef, {
              userId: uid,
              name: 'Dompet Utama',
              type: 'cash',
              openingBalance: 0,
              currency: 'IDR',
              isArchived: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            for (const cat of DEFAULT_SYSTEM_CATEGORIES) {
              const catRef = doc(db, 'users', uid, 'categories', cat.id);
              batch.set(catRef, {
                userId: uid,
                name: cat.name,
                kind: cat.kind,
                groupName: cat.groupName,
                icon: cat.icon,
                color: cat.color,
                isSystem: cat.isSystem,
                sortOrder: cat.sortOrder,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
          }
          return;
        }
        const data = snap.data();
        if (data.displayName) setDisplayName(String(data.displayName));
        if (data.theme) {
          setTheme(data.theme as 'dark' | 'light' | 'system');
          applyThemeToDom(data.theme as 'dark' | 'light' | 'system');
        }
        setOnboardingCompleted(Boolean(data.onboardingCompleted));
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubAccounts = onSnapshot(
      collection(db, 'users', uid, 'accounts'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AccountRecord, 'id'>),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        if (list.length > 0) setAccounts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/accounts`)
    );

    const unsubCategories = onSnapshot(
      collection(db, 'users', uid, 'categories'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CategoryRecord, 'id'>),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (list.length > 0) setCategories(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/categories`)
    );

    const unsubTransactions = onSnapshot(
      collection(db, 'users', uid, 'transactions'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TransactionRecord, 'id'>),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        setTransactions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/transactions`)
    );

    const unsubBudgets = onSnapshot(
      collection(db, 'users', uid, 'budgets'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<BudgetRecord, 'id'>),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        setBudgets(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/budgets`)
    );

    const unsubFoodLogs = onSnapshot(
      collection(db, 'users', uid, 'foodLogs'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          items: [],
          ...(d.data() as Omit<FoodLogRecord, 'id' | 'items'>),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        setFoodLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/foodLogs`)
    );

    return () => {
      unsubUser();
      unsubAccounts();
      unsubCategories();
      unsubTransactions();
      unsubBudgets();
      unsubFoodLogs();
    };
  }, [authReady, firebaseUser, applyThemeToDom]);

  // Offline Queue Sync Handler
  const syncOfflineTransactions = useCallback(async () => {
    const queued = await getOfflineQueuedTransactions(currentUserId);
    setPendingOfflineCount(queued.length);
    if (!navigator.onLine || queued.length === 0) return;

    for (const item of queued) {
      await removeOfflineQueuedTransaction(item.clientId);
    }
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.syncStatus === 'pending_sync' ? { ...tx, syncStatus: 'synced' } : tx
      )
    );
    setPendingOfflineCount(0);
  }, [currentUserId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      setIsOnline(true);
      syncOfflineTransactions();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncOfflineTransactions]);

  const appendAuditLog = useCallback(
    (action: string, entity: string, entityId: string, metadataSummary: string) => {
      const entry: AuditLogEntry = {
        id: `audit_${Date.now()}`,
        userId: currentUserId,
        action,
        entity,
        entityId,
        metadataSummary,
        createdAt: new Date().toISOString(),
      };
      setAuditLogs((prev) => [entry, ...prev.slice(0, 49)]);
    },
    [currentUserId]
  );

  // Derived Financial & Period Computations
  const activePeriodWindow = useMemo(
    () =>
      resolvePeriod(periodPreset, new Date(), {
        startDateStr: customStartStr,
        endDateStr: customEndStr,
      }),
    [periodPreset, customStartStr, customEndStr]
  );

  const accountBalances = useMemo(
    () => calculateAccountBalances(accounts, transactions),
    [accounts, transactions]
  );

  const totalNetWorth = useMemo(
    () => accountBalances.reduce((sum, item) => sum + item.currentBalance, 0),
    [accountBalances]
  );

  const periodSummary = useMemo(
    () => aggregatePeriodMetrics(transactions, categories, activePeriodWindow),
    [transactions, categories, activePeriodWindow]
  );

  const { evaluated: evaluatedBudgets, newNotifications: triggeredBudgetNotifs } = useMemo(
    () => evaluateBudgets(budgets, transactions, categories, new Date()),
    [budgets, transactions, categories]
  );

  // Deduplicate budget threshold notifications
  useEffect(() => {
    if (triggeredBudgetNotifs.length === 0) return;
    queueMicrotask(() => {
      setNotifications((prev) => {
        const existingKeys = new Set(prev.map((n) => n.dedupeKey));
        const additions: AppNotification[] = [];
        for (const notif of triggeredBudgetNotifs) {
          if (!existingKeys.has(notif.dedupeKey)) {
            additions.push({
              ...notif,
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              userId: currentUserId,
            });
          }
        }
        return additions.length > 0 ? [...additions, ...prev] : prev;
      });
    });
  }, [triggeredBudgetNotifs, currentUserId]);

  const smartInsights = useMemo(
    () => generateSmartInsights(transactions, categories, new Date()),
    [transactions, categories]
  );

  // Filtered transactions for the Transactions & Drill-down list
  const displayedTransactions = useMemo(() => {
    return periodSummary.filteredTransactions.filter((tx) => {
      if (drillDateKey) {
        const txDateKey = formatJakartaDateKey(new Date(tx.occurredAt));
        if (txDateKey !== drillDateKey) return false;
      }
      if (drillCategoryId && tx.categoryId !== drillCategoryId) {
        return false;
      }
      if (typeFilter !== 'all' && tx.type !== typeFilter) {
        return false;
      }
      if (accountFilter !== 'all' && tx.accountId !== accountFilter && tx.toAccountId !== accountFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const catName = categories.find((c) => c.id === tx.categoryId)?.name.toLowerCase() ?? '';
        const match =
          tx.description.toLowerCase().includes(q) ||
          tx.merchant.toLowerCase().includes(q) ||
          tx.notes.toLowerCase().includes(q) ||
          catName.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    periodSummary.filteredTransactions,
    drillDateKey,
    drillCategoryId,
    typeFilter,
    accountFilter,
    searchQuery,
    categories,
  ]);

  // CRUD Handlers
  const handleSaveTransaction = async (input: TransactionInput) => {
    const nowIso = new Date().toISOString();
    const id = input.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const clientId = input.clientId || id;

    const record: TransactionRecord = {
      id,
      userId: currentUserId,
      type: input.type,
      amount: input.amount,
      accountId: input.accountId,
      toAccountId: input.toAccountId || '',
      categoryId: input.categoryId || '',
      description: input.description,
      merchant: input.merchant,
      paymentMethod: input.paymentMethod,
      occurredAt: input.occurredAt,
      notes: input.notes,
      clientId,
      linkedFoodLogId: input.linkedFoodLogId || '',
      syncStatus: isOnline ? 'synced' : 'pending_sync',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (!isOnline) {
      await enqueueOfflineTransaction(record);
      setPendingOfflineCount((c) => c + 1);
    }

    if (firebaseUser) {
      const txRef = doc(db, 'users', firebaseUser.uid, 'transactions', id);
      try {
        await setDoc(txRef, {
          userId: firebaseUser.uid,
          type: record.type,
          amount: record.amount,
          accountId: record.accountId,
          toAccountId: record.toAccountId,
          categoryId: record.categoryId,
          description: record.description,
          merchant: record.merchant,
          paymentMethod: record.paymentMethod,
          occurredAt: record.occurredAt,
          notes: record.notes,
          clientId: record.clientId,
          linkedFoodLogId: record.linkedFoodLogId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}/transactions/${id}`);
      }
    } else {
      setTransactions((prev) => {
        const exists = prev.some((t) => t.id === id || t.clientId === clientId);
        if (exists) {
          return prev.map((t) => (t.id === id || t.clientId === clientId ? record : t));
        }
        return [record, ...prev];
      });
    }

    setEditingTx(null);
  };

  const handleDeleteTransaction = async (tx: TransactionRecord) => {
    setLastDeletedTx(tx);
    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'transactions', tx.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${firebaseUser.uid}/transactions/${tx.id}`);
      }
    } else {
      setTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    }
    appendAuditLog('DELETE', 'transaction', tx.id, `Hapus transaksi ${tx.description}`);
  };

  const handleUndoDeleteTransaction = async () => {
    if (!lastDeletedTx) return;
    await handleSaveTransaction(lastDeletedTx);
    setLastDeletedTx(null);
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    const opening = Number.parseInt(onboardOpeningStr.replace(/[^0-9\-]/g, ''), 10) || 0;
    const cleanName = onboardName.trim() || displayName;
    const cleanAccName = onboardAccName.trim() || 'Dompet Utama';

    setDisplayName(cleanName);
    setOnboardingCompleted(true);
    setAccounts((prev) => {
      if (prev.length === 0) {
        return [
          {
            ...buildInitialAccount(currentUserId),
            name: cleanAccName,
            openingBalance: opening,
          },
        ];
      }
      return prev.map((a, idx) =>
        idx === 0 ? { ...a, name: cleanAccName, openingBalance: opening } : a
      );
    });

    if (firebaseUser) {
      try {
        await setDoc(
          doc(db, 'users', firebaseUser.uid),
          {
            userId: firebaseUser.uid,
            displayName: cleanName,
            locale: 'id-ID',
            timezone: 'Asia/Jakarta',
            theme,
            onboardingCompleted: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    }
  };

  // CSV Import Preview
  const csvPreview = useMemo(
    () => parseTransactionsCsv(csvTextInput, transactions, categories, accounts),
    [csvTextInput, transactions, categories, accounts]
  );

  const handleCommitCsvImport = async () => {
    const validRows = csvPreview.rows.filter(
      (r) => r.errors.length === 0 && !r.isDuplicate && r.parsedAmount && r.occurredAtIso && r.type && r.accountId
    );
    for (const row of validRows) {
      await handleSaveTransaction({
        type: row.type!,
        amount: row.parsedAmount!,
        accountId: row.accountId!,
        toAccountId: '',
        categoryId: row.categoryId || categories[0]?.id || '',
        description: row.rawDescription || 'Impor CSV',
        merchant: '',
        paymentMethod: 'Transfer',
        occurredAt: row.occurredAtIso!,
        notes: 'Diimpor via CSV',
        linkedFoodLogId: '',
      });
    }
    appendAuditLog('IMPORT_CSV', 'transactions', 'batch', `Impor ${validRows.length} baris transaksi CSV`);
    setCsvTextInput('');
    setCsvImportOpen(false);
  };

  const handleExportCsvFile = () => {
    const csvContent = exportTransactionsCsv(transactions, categories, accounts);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `moneyscope-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    appendAuditLog('EXPORT_CSV', 'transactions', 'all', `Ekspor ${transactions.length} transaksi ke CSV`);
  };

  const handleExportJsonFile = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      displayName,
      accounts,
      categories,
      transactions,
      budgets,
      foodLogs,
      reportPreferences,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `moneyscope-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    appendAuditLog('EXPORT_JSON', 'workspace', 'all', 'Ekspor seluruh data akun ke JSON');
  };

  const handleGoogleSignIn = async () => {
    setAuthErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthErrorMsg(
        err instanceof Error
          ? `Login Google belum dapat diselesaikan (${err.message}). Anda tetap dapat menggunakan Ruang Kerja Lokal secara penuh.`
          : 'Gagal masuk dengan Google.'
      );
    }
  };

  const handleSignOut = async () => {
    await clearAllOfflineData();
    if (firebaseUser) {
      await signOut(auth);
    }
  };

  const unreadNotifCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="min-h-dvh flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <OfflineConnectivityBanner
        isOnline={isOnline}
        pendingCount={pendingOfflineCount}
        onSyncNow={syncOfflineTransactions}
      />

      {/* Top Bar Contract (Strict 3-Zone Header: Brand — 5 Nav Links — 1 Primary Action) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-8 py-3.5 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur-md">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('dashboard');
          }}
          className="text-lg font-extrabold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap shrink-0"
        >
          MoneyScope
        </a>

        <nav
          aria-label="Navigasi Utama"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-600 dark:text-neutral-400"
        >
          {(
            [
              { id: 'dashboard', label: 'Ringkasan' },
              { id: 'transactions', label: 'Transaksi' },
              { id: 'analytics', label: 'Analitik' },
              { id: 'nutrition', label: 'Nutrisi' },
              { id: 'reports', label: 'Laporan' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeSection === item.id
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setEditingTx(null);
              setQuickAddOpen(true);
            }}
            className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Cepat</span>
          </button>
        </div>
      </header>

      {/* Secondary Workspace Toolbar (Period Selector, Sub-modules, Notifications, Auth & PWA Install) */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 px-4 sm:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Period Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <label htmlFor="global-period-select" className="font-medium">
                Periode (WIB):
              </label>
            </div>
            <select
              id="global-period-select"
              value={periodPreset}
              onChange={(e) => {
                const next = e.target.value as PeriodPreset;
                setPeriodPreset(next);
                setDrillDateKey(null);
                updateUrlFilterParams(next, null, drillCategoryId);
              }}
              className="min-h-[38px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((key) => (
                <option key={key} value={key}>
                  {PERIOD_LABELS[key]}
                </option>
              ))}
            </select>

            {periodPreset === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  aria-label="Tanggal mulai khusus"
                  value={customStartStr}
                  onChange={(e) => setCustomStartStr(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2 text-xs font-mono"
                />
                <span>s/d</span>
                <input
                  type="date"
                  aria-label="Tanggal akhir khusus"
                  value={customEndStr}
                  onChange={(e) => setCustomEndStr(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2 text-xs font-mono"
                />
              </div>
            )}
          </div>

          {/* Secondary Utility Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('budgets_accounts')}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
                activeSection === 'budgets_accounts'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Anggaran & Akun</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('settings')}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
                activeSection === 'settings'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Pengaturan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowNotificationsDrawer((prev) => !prev);
                setNotifications((prev) =>
                  prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
                );
              }}
              aria-label={`Notifikasi (${unreadNotifCount} belum dibaca)`}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums">{unreadNotifCount}</span>
            </button>

            <PWAInstallButton compact />

            {firebaseUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sinkron Google</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 pb-24 md:pb-12 space-y-6">
        {authErrorMsg && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3">
            <span>{authErrorMsg}</span>
            <button
              type="button"
              onClick={() => setAuthErrorMsg(null)}
              className="underline font-semibold shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Notifications Drawer */}
        {showNotificationsDrawer && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Pusat Notifikasi & Peringatan Anggaran ({notifications.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowNotificationsDrawer(false)}
                className="text-xs text-neutral-500 hover:underline"
              >
                Tutup
              </button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Belum ada peringatan anggaran yang terpicu. Notifikasi dibuat secara idempoten saat pemakaian anggaran melewati threshold 50%, 80%, atau 100%.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-2.5 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{n.title}</p>
                      <p className="text-neutral-600 dark:text-neutral-400">{n.body}</p>
                    </div>
                    <span className="font-mono text-[11px] text-neutral-400 shrink-0">
                      {n.createdAt.slice(11, 16)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Undo Deleted Transaction Banner */}
        {lastDeletedTx && (
          <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-900 text-white px-4 py-2.5 text-xs flex items-center justify-between gap-4">
            <span>
              Transaksi <strong>{lastDeletedTx.description}</strong> ({formatIDR(lastDeletedTx.amount)}) dihapus.
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleUndoDeleteTransaction}
                className="flex items-center gap-1 font-semibold text-emerald-400 hover:underline"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Urungkan (Undo)</span>
              </button>
              <button
                type="button"
                onClick={() => setLastDeletedTx(null)}
                className="text-neutral-400 hover:text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Onboarding Banner (Can be completed or skipped in 1 click) */}
        {!onboardingCompleted && transactions.length === 0 && activeSection === 'dashboard' && (
          <section
            aria-label="Onboarding Awal MoneyScope"
            className="rounded-2xl border border-emerald-500/30 bg-white dark:bg-neutral-900 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Selamat Datang di MoneyScope — Setup Awal Cepat
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  29 kategori default (Makan Utama & Jajan terpisah) telah disiapkan tanpa transaksi dummy. Atur saldo awal akun pertama Anda atau langsung lewati:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOnboardingCompleted(true)}
                className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline"
              >
                Lewati Onboarding
              </button>
            </div>

            <form
              onSubmit={handleCompleteOnboarding}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label
                  htmlFor="onboard-name"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Nama Anda
                </label>
                <input
                  id="onboard-name"
                  type="text"
                  value={onboardName}
                  onChange={(e) => setOnboardName(e.target.value)}
                  placeholder="Nama panggilan"
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor="onboard-acc-name"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Nama Akun Pertama
                </label>
                <input
                  id="onboard-acc-name"
                  type="text"
                  value={onboardAccName}
                  onChange={(e) => setOnboardAccName(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor="onboard-opening"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Saldo Awal (IDR Bulat)
                </label>
                <input
                  id="onboard-opening"
                  type="text"
                  inputMode="numeric"
                  value={onboardOpeningStr}
                  onChange={(e) => setOnboardOpeningStr(e.target.value.replace(/[^0-9\-]/g, ''))}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono tabular-nums"
                />
              </div>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Setup Awal</span>
              </button>
            </form>
          </section>
        )}

        {/* SECTION 1 & 3: DASHBOARD & ANALYTICS */}
        {(activeSection === 'dashboard' || activeSection === 'analytics') && (
          <div className="space-y-6">
            {/* Top 4 KPI Metric Strip */}
            <section
              aria-label="Ringkasan Metrik Keuangan"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {/* Total Saldo Semua Akun */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Total Saldo Bersih ({accounts.length} Akun)
                </span>
                <p className="text-2xl font-extrabold font-mono tabular-nums text-neutral-900 dark:text-white">
                  {formatIDR(totalNetWorth)}
                </p>
                <p className="text-xs text-neutral-500">
                  Arus Kas Periode: {periodSummary.netCashFlow >= 0 ? '+' : ''}
                  {formatIDR(periodSummary.netCashFlow)}
                </p>
              </div>

              {/* Pemasukan Periode */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Pemasukan ({periodSummary.window.label})
                </span>
                <p className="text-2xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{formatIDR(periodSummary.totalIncome)}
                </p>
                <p className="text-xs text-neutral-500 font-mono tabular-nums">
                  vs periode lalu:{' '}
                  {periodSummary.incomeComparison.statusLabel === 'baru'
                    ? 'Baru (pembanding Rp 0)'
                    : `${periodSummary.incomeComparison.percentChange ?? 0}% (${formatIDR(periodSummary.incomeComparison.deltaAmount)})`}
                </p>
              </div>

              {/* Pengeluaran Periode */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Pengeluaran ({periodSummary.window.label})
                </span>
                <p className="text-2xl font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                  −{formatIDR(periodSummary.totalExpense)}
                </p>
                <p className="text-xs text-neutral-500 font-mono tabular-nums">
                  vs periode lalu:{' '}
                  {periodSummary.expenseComparison.statusLabel === 'baru'
                    ? 'Baru (pembanding Rp 0)'
                    : `${periodSummary.expenseComparison.percentChange ?? 0}% (${formatIDR(periodSummary.expenseComparison.deltaAmount)})`}
                </p>
              </div>

              {/* Rata-rata Harian & Dominan */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Rata-rata Pengeluaran / Hari
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFormulaDailyAvg((v) => !v)}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Calculator className="w-3 h-3" />
                    <span>Rumus</span>
                  </button>
                </div>
                <p className="text-2xl font-extrabold font-mono tabular-nums text-neutral-900 dark:text-white">
                  {formatIDR(periodSummary.dailyAverageExpense)}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {periodSummary.dominantCategory
                    ? `Dominan: ${periodSummary.dominantCategory.categoryName} (${periodSummary.dominantCategory.percentage}%)`
                    : `${periodSummary.window.totalDays} hari kalender`}
                </p>
                {showFormulaDailyAvg && (
                  <p className="text-[11px] font-mono bg-neutral-100 dark:bg-neutral-950 p-2 rounded-lg text-neutral-600 dark:text-neutral-300">
                    {periodSummary.dailyAverageFormula}
                  </p>
                )}
              </div>
            </section>

            {/* Empty State CTA when database has 0 transactions */}
            {transactions.length === 0 && (
              <section
                aria-label="Status Kosong Transaksi"
                className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center space-y-3"
              >
                <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  Belum Ada Transaksi Tercatat
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-lg mx-auto leading-relaxed">
                  Sesuai kebijakan <strong>Real Data Policy</strong>, MoneyScope tidak menampilkan angka atau transaksi dummy. Tambahkan transaksi pertama Anda dalam waktu ≤ 5 detik untuk mengaktifkan grafik arus kas, distribusi kategori, dan Smart Insights.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTx(null);
                      setQuickAddOpen(true);
                    }}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Catat Transaksi Pertama</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection('transactions');
                      setCsvImportOpen(true);
                    }}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Impor dari CSV</span>
                  </button>
                </div>
              </section>
            )}

            {/* Interactive Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7">
                <DailyCashFlowChart
                  series={periodSummary.dailySeries}
                  selectedDateKey={drillDateKey}
                  onSelectDate={(dateKey) => {
                    setDrillDateKey(dateKey);
                    updateUrlFilterParams(periodPreset, dateKey, drillCategoryId);
                  }}
                />
              </div>
              <div className="lg:col-span-5">
                <CategoryDistributionChart
                  items={periodSummary.categoryDistribution}
                  totalExpense={periodSummary.totalExpense}
                  selectedCategoryId={drillCategoryId}
                  onSelectCategory={(catId) => {
                    setDrillCategoryId(catId);
                    updateUrlFilterParams(periodPreset, drillDateKey, catId);
                  }}
                />
              </div>
            </div>

            {/* Deterministic Smart Insights Section (Only appears when minDataRequired is satisfied) */}
            {smartInsights.length > 0 && (
              <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Smart Insights Deterministik (Berbasis Aturan & Bukti Data)
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Dihitung secara matematis dari histori transaksi Anda — klik &ldquo;Lihat perhitungan&rdquo; untuk mengaudit angka sumber
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {smartInsights.map((ins) => (
                    <div
                      key={ins.id}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          {ins.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenInsightFormulaId(openInsightFormulaId === ins.id ? null : ins.id)
                          }
                          className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 shrink-0"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>Lihat perhitungan</span>
                        </button>
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                        {ins.text}
                      </p>
                      {openInsightFormulaId === ins.id && (
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5 text-[11px] font-mono space-y-1 text-neutral-700 dark:text-neutral-300">
                          <p>Metrik: {ins.evidence.metric} = {ins.evidence.value}</p>
                          <p>Pembanding: {ins.evidence.comparison}</p>
                          <p>Rumus: {ins.evidence.formula}</p>
                          <p className="text-neutral-400">Syarat data: {ins.minDataRequired}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent / Drill-down Transactions Preview */}
            {transactions.length > 0 && (
              <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {drillDateKey || drillCategoryId
                        ? `Hasil Drill-Down Transaksi (${displayedTransactions.length})`
                        : `Transaksi Terbaru pada Periode Ini (${displayedTransactions.length})`}
                    </h3>
                    {(drillDateKey || drillCategoryId) && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Filter aktif: {drillDateKey ? `Tanggal ${drillDateKey}` : ''}{' '}
                        {drillCategoryId
                          ? `Kategori ${categories.find((c) => c.id === drillCategoryId)?.name ?? ''}`
                          : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(drillDateKey || drillCategoryId) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDrillDateKey(null);
                          setDrillCategoryId(null);
                          updateUrlFilterParams(periodPreset, null, null);
                        }}
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                      >
                        <FilterX className="w-3.5 h-3.5" />
                        <span>Hapus Filter Drill-Down</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveSection('transactions')}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Lihat Semua & Kelola CSV →
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {displayedTransactions.slice(0, 8).map((tx) => {
                    const cat = categories.find((c) => c.id === tx.categoryId);
                    const acc = accounts.find((a) => a.id === tx.accountId);
                    return (
                      <div
                        key={tx.id}
                        className="py-3 flex items-center justify-between gap-4 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                            {tx.description}
                          </p>
                          <p className="text-neutral-500 truncate">
                            {tx.type === 'transfer'
                              ? `Transfer: ${acc?.name ?? tx.accountId} → ${
                                  accounts.find((a) => a.id === tx.toAccountId)?.name ?? tx.toAccountId
                                }`
                              : `${cat?.name ?? 'Tanpa Kategori'} · ${acc?.name ?? 'Akun'}`}{' '}
                            · {formatIndonesianDate(new Date(tx.occurredAt), true)}
                            {tx.syncStatus === 'pending_sync' && ' · Menunggu sinkron'}
                          </p>
                        </div>
                        <span
                          className={`font-mono tabular-nums font-bold shrink-0 text-sm ${
                            tx.type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : tx.type === 'expense'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '⇄'}
                          {formatIDR(tx.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* SECTION 2: TRANSACTIONS FULL VIEW (SEARCH, FILTER, CSV IMPORT/EXPORT, CRUD) */}
        {activeSection === 'transactions' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Manajemen Transaksi & Impor/Ekspor CSV
                </h2>
                <p className="text-xs text-neutral-500">
                  Menampilkan {displayedTransactions.length} transaksi pada periode {periodSummary.window.label}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCsvImportOpen((v) => !v)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Impor CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsvFile}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Download className="w-3.5 h-3.5 text-sky-500" />
                  <span>Ekspor CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTx(null);
                    setQuickAddOpen(true);
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Transaksi</span>
                </button>
              </div>
            </div>

            {/* CSV Import Drawer with Row-by-Row Validation & Duplicate Detection */}
            {csvImportOpen && (
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Impor CSV Transaksi (Pratinjau & Validasi Baris demi Baris)
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Format kolom: <code>tanggal,tipe,nominal,kategori,akun,deskripsi</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCsvTextInput(
                        [
                          'tanggal,tipe,nominal,kategori,akun,deskripsi',
                          '2026-11-15,expense,22000,Makan siang,Dompet Utama,Nasi Ayam Bakar',
                          '2026-11-16,expense,18000,Kopi,Dompet Utama,Es Kopi Susu',
                        ].join('\n')
                      )
                    }
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                  >
                    Isi Contoh Format CSV
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={csvTextInput}
                  onChange={(e) => setCsvTextInput(e.target.value)}
                  placeholder="Tempel isi file CSV di sini..."
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3 text-xs font-mono text-neutral-900 dark:text-neutral-100"
                />

                {csvPreview.rows.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                      <span className="text-emerald-600 font-semibold">
                        Valid: {csvPreview.validCount} baris
                      </span>
                      <span className="text-amber-600 font-semibold">
                        Duplikat: {csvPreview.duplicateCount} baris
                      </span>
                      <span className="text-rose-600 font-semibold">
                        Error: {csvPreview.errorCount} baris
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
                      {csvPreview.rows.map((row) => (
                        <div
                          key={row.rowNumber}
                          className="p-2.5 flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-mono text-neutral-400">Baris #{row.rowNumber}:</span>{' '}
                            <strong>{row.rawDescription || '-'}</strong> · {row.rawAmount} ({row.rawCategory})
                            {row.errors.length > 0 && (
                              <p className="text-rose-600 dark:text-rose-400">
                                Error: {row.errors.join(', ')}
                              </p>
                            )}
                            {row.isDuplicate && (
                              <p className="text-amber-600">Terdeteksi duplikat (dilewati)</p>
                            )}
                          </div>
                          <span
                            className={`font-mono font-semibold ${
                              row.errors.length > 0
                                ? 'text-rose-600'
                                : row.isDuplicate
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                            }`}
                          >
                            {row.errors.length > 0 ? 'INVALID' : row.isDuplicate ? 'DUPLIKAT' : 'SIAP'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setCsvImportOpen(false)}
                        className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={csvPreview.validCount === 0}
                        onClick={handleCommitCsvImport}
                        className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold"
                      >
                        Impor {csvPreview.validCount} Baris Valid
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search & Filters Bar */}
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari deskripsi, merchant, kategori, atau catatan..."
                  aria-label="Cari transaksi"
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 pl-9 pr-3 text-xs text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <select
                  aria-label="Filter tipe transaksi"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs"
                >
                  <option value="all">Semua Tipe Transaksi</option>
                  <option value="expense">Pengeluaran (−)</option>
                  <option value="income">Pemasukan (+)</option>
                  <option value="transfer">Transfer Antar Akun (⇄)</option>
                </select>
              </div>

              <div>
                <select
                  aria-label="Filter akun transaksi"
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs"
                >
                  <option value="all">Semua Akun</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Transactions Table / List */}
            {displayedTransactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center space-y-2">
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  Tidak ada transaksi yang cocok dengan filter saat ini
                </p>
                <p className="text-xs text-neutral-500">
                  Ubah kata kunci pencarian, periode waktu, atau catat transaksi baru.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-800">
                {displayedTransactions.map((tx) => {
                  const cat = categories.find((c) => c.id === tx.categoryId);
                  const acc = accounts.find((a) => a.id === tx.accountId);
                  return (
                    <div
                      key={tx.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                          <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                            {tx.type === 'transfer' ? 'Transfer' : (cat?.name ?? 'Tanpa Kategori')}
                          </span>
                          <span>·</span>
                          <span>{acc?.name ?? tx.accountId}</span>
                          {tx.merchant && (
                            <>
                              <span>·</span>
                              <span>{tx.merchant}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{formatIndonesianDate(new Date(tx.occurredAt), true)}</span>
                        </div>
                        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {tx.description}
                        </p>
                        {tx.notes && (
                          <p className="text-xs text-neutral-500">{tx.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <span
                          className={`text-base font-bold font-mono tabular-nums ${
                            tx.type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : tx.type === 'expense'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-neutral-800 dark:text-neutral-200'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '⇄'}
                          {formatIDR(tx.amount)}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTx(tx);
                              setQuickAddOpen(true);
                            }}
                            aria-label={`Edit transaksi ${tx.description}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTransaction(tx)}
                            aria-label={`Hapus transaksi ${tx.description}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-neutral-500 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: BUDGETS, ACCOUNTS & CATEGORIES */}
        {activeSection === 'budgets_accounts' && (
          <BudgetsAccountsCategoriesView
            accounts={accounts}
            accountBalances={accountBalances}
            categories={categories}
            transactions={transactions}
            evaluatedBudgets={evaluatedBudgets}
            onCreateAccount={async (input: AccountInput) => {
              const id = `acc_${Date.now()}`;
              const nowIso = new Date().toISOString();
              const newAcc: AccountRecord = {
                ...input,
                id,
                userId: currentUserId,
                createdAt: nowIso,
                updatedAt: nowIso,
              };
              if (firebaseUser) {
                await setDoc(doc(db, 'users', firebaseUser.uid, 'accounts', id), {
                  userId: firebaseUser.uid,
                  name: newAcc.name,
                  type: newAcc.type,
                  openingBalance: newAcc.openingBalance,
                  currency: 'IDR',
                  isArchived: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                setAccounts((prev) => [...prev, newAcc]);
              }
            }}
            onDeleteAccount={async (accountId: string) => {
              if (firebaseUser) {
                await deleteDoc(doc(db, 'users', firebaseUser.uid, 'accounts', accountId));
              } else {
                setAccounts((prev) => prev.filter((a) => a.id !== accountId));
              }
            }}
            onCreateBudget={async (input: BudgetInput) => {
              const id = `b_${Date.now()}`;
              const nowIso = new Date().toISOString();
              const newBudget: BudgetRecord = {
                ...input,
                id,
                userId: currentUserId,
                createdAt: nowIso,
                updatedAt: nowIso,
              };
              if (firebaseUser) {
                await setDoc(doc(db, 'users', firebaseUser.uid, 'budgets', id), {
                  userId: firebaseUser.uid,
                  name: newBudget.name,
                  scope: newBudget.scope,
                  categoryId: newBudget.categoryId,
                  period: newBudget.period,
                  limitAmount: newBudget.limitAmount,
                  alertThresholds: newBudget.alertThresholds,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                setBudgets((prev) => [...prev, newBudget]);
              }
            }}
            onDeleteBudget={async (budgetId: string) => {
              if (firebaseUser) {
                await deleteDoc(doc(db, 'users', firebaseUser.uid, 'budgets', budgetId));
              } else {
                setBudgets((prev) => prev.filter((b) => b.id !== budgetId));
              }
            }}
            onCreateCategory={async (input: CategoryInput) => {
              const id = `cat_${Date.now()}`;
              const nowIso = new Date().toISOString();
              const newCat: CategoryRecord = {
                ...input,
                id,
                userId: currentUserId,
                createdAt: nowIso,
                updatedAt: nowIso,
              };
              if (firebaseUser) {
                await setDoc(doc(db, 'users', firebaseUser.uid, 'categories', id), {
                  userId: firebaseUser.uid,
                  name: newCat.name,
                  kind: newCat.kind,
                  groupName: newCat.groupName,
                  icon: newCat.icon,
                  color: newCat.color,
                  isSystem: false,
                  sortOrder: newCat.sortOrder,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                setCategories((prev) => [...prev, newCat]);
              }
            }}
            onDeleteCategoryWithReassign={async (categoryId: string, reassignToCategoryId: string) => {
              setTransactions((prev) =>
                prev.map((tx) =>
                  tx.categoryId === categoryId ? { ...tx, categoryId: reassignToCategoryId } : tx
                )
              );
              setCategories((prev) => prev.filter((c) => c.id !== categoryId));
            }}
          />
        )}

        {/* SECTION 5: NUTRITION INTELLIGENCE & FOOD JOURNAL */}
        {activeSection === 'nutrition' && (
          <NutritionModuleView
            foodLogs={foodLogs}
            transactions={transactions}
            periodWindow={activePeriodWindow}
            geminiConfigured={geminiConfigured}
            usdaConfigured={usdaConfigured}
            onSaveConfirmedFoodLog={async (draft, linkedTxId) => {
              const id = `fl_${Date.now()}`;
              const nowIso = new Date().toISOString();
              const newLog: FoodLogRecord = {
                ...draft,
                id,
                userId: currentUserId,
                createdAt: nowIso,
                updatedAt: nowIso,
              };

              if (firebaseUser) {
                await setDoc(doc(db, 'users', firebaseUser.uid, 'foodLogs', id), {
                  userId: firebaseUser.uid,
                  mealType: newLog.mealType,
                  title: newLog.title,
                  eatenAt: newLog.eatenAt,
                  transactionId: newLog.transactionId,
                  userConfirmed: true,
                  modelName: newLog.modelName,
                  totalCalories: newLog.totalCalories,
                  totalProteinG: newLog.totalProteinG,
                  totalCarbsG: newLog.totalCarbsG,
                  totalFatG: newLog.totalFatG,
                  totalFiberG: newLog.totalFiberG,
                  totalSodiumMg: newLog.totalSodiumMg,
                  validItemCount: newLog.validItemCount,
                  totalItemCount: newLog.totalItemCount,
                  itemsSummary: newLog.itemsSummary,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                setFoodLogs((prev) => [newLog, ...prev]);
              }

              if (linkedTxId) {
                setTransactions((prev) =>
                  prev.map((t) => (t.id === linkedTxId ? { ...t, linkedFoodLogId: id } : t))
                );
              }
            }}
            onDeleteFoodLog={async (id: string) => {
              if (firebaseUser) {
                await deleteDoc(doc(db, 'users', firebaseUser.uid, 'foodLogs', id));
              } else {
                setFoodLogs((prev) => prev.filter((f) => f.id !== id));
              }
            }}
          />
        )}

        {/* SECTION 6: REPORTS & INTEGRATIONS */}
        {activeSection === 'reports' && (
          <ReportsIntegrationsView
            periodSummary={periodSummary}
            transactions={transactions}
            categories={categories}
            foodLogs={foodLogs}
            preferences={reportPreferences}
            reportLogs={reportLogs}
            onSavePreference={async (pref) => {
              const id = `pref_${Date.now()}`;
              const nowIso = new Date().toISOString();
              const record: ReportPreferenceRecord = {
                ...pref,
                id,
                userId: currentUserId,
                createdAt: nowIso,
                updatedAt: nowIso,
              };
              if (firebaseUser) {
                await setDoc(doc(db, 'users', firebaseUser.uid, 'reportPreferences', id), {
                  userId: firebaseUser.uid,
                  reportType: record.reportType,
                  frequency: record.frequency,
                  customCron: record.customCron,
                  sendTime: record.sendTime,
                  channel: record.channel,
                  isEnabled: record.isEnabled,
                  timezone: record.timezone,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                setReportPreferences((prev) => [...prev, record]);
              }
              appendAuditLog('SAVE_REPORT_PREF', 'reportPreferences', id, `${record.reportType} (${record.frequency}) via ${record.channel}`);
            }}
            onRecordReportLog={(log) => {
              setReportLogs((prev) => [log, ...prev]);
              appendAuditLog('SEND_REPORT', 'scheduledReports', log.id, `${log.channel}: ${log.status}`);
            }}
          />
        )}

        {/* SECTION 7: SETTINGS, PRIVACY & PROFILE */}
        {activeSection === 'settings' && (
          <SettingsProfileView
            displayName={displayName}
            userEmail={firebaseUser?.email ?? null}
            storageMode={firebaseUser ? 'firebase_cloud' : 'local_workspace'}
            theme={theme}
            auditLogs={auditLogs}
            onChangeTheme={(nextTheme) => {
              setTheme(nextTheme);
              applyThemeToDom(nextTheme);
            }}
            onUpdateDisplayName={async (nextName) => {
              setDisplayName(nextName);
            }}
            onExportCsv={handleExportCsvFile}
            onExportJson={handleExportJsonFile}
            onDeleteAllAccountData={async () => {
              await clearAllOfflineData();
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem(LOCAL_STORAGE_KEY);
              }
              setTransactions([]);
              setBudgets([]);
              setFoodLogs([]);
              setReportPreferences([]);
              setReportLogs([]);
              setNotifications([]);
              setAccounts([buildInitialAccount(currentUserId)]);
              setCategories(buildInitialCategories(currentUserId));
              setOnboardingCompleted(false);
              appendAuditLog('DELETE_ACCOUNT_DATA', 'user', currentUserId, 'Seluruh data akun & cache dihapus permanen');
            }}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (<= 15% sticky height budget, >= 44px touch targets) */}
      <nav
        aria-label="Navigasi Bawah Mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md grid grid-cols-5 items-center h-14 px-1"
      >
        {(
          [
            { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard },
            { id: 'transactions', label: 'Transaksi', icon: ArrowRightLeft },
            { id: 'analytics', label: 'Analitik', icon: BarChart3 },
            { id: 'nutrition', label: 'Nutrisi', icon: Utensils },
            { id: 'reports', label: 'Laporan', icon: Send },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] mt-0.5 truncate">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Quick Add / Edit Transaction Modal */}
      {quickAddOpen && (
        <QuickAddModal
          isOpen={quickAddOpen}
          onClose={() => {
            setQuickAddOpen(false);
            setEditingTx(null);
          }}
          accounts={accounts}
          categories={categories}
          recentTransactions={transactions}
          foodLogs={foodLogs}
          onSubmitTransaction={handleSaveTransaction}
          initialValues={editingTx ?? undefined}
        />
      )}
    </div>
  );
}
