import { randomBytes } from 'crypto';

console.log('🔑 JWT Keys Generator\n');

const generateKey = (): string => randomBytes(32).toString('hex');

const accessTokenKey = generateKey();
const refreshTokenKey = generateKey();

console.log(`ACCESS_TOKEN_KEY=${accessTokenKey}`);
console.log(`REFRESH_TOKEN_KEY=${refreshTokenKey}`);
console.log('\n✅ Copy-paste these values into your .env file');
