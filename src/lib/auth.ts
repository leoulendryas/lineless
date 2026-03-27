import crypto from 'crypto';

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function verifyTelegramHash(data: TelegramUserData, botToken: string): boolean {
  const { hash, ...rest } = data;
  
  // Data-check-string is the concatenation of all received fields, 
  // sorted alphabetically, in the format key=<value> with a line feed
  const checkString = Object.keys(rest)
    .sort()
    .map(key => `${key}=${rest[key as keyof typeof rest]}`)
    .join('\n');

  // Secret key is the SHA256 hash of the bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  
  // Hash is the HMAC-SHA256 signature of the data-check-string with the secret key
  const hmac = crypto.createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  return hmac === hash;
}
