import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient();
const senhaHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
await prisma.usuario.upsert({
  where: { email: env.ADMIN_EMAIL.toLowerCase() },
  update: { nome: env.ADMIN_NAME, senhaHash, ativo: true },
  create: { nome: env.ADMIN_NAME, email: env.ADMIN_EMAIL.toLowerCase(), senhaHash },
});
console.log('Administrador criado/atualizado:', env.ADMIN_EMAIL);
await prisma.$disconnect();

