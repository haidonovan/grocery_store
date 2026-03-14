import { Router } from 'express';

import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    select: { productId: true },
  });
  return res.json({ data: rows.map((row) => row.productId) });
});

router.post('/:productId', requireAuth, async (req, res) => {
  const productId = req.params.productId;
  const existing = await prisma.favorite.findUnique({
    where: { userId_productId: { userId: req.user.id, productId } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return res.json({ isFavorite: false });
  }

  await prisma.favorite.create({
    data: {
      userId: req.user.id,
      productId,
    },
  });
  return res.json({ isFavorite: true });
});

export default router;
