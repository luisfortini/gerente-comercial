import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient();
const senhaHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
const usuario = await prisma.usuario.upsert({
  where: { email: env.ADMIN_EMAIL.toLowerCase() },
  update: { nome: env.ADMIN_NAME, senhaHash, ativo: true },
  create: { nome: env.ADMIN_NAME, email: env.ADMIN_EMAIL.toLowerCase(), senhaHash },
});
await prisma.empresa.upsert({
  where: { id: 'empresa_padrao' },
  update: {},
  create: { id: 'empresa_padrao', nome: 'Empresa principal' },
});
await prisma.usuarioEmpresa.upsert({
  where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: 'empresa_padrao' } },
  update: { papel: 'ADMIN' },
  create: { usuarioId: usuario.id, empresaId: 'empresa_padrao', papel: 'ADMIN' },
});
console.log('Administrador criado/atualizado:', env.ADMIN_EMAIL);
await prisma.$disconnect();
