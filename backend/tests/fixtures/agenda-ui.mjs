// Servidor isolado para QA visual. Não carrega .env nem chama banco ou Sírius.
// Execute após npm run build: node backend/tests/fixtures/agenda-ui.mjs
import express from 'express';
import { fileURLToPath } from 'node:url';
const app = express(); app.use(express.json());
const dist = fileURLToPath(new URL('../../../frontend/dist/', import.meta.url));
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const vendedores = [{ id: 'v1', nome: 'Clara · TESTE', codigoExterno: 1, filialCodigo: 1, ativo: true }, { id: 'v2', nome: 'Bruno · TESTE', codigoExterno: 2, filialCodigo: 1, ativo: true }];
const clientes = [{ id: 'c1', codigoExterno: 1, nomeFantasia: 'Padaria Exemplo · TESTE', vendedorId: 'v1' }, { id: 'c2', codigoExterno: 2, nomeFantasia: 'Mercado Exemplo · TESTE', vendedorId: 'v2' }, { id: 'c3', codigoExterno: 3, nomeFantasia: 'Loja Exemplo · TESTE', vendedorId: 'v1' }];
let eventos = clientes.slice(0, 2).map((c, i) => ({ codigo: i + 1, codigoExterno: i + 1, vendedorId: c.vendedorId, vendedorNome: vendedores[i].nome, vendedorAtivo: true, clienteCodigo: c.codigoExterno, clienteNome: c.nomeFantasia, cidade: 'Cidade Exemplo', dia: hoje, diaOriginal: hoje, inicio: 540 + i * 60, fim: 570 + i * 60, horarioIndefinido: false, status: 'PENDENTE_TESTE', tipoInteracao: 'R', contato: 'Compras · TESTE', observacao: 'Registro fictício para conferência visual.', feriado: false, reagendado: false, versao: 'a'.repeat(64) }));
const acoes = [];
const atendimentos = [];
const ocorrencias = [{ codigo: 1, descricao: 'Venda realizada · TESTE', tipo: 'POSITIVA' }, { codigo: 2, descricao: 'Retornar contato · TESTE', tipo: 'PENDÊNCIA' }, { codigo: 3, descricao: 'Não atendeu · TESTE', tipo: 'NEGATIVA' }];
app.get('/api/auth/me', (_q, r) => r.json({ usuario: { id: 'qa', nome: 'AMBIENTE DE TESTE LOCAL', email: 'qa@example.invalid' } }));
app.get('/api/vendedores', (_q, r) => r.json({ vendedores }));
app.get('/api/clientes', (_q, r) => r.json({ clientes }));
app.get('/api/agenda/acoes', (_q, r) => r.json({ acoes }));
app.get('/api/agenda/crm/ocorrencias', (_q, r) => r.json({ ocorrencias }));
app.get('/api/agenda/crm/atendimentos', (q, r) => r.json({ atendimentos: atendimentos.filter(a => (!q.query.vendedorId || a.vendedorId === q.query.vendedorId)) }));
app.get('/api/agenda/eventos', (q, r) => {
  const selecionados = vendedores.filter(v => !q.query.vendedorId || v.id === q.query.vendedorId);
  r.json({ eventos: eventos.filter(e => e.dia >= q.query.inicio && e.dia <= q.query.fim && (!q.query.vendedorId || e.vendedorId === q.query.vendedorId)), vendedores: selecionados, consultados: selecionados.map(v => v.id), falhas: [], parcial: false, atualizadoEm: new Date(), filial: 1 });
});
function resultado(q, r, operacao) { const acao = { id: q.body.chave, operacao, estado: 'CONCLUIDO', criadoEm: new Date(), resultado: { mensagem: `${operacao} validada em ambiente fictício. Nenhuma chamada ao Sírius.` } }; acoes.unshift(acao); console.log(operacao, 'FICTICIO'); r.json(acao); }
const min = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
app.post('/api/agenda/eventos', (q, r) => { const c = clientes.find(c => c.id === q.body.clienteId), v = vendedores.find(v => v.id === q.body.vendedorId); eventos.push({ ...eventos[0], codigo: 100 + acoes.length, vendedorId: v.id, vendedorNome: v.nome, clienteCodigo: c.codigoExterno, clienteNome: c.nomeFantasia, dia: q.body.dia, diaOriginal: q.body.dia, inicio: min(q.body.inicio), fim: min(q.body.fim), tipoInteracao: q.body.tipoInteracao, observacao: q.body.observacao }); resultado(q, r, 'INCLUIR'); });
app.patch('/api/agenda/eventos/:codigo', (q, r) => { const e = eventos.find(e => e.codigo === Number(q.params.codigo)); Object.assign(e, { dia: q.body.dia, inicio: min(q.body.inicio), fim: min(q.body.fim), contato: q.body.contato, status: q.body.status }); resultado(q, r, 'ALTERAR'); });
app.delete('/api/agenda/eventos/:codigo', (q, r) => { eventos = eventos.filter(e => e.codigo !== Number(q.params.codigo)); resultado(q, r, 'EXCLUIR'); });
app.post('/api/agenda/eventos/:codigo/atendimentos', (q, r) => { const evento = eventos.find(e => e.codigo === Number(q.params.codigo)), ocorrencia = ocorrencias.find(o => o.codigo === q.body.codigoOcorrencia); const atendimento = { id: q.body.chave, vendedorId: evento.vendedorId, agendaCodigo: evento.codigo, agendaVersao: evento.versao, estado: 'CONCLUIDO', dados: { agenda: { cliente: evento.clienteCodigo, dia: evento.dia, inicio: evento.inicio, fim: evento.fim, status: evento.status }, ocorrencia, payload: { contato: q.body.contato, observacao: q.body.observacao, tipoInteracao: q.body.tipoInteracao, horaAgenda: '12:00' } }, resultado: { mensagem: 'Atendimento validado em ambiente fictício. Nenhuma chamada ao Sírius.' }, criadoEm: new Date() }; atendimentos.unshift(atendimento); console.log('ATENDIMENTO FICTICIO'); r.json(atendimento); });
app.use(express.static(dist)); app.get('*', (_q, r) => r.sendFile(dist + 'index.html'));
app.listen(5190, '127.0.0.1', () => console.log('QA fictício: http://127.0.0.1:5190/agenda'));
