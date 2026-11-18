import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MoneyScopeApp } from '@/components/MoneyScopeApp';

export default function HomePage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-dvh bg-[#0A0D12] text-zinc-400 flex items-center justify-center text-sm font-mono">
            Memuat MoneyScope...
          </div>
        }
      >
        <MoneyScopeApp />
      </Suspense>
    </ErrorBoundary>
  );
}
