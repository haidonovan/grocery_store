import { Router } from 'express';

import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { message } = req.body || {};
  if (!message || message.toString().trim().length < 3) {
    return res.status(400).json({ error: 'Message is too short.' });
  }

  const row = await prisma.supportMessage.create({
    data: {
      userId: req.user.id,
      message: message.toString().trim(),
    },
  });
  return res.status(201).json(row);
});

router.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
  const rows = await prisma.supportMessage.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ data: rows });
});

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { isResolved } = req.body || {};
  const id = Number(req.params.id);
  const existing = await prisma.supportMessage.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  const row = await prisma.supportMessage.update({
    where: { id },
    data: {
      isResolved: isResolved == null ? existing.isResolved : Boolean(isResolved),
    },
  });
  return res.json(row);
});

export default router;
