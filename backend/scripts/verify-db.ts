import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const counts = {
  usuarios: await prisma.usuario.count(),
  configuracoes: await prisma.configuracaoSirius.count(),
  vendedores: await prisma.vendedor.count(),
  clientes: await prisma.cliente.count(),
  vendas: await prisma.venda.count(),
  itens: await prisma.itemVenda.count(),
  produtos: await prisma.produto.count(),
  oportunidades: await prisma.oportunidadeComercial.count(),
  execucoes: await prisma.execucaoSincronizacao.count(),
};
const [duplicadas] = await prisma.$queryRaw<Array<{ total: number }>>`
  SELECT COUNT(*)::int AS total
  FROM (SELECT chave_externa FROM vendas GROUP BY chave_externa HAVING COUNT(*) > 1) d
`;
console.log(JSON.stringify({ counts, chavesVendaDuplicadas: duplicadas.total }));
await prisma.$disconnect();
