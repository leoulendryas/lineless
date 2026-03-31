import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { accessKey } = await request.json();
    if (!accessKey) {
      return NextResponse.json({ error: 'Access key required' }, { status: 400 });
    }

    const station = await prisma.station.findUnique({
      where: { accessKey },
      select: { 
        id: true, 
        name: true, 
        isPartner: true,
        type: true
      }
    });

    if (!station) {
      return NextResponse.json({ error: 'Invalid access key' }, { status: 401 });
    }

    // In a real app, you might set a session cookie here.
    // For this MVP, we will rely on client-side localStorage as discussed.
    return NextResponse.json({ station });
  } catch (error) {
    console.error('Terminal Login Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
