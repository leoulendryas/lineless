import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

interface PriceInfo {
  price: number;
  unit: string;
  trend: 'up' | 'down';
}

type PriceMap = Record<string, PriceInfo>;

export async function GET() {
  try {
    const [stations, prices] = await Promise.all([
      prisma.station.findMany({
        include: {
          reports: {
            where: {
              // Only count reports from the last 24 hours for current status
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            },
            orderBy: { createdAt: 'desc' },
            include: { user: true }
          }
        }
      }),
      prisma.globalPrice.findMany()
    ]);

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
  } catch (error) {
    console.error('GET /api/reports error:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('lineless_user_id')?.value;

    const body = await request.json();
    const { externalId, name, type, lat, lon, fuelType, status, queue, reportId, action } = body;

    if (reportId && action) {
      const updateData = action === 'upvote' ? { upvotes: { increment: 1 } } : { downvotes: { increment: 1 } };
      const report = await prisma.report.update({
        where: { id: reportId },
        data: updateData
      });
      return NextResponse.json({ report });
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
