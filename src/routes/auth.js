import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import prisma from '../db.js';

const router = Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

function normalizeCredentials(rawEmail, rawPassword) {
  const email = (rawEmail ?? '').toString().trim().toLowerCase();
  const password = (rawPassword ?? '').toString();
  return { email, password };
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password } = normalizeCredentials(
      req.body?.email,
      req.body?.password,
    );

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email is invalid.' });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long.',
      });
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({
        error: 'Password must include at least one letter and one number.',
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already exists.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        role: 'client',
      },
    });

    const payload = { id: user.id, email: user.email, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ token, user: payload });
  } catch (err) {
    console.error('Register failed:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = normalizeCredentials(
      req.body?.email,
      req.body?.password,
    );

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const payload = { id: user.id, email: user.email, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.json({ token, user: payload });
  } catch (err) {
    console.error('Login failed:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
