import { Router } from 'express';

import prisma from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const rows = await prisma.product.findMany({
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  const categories = rows.map((row) => row.category);
  return res.json({ data: categories });
});

export default router;
