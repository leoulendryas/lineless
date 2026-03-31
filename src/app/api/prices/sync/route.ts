import { NextResponse } from 'next/server';
import { syncFuelPrices } from '@/lib/priceFetcher';

/**
 * GET /api/prices/sync
 * Manually trigger a price sync or set up as a Vercel Cron job
 * example vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/prices/sync",
 *     "schedule": "0 0 1 * *"
 *   }]
 * }
 */
export async function GET() {
  try {
    const result = await syncFuelPrices();
    
    if (result.success) {
      return NextResponse.json({ 
        message: 'Prices synced successfully', 
        updated: result.updated 
      });
    } else {
      throw result.error;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: 'Failed to sync prices', 
      message 
    }, { status: 500 });
  }
}
