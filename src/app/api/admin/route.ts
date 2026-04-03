import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { password, action, stationId, name, externalId, lat, lon, type, accessKey, isPartner } = await request.json();

    // Secure this with an environment variable
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lineless_admin_2026';
    
    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'FETCH') {
      const stations = await prisma.station.findMany({
        orderBy: { updatedAt: 'desc' }
      });
      return NextResponse.json({ stations });
    }

    if (action === 'REPORTS') {
      const [totalServed, litersByFuel, topConsumers, stationEfficiency] = await Promise.all([
        prisma.queueEntry.count({ where: { status: 'SERVED' } }),
        prisma.queueEntry.groupBy({
          by: ['fuelType'],
          where: { status: 'SERVED' },
          _sum: { litersPumped: true }
        }),
        prisma.queueEntry.groupBy({
          by: ['plateNumber'],
          where: { status: 'SERVED' },
          _count: { id: true },
          _sum: { litersPumped: true },
          orderBy: { _sum: { litersPumped: 'desc' } },
          take: 10
        }),
        prisma.station.findMany({
          include: {
            _count: {
              select: { queueEntries: { where: { status: 'SERVED' } } }
            }
          },
          orderBy: { queueEntries: { _count: 'desc' } },
          take: 5
        })
      ]);

      return NextResponse.json({ 
        totalServed, 
        litersByFuel, 
        topConsumers, 
        stationEfficiency 
      });
    }

    if (action === 'UPSERT') {
      const station = await prisma.station.upsert({
        where: { externalId: String(externalId) },
        update: { 
          name, 
          type, 
          lat: parseFloat(lat), 
          lon: parseFloat(lon), 
          accessKey, 
          isPartner: !!isPartner 
        },
        create: { 
          externalId: String(externalId), 
          name, 
          type, 
          lat: parseFloat(lat), 
          lon: parseFloat(lon), 
          accessKey, 
          isPartner: !!isPartner 
        }
      });
      return NextResponse.json({ station });
    }

    return NextResponse.json({ error: 'Invalid Action' }, { status: 400 });
  } catch (error) {
    console.error('Admin API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
