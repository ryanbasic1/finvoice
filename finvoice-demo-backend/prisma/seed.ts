
import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Create a demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@finvoice.test' },
    update: {},
    create: { email: 'demo@finvoice.test', displayName: 'Demo User' }
  });

  // Create a cash account
  const account = await prisma.account.upsert({
    where: { id: 'acc_cash_demo' },
    update: {},
    create: {
      id: 'acc_cash_demo',
      userId: user.id,
      type: 'cash',
      displayName: 'Cash'
    }
  });

  // Seed categories
  const categories = [
    'Food', 'Groceries', 'Travel', 'Fuel', 'Bills', 'Utilities', 'Rent',
    'Shopping', 'Health', 'Entertainment', 'Education', 'Transfers', 'Income', 'Uncategorized'
  ];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  console.log('Seed base complete:', { user: user.email, account: account.displayName });

  // Demo data for Jan-Jun 2025 with monthly salary Rs 80k and sample expenses
  const cat = async (name: string) => (await prisma.category.findUnique({ where: { name } }))!;
  const incomeCat = await cat('Income');
  const bills = await cat('Bills');
  const food = await cat('Food');
  const travel = await cat('Travel');
  const months = [0,1,2,3,4,5]; // Jan..Jun (0-based)
  for (const M of months) {
    const from = new Date(Date.UTC(2025, M, 1, 0, 0, 0));
    const to = new Date(Date.UTC(2025, M+1, 0, 23, 59, 59));
    // Idempotent: clear previously seeded data for this month
    await prisma.transaction.deleteMany({ where: { source: 'seed', date: { gte: from, lte: to } } });
    // Salary on 1st
    await prisma.transaction.create({
      data: { accountId: account.id, userId: user.id, date: new Date(Date.UTC(2025, M, 1, 12, 0, 0)), amount: new Prisma.Decimal(-80000), currency: 'INR', description: 'Monthly salary', merchantRaw: 'salary', direction: 'credit', categoryId: incomeCat.id, source: 'seed' }
    });
    // Sample expenses
    await prisma.transaction.createMany({
      data: [
        { accountId: account.id, userId: user.id, date: new Date(Date.UTC(2025, M, 2, 12, 0, 0)), amount: new Prisma.Decimal(1500) as any, currency: 'INR', description: 'Electricity bill', categoryId: bills.id, source: 'seed' },
        { accountId: account.id, userId: user.id, date: new Date(Date.UTC(2025, M, 3, 12, 0, 0)), amount: new Prisma.Decimal(2200) as any, currency: 'INR', description: 'Groceries', categoryId: food.id, source: 'seed' },
        { accountId: account.id, userId: user.id, date: new Date(Date.UTC(2025, M, 5, 12, 0, 0)), amount: new Prisma.Decimal(900) as any, currency: 'INR', description: 'Auto fare', categoryId: travel.id, source: 'seed' },
        { accountId: account.id, userId: user.id, date: new Date(Date.UTC(2025, M, 12, 12, 0, 0)), amount: new Prisma.Decimal(4500) as any, currency: 'INR', description: 'Dining out', categoryId: food.id, source: 'seed' },
        { accountId: account.id, userId: user.id, date: new Date(Date.UTC(2025, M, 20, 12, 0, 0)), amount: new Prisma.Decimal(2800) as any, currency: 'INR', description: 'Internet + OTT', categoryId: bills.id, source: 'seed' },
      ]
    });
  }

  // Existing July 2025 demo
  const Y = 2025; const M0 = 6; // July (0-based)
  const july = (day: number) => new Date(Date.UTC(Y, M0, day, 12, 0, 0));
  const monthFrom = new Date(Date.UTC(Y, M0, 1, 0, 0, 0));
  const monthTo = new Date(Date.UTC(Y, M0 + 1, 0, 23, 59, 59));
  

  // Idempotency: clear previously seeded July data
  await prisma.transaction.deleteMany({ where: { source: 'seed', date: { gte: monthFrom, lte: monthTo } } });
  // Also clear previously seeded September 2025 data if present (future month)
  const septFrom = new Date(Date.UTC(2025, 8, 1, 0, 0, 0));
  const septTo = new Date(Date.UTC(2025, 9, 0, 23, 59, 59));
  await prisma.transaction.deleteMany({ where: { source: 'seed', date: { gte: septFrom, lte: septTo } } });

  // Income (1st July)
  await prisma.transaction.create({
    data: {
      accountId: account.id,
      userId: user.id,
      date: july(1),
      amount: new Prisma.Decimal(-50000),
      currency: 'INR',
      description: 'Monthly salary',
      merchantRaw: 'salary',
      direction: 'credit',
      categoryId: incomeCat.id,
      source: 'seed'
    }
  });

  // Expenses in July
  

  await prisma.transaction.createMany({
    data: [
      { accountId: account.id, userId: user.id, date: july(2), amount: new Prisma.Decimal(1200) as any, currency: 'INR', description: 'DTH recharge', categoryId: bills.id, source: 'seed' },
      { accountId: account.id, userId: user.id, date: july(3), amount: new Prisma.Decimal(800) as any, currency: 'INR', description: 'Bijli bill', categoryId: bills.id, source: 'seed' },
      { accountId: account.id, userId: user.id, date: july(4), amount: new Prisma.Decimal(300) as any, currency: 'INR', description: 'Chai nashta', categoryId: food.id, source: 'seed' },
      { accountId: account.id, userId: user.id, date: july(5), amount: new Prisma.Decimal(150) as any, currency: 'INR', description: 'Auto fare', categoryId: travel.id, source: 'seed' },
    ]
  });

  // August 2025 demo (ensure Rs 80k salary present on 1st)
  const M1 = 7; // August (0-based)
  const aug = (day: number) => new Date(Date.UTC(Y, M1, day, 12, 0, 0));
  const augFrom = new Date(Date.UTC(Y, M1, 1, 0, 0, 0));
  const augTo = new Date(Date.UTC(Y, M1 + 1, 0, 23, 59, 59));
  await prisma.transaction.deleteMany({ where: { source: 'seed', date: { gte: augFrom, lte: augTo } } });
  await prisma.transaction.create({
    data: {
      accountId: account.id,
      userId: user.id,
      date: aug(1),
      amount: new Prisma.Decimal(-80000),
      currency: 'INR',
      description: 'Monthly salary',
      merchantRaw: 'salary',
      direction: 'credit',
      categoryId: incomeCat.id,
      source: 'seed'
    }
  });
  await prisma.transaction.createMany({
    data: [
      { accountId: account.id, userId: user.id, date: aug(2), amount: new Prisma.Decimal(1800) as any, currency: 'INR', description: 'Groceries', categoryId: food.id, source: 'seed' },
      { accountId: account.id, userId: user.id, date: aug(3), amount: new Prisma.Decimal(900) as any, currency: 'INR', description: 'Auto fare', categoryId: travel.id, source: 'seed' },
      { accountId: account.id, userId: user.id, date: aug(10), amount: new Prisma.Decimal(2200) as any, currency: 'INR', description: 'Electricity bill', categoryId: bills.id, source: 'seed' },
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
