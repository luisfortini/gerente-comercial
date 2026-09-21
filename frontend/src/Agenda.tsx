import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams, NavLink } from 'react-router-dom';
import { api } from './lib/api';
import { TipoInteracaoRadio } from './components/TipoInteracaoRadio';

type Cliente = { id: string; codigoExterno: number; nomeFantasia?: string; razaoSocial?: string; vendedorId?: string; cidade?: string };
type Vendedor = { id: string; nome: string; filialCodigo: number; ativo: boolean };
type Item = { id: string; nome: string; cidade: string; dia: string; inicio: number; fim: number; motivo: string; pontuacao: number };
type Plano = { id: string; estado: string; criadoEm: string; dados: { vendedorNome: string; existentes: number; itens: Item[]; naoAgendados: Item[] }; resultado?: { mensagem: string } };
const horario = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dataBr = (d: string) => d.split('-').reverse().join('/');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function Agenda() {
  const [query] = useSearchParams();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]), [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedorId, setVendedor] = useState(''), [selecionados, setSelecionados] = useState<string[]>([]);
  const [modo, setModo] = useState(query.get('clienteId') ? 'manual' : 'oportunidades');
  const [dias, setDias] = useState([1, 2, 3, 4, 5]);
  const [plano, setPlano] = useState<Plano>(), [historico, setHistorico] = useState<Plano[]>([]);
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false), [busca, setBusca] = useState('');
  const reload = () => api<{ planos: Plano[] }>('/agenda/planos').then(r => setHistorico(r.planos));
  useEffect(() => {
    Promise.all([api<{ vendedores: Vendedor[] }>('/vendedores'), api<{ clientes: Cliente[] }>('/clientes')]).then(([v, c]) => {
      setVendedores(v.vendedores); setClientes(c.clientes);
      const cliente = c.clientes.find(c => c.id === query.get('clienteId'));
      if (cliente?.vendedorId) { setVendedor(cliente.vendedorId); setSelecionados([cliente.id]); }
    }).catch(e => setErro(e.message));
    reload().catch(e => setErro(e.message));
  }, [query]);
  function invalidar() { setPlano(undefined); setErro(''); }
  async function gerar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setOcupado(true); setErro(''); setPlano(undefined);
    const f = new FormData(e.currentTarget);
    try {
      if (modo === 'manual' && !selecionados.length) throw new Error('Selecione pelo menos um cliente.');
      const body = { vendedorId, inicio: f.get('inicio'), fim: f.get('fim'), limiteDiario: Number(f.get('limiteDiario')), duracao: Number(f.get('duracao')), intervalo: Number(f.get('intervalo')), expedienteInicio: f.get('expedienteInicio'), expedienteFim: f.get('expedienteFim'), almocoInicio: f.get('almocoInicio'), almocoFim: f.get('almocoFim'), intervaloClienteDias: Number(f.get('intervaloClienteDias')), tipoInteracao: f.get('tipoInteracao'), diasSemana: dias, bloqueios: String(f.get('bloqueios') || '').split(/[\s,;]+/).filter(Boolean), agruparCidade: f.get('agruparCidade') === 'on', clienteIds: modo === 'manual' ? selecionados : [] };
      setPlano(await api<Plano>('/agenda/previa', { method: 'POST', body: JSON.stringify(body) })); await reload();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }
  async function confirmar() {
    if (!plano) return;
    setOcupado(true); setErro('');
    try { setPlano(await api<Plano>(`/agenda/planos/${plano.id}/confirmar`, { method: 'POST' })); await reload(); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }
  const carteira = clientes.filter(c => c.vendedorId === vendedorId && `${c.nomeFantasia || c.razaoSocial || ''} ${c.codigoExterno}`.toLowerCase().includes(busca.toLowerCase()));
  return <>
    <NavLink to="/agenda" className="mb-4 inline-block text-sm font-medium text-brand-700">← Visualizar agendas e incluir manualmente</NavLink>
    <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Planejamento comercial</p>
    <h1 className="mt-2 text-3xl font-semibold">Agenda dos vendedores</h1>
    <p className="mt-2 mb-6 text-sm text-slate-500">Distribua contatos nos horários disponíveis e revise antes de criar no Sírius. Horários de Brasília.</p>
    <form onSubmit={gerar} onChange={invalidar} className="card p-5">
      <fieldset disabled={ocupado} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium">Vendedor<select required className="field mt-2" value={vendedorId} onChange={e => { setVendedor(e.target.value); setSelecionados([]); }}><option value="">Selecione</option>{vendedores.filter(v => v.ativo !== false).map(v => <option key={v.id} value={v.id}>{v.nome} · filial {v.filialCodigo}</option>)}</select></label>
          <Campo label="Data inicial" name="inicio" type="date" defaultValue={hoje()} min={hoje()} />
          <Campo label="Data final (até 31 dias)" name="fim" type="date" defaultValue={hoje()} min={hoje()} />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Campo label="Limite total de contatos por dia" name="limiteDiario" type="number" defaultValue={12} min={1} max={50} />
          <Campo label="Duração de cada contato (min)" name="duracao" type="number" defaultValue={20} min={5} max={240} />
          <Campo label="Intervalo / deslocamento (min)" name="intervalo" type="number" defaultValue={10} min={0} max={180} />
          <Campo label="Dias mínimos entre contatos do cliente" name="intervaloClienteDias" type="number" defaultValue={7} min={1} max={90} />
          <Campo label="Início do expediente" name="expedienteInicio" type="time" defaultValue="08:00" />
          <Campo label="Fim do expediente" name="expedienteFim" type="time" defaultValue="18:00" />
          <Campo label="Início do almoço" name="almocoInicio" type="time" defaultValue="12:00" />
          <Campo label="Fim do almoço" name="almocoFim" type="time" defaultValue="13:00" />
        </div>
        <div><p className="mb-2 text-sm font-medium">Dias de atendimento</p><div className="flex flex-wrap gap-4">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => <label key={d} className="flex gap-2 text-sm"><input type="checkbox" checked={dias.includes(i)} onChange={e => setDias(e.target.checked ? [...dias, i] : dias.filter(n => n !== i))} />{d}</label>)}</div></div>
        <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Feriados, férias e outros dias bloqueados<input className="field mt-2" name="bloqueios" placeholder="2026-12-25, 2026-12-31" /><span className="mt-1 block text-xs text-slate-500">Datas AAAA-MM-DD, separadas por vírgula. Feriados sinalizados no Sírius também bloqueiam o dia.</span></label><TipoInteracaoRadio label="Tipo de interação no Sírius" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="agruparCidade" />Preferir clientes da mesma cidade ao longo do dia</label>
        <p className="text-xs text-slate-500">A prioridade comercial inicia a distribuição. O agrupamento por cidade não calcula rotas; para visitas, ajuste a duração e a margem de deslocamento.</p>
        <label className="block text-sm font-medium">Clientes a agendar<select className="field mt-2" value={modo} onChange={e => setModo(e.target.value)}><option value="oportunidades">Clientes com oportunidades abertas, por pontuação</option><option value="manual">Selecionar clientes da carteira</option></select></label>
        {modo === 'manual' && <div className="rounded-xl border border-slate-200 p-3"><input className="field mb-3" placeholder="Buscar cliente" aria-label="Buscar cliente para agendar" value={busca} onChange={e => setBusca(e.target.value)} /><p className="mb-2 text-xs text-slate-500">{selecionados.length} selecionado(s) · máximo 500</p><div className="max-h-60 overflow-auto space-y-2">{carteira.map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selecionados.includes(c.id)} onChange={e => setSelecionados(e.target.checked ? [...selecionados, c.id] : selecionados.filter(id => id !== c.id))} />{c.nomeFantasia || c.razaoSocial || `Cliente ${c.codigoExterno}`} {c.cidade && `· ${c.cidade}`}</label>)}{!carteira.length && <p className="text-sm text-slate-500">Nenhum cliente nesta seleção.</p>}</div></div>}
        <button className="btn-primary" disabled={ocupado || !vendedorId}>{ocupado ? 'Processando…' : 'Consultar disponibilidade e gerar prévia'}</button>
      </fieldset>
    </form>
    {erro && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{erro} <NavLink to="/configuracao" className="underline">Conexão com o Sírius</NavLink></div>}
    {plano && <section className="card mt-5 p-5"><h2 className="text-xl font-semibold">Prévia · {plano.dados.vendedorNome}</h2><p className="mt-2 text-sm text-slate-500">{plano.dados.itens.length} novo(s) contato(s) · {plano.dados.existentes} compromisso(s) / reserva(s) considerados no período · {plano.dados.naoAgendados.length} sem encaixe</p>
      <Tabela itens={plano.dados.itens} />
      {!!plano.dados.naoAgendados.length && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Clientes não agendados ({plano.dados.naoAgendados.length})</summary><ul className="mt-3 space-y-2 text-sm text-slate-600">{plano.dados.naoAgendados.map(c => <li key={c.id}>{c.nome}: {c.motivo}</li>)}</ul></details>}
      {plano.estado === 'PREVIA' ? <><p className="mt-5 text-sm text-slate-500">Ao confirmar, os {plano.dados.itens.length} agendamentos acima serão criados no Sírius. A disponibilidade será verificada novamente. Esta prévia expira em 30 minutos.</p><button type="button" className="btn-primary mt-3" disabled={ocupado || !plano.dados.itens.length} onClick={confirmar}>{ocupado ? 'Enviando…' : `Confirmar e criar ${plano.dados.itens.length} agendamento(s)`}</button></> : <p role="status" className={`mt-4 rounded-xl p-4 text-sm ${plano.estado === 'CONCLUIDO' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{plano.resultado?.mensagem || 'Envio iniciado. Consulte o histórico para acompanhar. Se permanecer assim, confira no Sírius; o lote não será reenviado.'}</p>}
    </section>}
    <section className="card mt-5 p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Histórico de planejamento</h2><button type="button" className="text-sm text-brand-700" onClick={() => reload().catch(e => setErro(e.message))}>Atualizar</button></div><p className="mt-2 text-xs text-slate-500">Envios incertos mantêm os horários reservados para evitar duplicidade. Consulte a agenda no Sírius para conferir o resultado.</p><div className="mt-4 space-y-2">{historico.map(p => <button key={p.id} type="button" disabled={ocupado} className="flex w-full flex-wrap justify-between gap-2 rounded-lg border border-slate-100 p-3 text-left text-sm hover:bg-slate-50" onClick={() => { setPlano(p); setErro(''); }}><span>{p.dados.vendedorNome} · {p.dados.itens.length} contato(s) · {new Date(p.criadoEm).toLocaleString('pt-BR')}</span><strong>{p.estado}</strong></button>)}{!historico.length && <p className="text-sm text-slate-500">Nenhum planejamento ainda.</p>}</div></section>
  </>;
}
function Campo({ label, ...props }: { label: string; name: string; type: string; defaultValue: string | number; min?: string | number; max?: number }) { return <label className="text-sm font-medium">{label}<input required className="field mt-2" {...props} /></label>; }
function Tabela({ itens }: { itens: Item[] }) { return !itens.length ? <p className="mt-5 text-sm text-slate-500">Nenhum contato viável. Amplie o período, revise os limites ou selecione outros clientes.</p> : <div className="mt-4 max-h-[520px] overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Dia', 'Horário', 'Cliente / cidade', 'Motivo'].map(c => <th className="p-3" key={c}>{c}</th>)}</tr></thead><tbody>{itens.map(i => <tr key={i.id} className="border-t border-slate-100"><td className="p-3 whitespace-nowrap">{dataBr(i.dia)}</td><td className="p-3 whitespace-nowrap">{horario(i.inicio)}–{horario(i.fim)}</td><td className="p-3 font-medium">{i.nome}<span className="block text-xs font-normal text-slate-500">{i.cidade || 'Cidade não informada'}</span></td><td className="p-3 text-slate-500">{i.motivo} · {i.pontuacao} pontos</td></tr>)}</tbody></table></div>; }
