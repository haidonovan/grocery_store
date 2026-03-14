import { Router } from 'express';

import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
  const rows = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ data: rows });
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { code, type, value, audience, description, startsAt, endsAt, userEmail } =
    req.body || {};
  const normalizedCode = (code ?? '').toString().trim().toUpperCase();
  if (!normalizedCode || (type !== 'percent' && type !== 'amount')) {
    return res.status(400).json({ error: 'Invalid coupon payload.' });
  }
  const audienceValue = audience === 'user' ? 'user' : 'all';
  if (audienceValue === 'user' && !userEmail) {
    return res.status(400).json({ error: 'User email is required.' });
  }
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return res.status(400).json({ error: 'Invalid coupon value.' });
  }
  if (type === 'percent' && parsedValue > 90) {
    return res.status(400).json({ error: 'Percent too high (max 90).' });
  }

  const existing = await prisma.coupon.findUnique({
    where: { code: normalizedCode },
  });
  if (existing) {
    return res.status(409).json({ error: 'Coupon code already exists.' });
  }

  const row = await prisma.coupon.create({
    data: {
      code: normalizedCode,
      type,
      value: parsedValue,
      isActive: true,
      audience: audienceValue,
      description: description?.toString(),
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      userEmail: userEmail?.toString() ?? null,
    },
  });
  return res.status(201).json(row);
});

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { isActive, value, type, audience, description, startsAt, endsAt, userEmail } =
    req.body || {};
  const existing = await prisma.coupon.findUnique({
    where: { id: Number(req.params.id) },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Coupon not found.' });
  }

  let nextValue = existing.value;
  if (value != null) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'Invalid coupon value.' });
    }
    nextValue = parsed;
  }

  let nextType = existing.type;
  if (type === 'percent' || type === 'amount') {
    nextType = type;
  }

  if (nextType === 'percent' && nextValue > 90) {
    return res.status(400).json({ error: 'Percent too high (max 90).' });
  }

  const row = await prisma.coupon.update({
    where: { id: existing.id },
    data: {
      isActive: isActive == null ? existing.isActive : Boolean(isActive),
      type: nextType,
      value: nextValue,
      audience: audience === 'user' ? 'user' : 'all',
      description: description == null ? existing.description : description,
      startsAt:
        startsAt === undefined
          ? existing.startsAt
          : startsAt
          ? new Date(startsAt)
          : null,
      endsAt:
        endsAt === undefined
          ? existing.endsAt
          : endsAt
          ? new Date(endsAt)
          : null,
      userEmail:
        audience === 'user'
          ? userEmail?.toString() ?? existing.userEmail
          : null,
    },
  });
  return res.json(row);
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Coupon not found.' });
  }
  await prisma.coupon.delete({ where: { id } });
  return res.status(204).send();
});

router.get('/active', requireAuth, async (req, res) => {
  const now = new Date();
  const rows = await prisma.coupon.findMany({
    where: {
      isActive: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } },
          ],
        },
        {
          OR: [
            { audience: 'all' },
            { audience: 'user', userEmail: req.user.email },
          ],
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ data: rows });
});

export default router;
