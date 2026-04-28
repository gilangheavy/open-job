import { PrismaClient } from '@prisma/client';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();

/**
 * Lightweight password hash for seed data ONLY.
 * Production code MUST use bcrypt/argon2 — this is just to populate the seed.
 */
function seedHash(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // 1. Categories (idempotent via upsert on unique `name`)
  const categoryNames = ['Software Engineering', 'Marketing', 'Design'];
  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`  ✓ ${categoryNames.length} categories`);

  // 2. Owner user
  const owner = await prisma.user.upsert({
    where: { email: 'owner@openjob.test' },
    update: {},
    create: {
      fullname: 'OpenJob Owner',
      email: 'owner@openjob.test',
      password: seedHash('Password123!'),
    },
  });
  console.log(`  ✓ user: ${owner.email}`);

  // 3. Dummy company owned by the user
  const existingCompany = await prisma.company.findFirst({
    where: { name: 'OpenJob Inc.', userId: owner.id, deletedAt: null },
  });
  if (!existingCompany) {
    await prisma.company.create({
      data: {
        name: 'OpenJob Inc.',
        description: 'Internal recruitment platform demo company.',
        location: 'Jakarta, Indonesia',
        userId: owner.id,
      },
    });
  }
  console.log('  ✓ company: OpenJob Inc.');

  console.log('✅ Seed complete');
}

main()
  .catch((err: unknown) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
