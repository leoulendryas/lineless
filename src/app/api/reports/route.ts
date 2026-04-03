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

    const cookieStore = await cookies();
    const userId = cookieStore.get('lineless_user_id')?.value;

    const [stations, prices, activeQueueEntry] = await Promise.all([
      prisma.station.findMany({
        include: {
          reports: {
            where: {
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            },
            orderBy: { createdAt: 'desc' },
            include: { user: true }
          },
          queueEntries: {
            where: {
              status: { in: ['WAITING', 'ACTIVE', 'SERVED'] }
            },
            orderBy: { ticketNumber: 'desc' }
          }
        }
      }),
      prisma.globalPrice.findMany(),
      userId ? prisma.queueEntry.findFirst({
        where: {
          userId,
          status: { in: ['WAITING', 'ACTIVE'] }
        },
        include: { station: true }
      }) : Promise.resolve(null)
    ]).catch(err => {
      console.error('Database Query Error:', err);
      throw new Error(`Database connection failed: ${err.message}`);
    });

    const priceMap = prices.reduce((acc: PriceMap, p) => {
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

      const activeQueue = station.queueEntries.filter(e => e.status !== 'SERVED');
      const lastServed = station.queueEntries.find(e => e.status === 'SERVED');

      return {
        ...station,
        Benzene: getStats('Benzene'),
        Gasoline: getStats('Gasoline'),
        Electric: getStats('Electric'),
        queueCount: activeQueue.length,
        currentServing: lastServed?.ticketNumber || 0
      };
    });

    return NextResponse.json({
      stations: processedStations,
      prices: priceMap,
      activeQueueEntry
    });
  } catch (error: unknown) {
    console.error('GET /api/reports error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ 
      error: 'Failed to fetch reports', 
      message
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      externalId, name, type, lat, lon, 
      fuelType, status, queue, 
      reportId, action,
      isQueueJoin, plateNumber, phoneNumber,
      accessKey // Terminal provides this
    } = body;

    const cookieStore = await cookies();
    const userId = cookieStore.get('lineless_user_id')?.value;
    
    // Auth Check: Must have either a valid session OR a valid accessKey for a partner
    let authenticatedStationId = null;
    
    if (accessKey) {
      const stationMatch = await prisma.station.findUnique({
        where: { accessKey }
      });
      if (!stationMatch) return NextResponse.json({ error: 'Invalid Access Key' }, { status: 401 });
      authenticatedStationId = stationMatch.id;
    } else if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle Upvote/Downvote (Users Only)
    if (reportId && action) {
      if (!userId) return NextResponse.json({ error: 'Login required to vote' }, { status: 401 });
      const report = await prisma.report.findUnique({
        where: { id: reportId }
      });

      if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      if (report.userId === userId) return NextResponse.json({ error: 'Cannot vote on your own report' }, { status: 400 });

      const isUpvote = action === 'upvote';
      await prisma.$transaction([
        prisma.report.update({
          where: { id: reportId },
          data: isUpvote ? { upvotes: { increment: 1 } } : { downvotes: { increment: 1 } }
        }),
        prisma.user.update({
          where: { id: report.userId! },
          data: { trustScore: { increment: isUpvote ? 1 : -1 } }
        })
      ]);

      return NextResponse.json({ success: true });
    }

    // Upsert Station
    // If we have an accessKey, we don't need to upsert via provided name/lat/lon unless they are changed
    const targetExternalId = accessKey ? (await prisma.station.findUnique({ where: { accessKey }, select: { externalId: true } }))?.externalId : externalId;
    
    const station = await prisma.station.upsert({
      where: { externalId: String(targetExternalId) },
      update: { 
        ...(name && { name }), 
        ...(type && { type }), 
        ...(lat !== undefined && { lat: parseFloat(lat) }), 
        ...(lon !== undefined && { lon: parseFloat(lon) }),
        ...(body.isPartner !== undefined && { isPartner: body.isPartner }),
        ...(body.accessKey && { accessKey: body.accessKey })
      },
      create: { 
        externalId: String(targetExternalId), 
        name: name || "New Station", 
        type: type || "fuel", 
        lat: parseFloat(lat) || 0, 
        lon: parseFloat(lon) || 0,
        isPartner: body.isPartner || false,
        accessKey: body.accessKey || null
      },
    });

    // Handle Queue Join (Users Only)
    if (isQueueJoin) {
      if (!userId) return NextResponse.json({ error: 'Login required to join queue' }, { status: 401 });
      
      // Check for existing active registration
      const existingActive = await prisma.queueEntry.findFirst({
        where: {
          userId,
          status: { in: ['WAITING', 'ACTIVE'] }
        }
      });

      if (existingActive) {
        return NextResponse.json({ 
          error: 'Already Registered', 
          message: 'You already have an active spot in another queue.' 
        }, { status: 400 });
      }

      // DYNAMIC ARBITRAGE CHECK: Calculate cooldown based on previous refuel amount
      const lastServed = await prisma.queueEntry.findFirst({
        where: {
          plateNumber,
          status: 'SERVED',
        },
        orderBy: { servedAt: 'desc' },
        include: { station: true }
      });

      if (lastServed && lastServed.servedAt && lastServed.litersPumped) {
        // Consumption Rates (Liters per hour of continuous driving)
        const rate = lastServed.fuelType === 'Gasoline' ? 8 : 4; 
        const cooldownHours = Math.max(4, lastServed.litersPumped / rate); // Minimum 4 hours regardless of amount
        
        const nextAvailable = new Date(lastServed.servedAt.getTime() + cooldownHours * 60 * 60 * 1000);
        
        if (new Date() < nextAvailable) {
          return NextResponse.json({ 
            error: 'Dynamic Cooldown Active', 
            message: `Vehicle ${plateNumber} refueled ${lastServed.litersPumped}L at ${lastServed.station.name}. Based on consumption logic, your next refuel is authorized after ${nextAvailable.toLocaleString()}.` 
          }, { status: 403 });
        }
      }

      const lastEntry = await prisma.queueEntry.findFirst({
        where: { stationId: station.id },
        orderBy: { ticketNumber: 'desc' },
        select: { ticketNumber: true }
      });

      const ticketNumber = (lastEntry?.ticketNumber || 0) + 1;

      const entry = await prisma.queueEntry.create({
        data: {
          stationId: station.id,
          userId,
          ticketNumber,
          plateNumber,
          phoneNumber,
          fuelType: fuelType || 'Benzene',
          status: 'WAITING'
        }
      });

      await prisma.user.update({
        where: { id: userId },
        data: { lastPlateUsed: plateNumber, phoneNumber }
      });

      return NextResponse.json({ entry });
    }

    // Handle Standard Report
    const report = await prisma.report.create({
      data: {
        stationId: station.id,
        fuelType,
        status,
        queue,
        userId: userId || null
      }
    });

    return NextResponse.json({ station, report });
  } catch (error) {
    console.error('POST /api/reports error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { queueId, lat, lon, stationLat, stationLon } = await request.json();

    const R = 6371; // km
    const dLat = (stationLat - lat) * Math.PI / 180;
    const dLon = (stationLon - lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat * Math.PI / 180) * Math.cos(stationLat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    const isWithinRange = distance <= 5;

    const entry = await prisma.queueEntry.update({
      where: { id: queueId },
      data: { 
        isWithinRange,
        status: isWithinRange ? 'ACTIVE' : 'WAITING'
      }
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('PATCH /api/reports error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
