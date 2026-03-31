import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTelegramHash, TelegramUserData } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const data: TelegramUserData = await request.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN is not defined');
      return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
    }

    const isValid = verifyTelegramHash(data, botToken);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid authentication data' }, { status: 401 });
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { telegramId: String(data.id) },
      update: {
        firstName: data.first_name,
        lastName: data.last_name,
        username: data.username,
        photoUrl: data.photo_url,
      },
      create: {
        telegramId: String(data.id),
        firstName: data.first_name,
        lastName: data.last_name,
        username: data.username,
        photoUrl: data.photo_url,
      },
    });

    // Set a secure cookie for the session
    const cookieStore = await cookies();
    cookieStore.set('lineless_user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Telegram Auth Error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('lineless_user_id');
  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = Object.fromEntries(searchParams.entries()) as unknown as TelegramUserData;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // If no hash, this is just a session check
  if (!data.hash) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('lineless_user_id')?.value;
    if (!userId) return NextResponse.json({ user: null });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return NextResponse.json({ user });
  }

  // This is a login redirect from Telegram
  if (!botToken) return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });

  const isValid = verifyTelegramHash(data, botToken);
  if (!isValid) return NextResponse.json({ error: 'Invalid authentication data' }, { status: 401 });

  const user = await prisma.user.upsert({
    where: { telegramId: String(data.id) },
    update: {
      firstName: data.first_name,
      lastName: data.last_name,
      username: data.username,
      photoUrl: data.photo_url,
    },
    create: {
      telegramId: String(data.id),
      firstName: data.first_name,
      lastName: data.last_name,
      username: data.username,
      photoUrl: data.photo_url,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set('lineless_user_id', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });

  // Redirect back to the main app
  return NextResponse.redirect(new URL('/', request.url));
}
