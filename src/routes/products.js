import { Router } from 'express';

import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { active } = req.query;
  const includeInactive = active === 'false';

  const rows = await prisma.product.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(rows.map(mapProduct));
});

router.get('/:id', async (req, res) => {
  const row = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!row) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  return res.json(mapProduct(row));
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const {
    name,
    category,
    description,
    price,
    imageUrl,
    stock,
    discountPercent,
    discountStart,
    discountEnd,
  } = req.body || {};
  if (!name || !category || !description || price == null || stock == null || !imageUrl) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  const parsedDiscount = Number(discountPercent ?? 0);
  const discount = Number.isFinite(parsedDiscount)
    ? Math.max(0, Math.min(90, parsedDiscount))
    : 0;

  const id = `p${Date.now()}`;
  const row = await prisma.product.create({
    data: {
      id,
      name,
      category,
      description,
      price: Number(price),
      discountPercent: discount,
      discountStart: discountStart ? new Date(discountStart) : null,
      discountEnd: discountEnd ? new Date(discountEnd) : null,
      imageUrl,
      stock: Number(stock),
      isActive: true,
    },
  });

  return res.status(201).json(mapProduct(row));
});

router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const {
    name,
    category,
    description,
    price,
    imageUrl,
    stock,
    isActive,
    discountPercent,
    discountStart,
    discountEnd,
  } = req.body || {};
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  let discount = existing.discountPercent;
  if (discountPercent != null) {
    const parsed = Number(discountPercent);
    discount = Number.isFinite(parsed) ? Math.max(0, Math.min(90, parsed)) : 0;
  }
  const nextStart =
    discountStart === undefined
      ? existing.discountStart
      : discountStart
      ? new Date(discountStart)
      : null;
  const nextEnd =
    discountEnd === undefined
      ? existing.discountEnd
      : discountEnd
      ? new Date(discountEnd)
      : null;

  const row = await prisma.product.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      category: category ?? existing.category,
      description: description ?? existing.description,
      price: price == null ? existing.price : Number(price),
      discountPercent: discount,
      imageUrl: imageUrl ?? existing.imageUrl,
      stock: stock == null ? existing.stock : Number(stock),
      isActive: isActive == null ? existing.isActive : Boolean(isActive),
      discountStart: nextStart,
      discountEnd: nextEnd,
    },
  });

  return res.json(mapProduct(row));
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  await prisma.product.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

router.post('/:id/restock', requireAuth, requireRole('admin'), async (req, res) => {
  const { quantity } = req.body || {};
  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than 0.' });
  }

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: req.params.id },
      data: { stock: existing.stock + qty },
    }),
    prisma.restock.create({
      data: {
        productId: existing.id,
        quantityAdded: qty,
      },
    }),
  ]);

  const row = await prisma.product.findUnique({ where: { id: req.params.id } });
  return res.json(mapProduct(row));
});

function mapProduct(row) {
  const now = new Date();
  const start = row.discountStart ? new Date(row.discountStart) : null;
  const end = row.discountEnd ? new Date(row.discountEnd) : null;
  const isActive =
    row.discountPercent > 0 &&
    (!start || start <= now) &&
    (!end || end >= now);
  const effectiveDiscount = isActive ? row.discountPercent : 0;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    discountPercent: row.discountPercent ?? 0,
    discountStart: row.discountStart,
    discountEnd: row.discountEnd,
    discountActive: isActive,
    effectiveDiscountPercent: effectiveDiscount,
    ratingAvg: row.ratingAvg ?? 0,
    ratingCount: row.ratingCount ?? 0,
    imageUrl: row.imageUrl,
    stock: row.stock,
    isActive: row.isActive,
  };
}

export default router;
