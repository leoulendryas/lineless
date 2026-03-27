import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Telegraf } from 'telegraf';

// WARNING: In a real app, you MUST move this token to .env
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const bot = new Telegraf(BOT_TOKEN);

// This bot logic will be used when we handle the POST request from Telegram
bot.start((ctx) => ctx.reply('Welcome to Addis Gas Tracker! Use /report <StationName> <Status> <Queue> to update. Example: /report NOC_Bole Available Medium'));

bot.command('report', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 3) {
    return ctx.reply('Please use format: /report <Station_Name> <Status> <Queue>\nExample: /report NOC_Bole Available Short');
  }

  const [stationName, status, queue] = args;
  
  try {
    // We try to find a station by its name (fuzzy matching or exact brand)
    // For a real production app, we'd use IDs, but for a bot, name-based lookup is common.
    const stations = await prisma.station.findMany({
      where: {
        name: { contains: stationName.replace('_', ' ') }
      },
      take: 1
    });

    if (stations.length === 0) {
      return ctx.reply(`Could not find station matching "${stationName}".`);
    }

    const station = stations[0];
    
    // Find or create the user from Telegram data
    const user = await prisma.user.upsert({
      where: { telegramId: String(ctx.from.id) },
      update: {
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
      },
      create: {
        telegramId: String(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
      },
    });
    
    await prisma.report.create({
      data: {
        stationId: station.id,
        fuelType: station.type === 'fuel' ? 'Benzene' : 'Electric',
        status: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
        queue: queue.charAt(0).toUpperCase() + queue.slice(1).toLowerCase(),
        userId: user.id
      }
    });

    ctx.reply(`✅ Successfully updated ${station.name} to ${status} with ${queue} queue.`);
  } catch (error) {
    console.error('Telegram report error:', error);
    ctx.reply('❌ Failed to update report. Try again later.');
  }
});

// The actual Next.js POST handler that Telegram Webhooks hit
export async function POST(request: Request) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Bot token not set' }, { status: 500 });
  }

  try {
    const body = await request.json();
    // Process the update with the bot logic defined above
    await bot.handleUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
