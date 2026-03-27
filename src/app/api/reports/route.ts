import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface PriceInfo {
  price: number;
  unit: string;
  trend: 'up' | 'down';
}

type PriceMap = Record<string, PriceInfo>;

export async function GET() {
  try {
    // Check if prisma is initialized
    if (!prisma) {
      throw new Error('Prisma client not initialized');
    }

    const [stations, prices] = await Promise.all([
      prisma.station.findMany({
        include: {
          reports: {
            where: {
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            },
            orderBy: { createdAt: 'desc' },
            include: { user: true }
          }
        }
      }),
      prisma.globalPrice.findMany()
    ]).catch(err => {
      console.error('Database Query Error:', err);
      throw new Error(`Database connection failed: ${err.message}`);
    });

    const priceMap = prices.reduce((acc: PriceMap, p) => {
      // Simulate live market fluctuation (jitter of +/- 0.05%)
      const jitter = (Math.random() - 0.5) * 0.1; 
      const dynamicPrice = p.price + jitter;
      
      acc[p.fuelType] = { 
        price: parseFloat(dynamicPrice.toFixed(2)), 
        unit: p.unit,
        trend: jitter > 0 ? 'up' : 'down'
      };
      return acc;
    }, {});

    const processedStations = stations.map(station => {
      const getStats = (type: string) => {
        const typeReports = station.reports.filter(r => r.fuelType === type);
        const latest = typeReports[0] || null;
        const availableCount = typeReports.filter(r => r.status === 'Available').length;
        const outOfStockCount = typeReports.filter(r => r.status === 'Out of Stock').length;
        const totalCount = typeReports.length;

        return {
          latest,
          stats: {
            available: availableCount,
            outOfStock: outOfStockCount,
            total: totalCount
          },
          price: priceMap[type] || null
        };
      };

      return {
        ...station,
        Benzene: getStats('Benzene'),
        Gasoline: getStats('Gasoline'),
        Electric: getStats('Electric')
      };
    });

    return NextResponse.json({
      stations: processedStations,
      prices: priceMap
    });
  } catch (error: any) {
    console.error('GET /api/reports error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch reports', 
      message: error.message || 'Internal Server Error',
      hint: 'Verify DATABASE_URL in Vercel settings and ensure the DB has been initialized.'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('lineless_user_id')?.value;

    const body = await request.json();
    const { externalId, name, type, lat, lon, fuelType, status, queue, reportId, action } = body;

    if (reportId && action) {
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { user: true }
      });

      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }

      // Prevent voting on own report
      if (report.userId === userId) {
        return NextResponse.json({ error: 'Cannot vote on your own report' }, { status: 400 });
      }

      const isUpvote = action === 'upvote';
      const updateData = isUpvote ? { upvotes: { increment: 1 } } : { downvotes: { increment: 1 } };
      
      const updatedReport = await prisma.report.update({
        where: { id: reportId },
        data: updateData
      });

      // Update author's trust score
      if (report.userId) {
        await prisma.user.update({
          where: { id: report.userId },
          data: { trustScore: { increment: isUpvote ? 1 : -1 } }
        });
      }

      return NextResponse.json({ report: updatedReport });
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const station = await prisma.station.upsert({
      where: { externalId },
      update: { name, type, lat, lon },
      create: { externalId, name, type, lat, lon },
    });

    const report = await prisma.report.create({
      data: {
        stationId: station.id,
        fuelType,
        status,
        queue,
        userId
      }
    });

    return NextResponse.json({ station, report });
  } catch (error) {
    console.error('POST /api/reports error:', error);
    return NextResponse.json({ error: 'Failed to process report' }, { status: 500 });
  }
}
