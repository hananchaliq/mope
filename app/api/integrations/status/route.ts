import { NextResponse } from 'next/server';
import { getSystemConfigStatus } from '@/lib/env';

export async function GET() {
  const status = getSystemConfigStatus();
  return NextResponse.json({
    status,
    checkedAt: new Date().toISOString(),
  });
}
