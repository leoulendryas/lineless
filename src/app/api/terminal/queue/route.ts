import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId');

  if (!stationId) {
    return NextResponse.json({ error: 'Station ID required' }, { status: 400 });
  }

  try {
    const queue = await prisma.queueEntry.findMany({
      where: { 
        stationId, 
        status: { in: ['WAITING', 'ACTIVE'] } 
      },
      orderBy: { ticketNumber: 'asc' },
      include: { 
        user: { 
          select: { 
            firstName: true, 
            lastName: true, 
            trustScore: true 
          } 
        } 
      }
    });

    const totalRegistered = await prisma.queueEntry.count({
      where: { stationId }
    });

    const activeCount = queue.filter(e => e.isWithinRange && e.status === 'ACTIVE').length;
    const currentTicket = await prisma.queueEntry.findFirst({
        where: { stationId, status: 'SERVED' },
        orderBy: { ticketNumber: 'desc' },
        select: { ticketNumber: true }
    });

    return NextResponse.json({ 
        queue, 
        stats: {
            totalRegistered,
            activeCount,
            currentTicket: currentTicket?.ticketNumber || 0
        }
    });
  } catch (error) {
    console.error('Queue Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { queueId, action, liters } = await request.json();

    const entry = await prisma.queueEntry.findUnique({
      where: { id: queueId },
      include: { user: true }
    });

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const newStatus = action === 'SERVED' ? 'SERVED' : 'NO_SHOW';
    const trustAdjustment = action === 'SERVED' ? 2 : -10;

    // Update entry status, user trust score, and government oversight data
    await prisma.$transaction([
      prisma.queueEntry.update({
        where: { id: queueId },
        data: { 
          status: newStatus,
          litersPumped: action === 'SERVED' ? parseFloat(liters) || 0 : null,
          servedAt: action === 'SERVED' ? new Date() : null
        }
      }),
      prisma.user.update({
        where: { id: entry.userId },
        data: { 
            trustScore: { 
                increment: trustAdjustment 
            } 
        }
      })
    ]);

    // Ensure trust score doesn't go below 0 (Prisma doesn't have a min constraint, so we might need a follow-up)
    const updatedUser = await prisma.user.findUnique({ where: { id: entry.userId } });
    if (updatedUser && updatedUser.trustScore < 0) {
        await prisma.user.update({
            where: { id: entry.userId },
            data: { trustScore: 0 }
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Queue Update Error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
