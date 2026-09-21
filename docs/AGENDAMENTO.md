# Agendamento de clientes no Sírius

## Visualização e manutenção

`/agenda` abre o visualizador. **Visão gestor** reúne todos os vendedores cadastrados na filial conectada; **Visão vendedor** exige escolher um vendedor. São modos de visualização do usuário autenticado, não novos perfis de acesso ou logins de vendedores.

O calendário oferece dia, semana e mês, navegação de períodos, identificação por vendedor e lista detalhada. A busca filtra cliente, vendedor, cidade e contato; o filtro de status utiliza os valores efetivamente retornados pelo Sírius. Cada vendedor é consultado individualmente com concorrência limitada a quatro consultas. Falhas parciais são identificadas e não são exibidas como agenda vazia. Clientes não sincronizados aparecem pelo código externo; registros sem horário bloqueiam o dia e aparecem como horário indefinido.

**Novo agendamento** inclui um cliente da carteira do vendedor, com data, início, fim, tipo de interação e observação. **Editar** permite alterar data/horário efetivo, contato e status, preservando os demais campos suportados pelo contrato. Interação e observação não são editáveis porque não fazem parte de `AgendaVendedorRequest`. Vendedor e cliente de um compromisso existente são preservados. A exclusão pede confirmação mostrando o compromisso selecionado. Vendedores inativos podem ser consultados, mas não recebem novas gravações por esta interface.

Inclusões e mudanças de horário verificam capacidade diária, margem entre atendimentos, duplicidade do cliente no mesmo dia, feriados e reservas. Atualizações apenas de contato/status são permitidas para compromissos passados. Na inclusão manual, expediente, almoço e dias de trabalho são escolhidos pelo operador; o planejamento automático mantém suas próprias regras completas em `/agenda/planejar`.

Antes de alterar ou excluir, o backend consulta o evento na agenda/filial correta e compara sua versão com a versão visualizada. Se mudou, pede atualização em vez de sobrescrever. Cada ação usa uma identificação única persistida em `acoes_agenda`, compartilha o lock do planejamento e não repete a gravação ao receber a mesma solicitação. A interface mostra o histórico de resultados, incluindo situações incertas.

Depois de gravar, o backend consulta novamente o Sírius para verificar o resultado. Uma alteração/exclusão confirmada libera as reservas locais anteriores sem apagar o histórico. Erros de transporte e resultados divergentes preservam reservas e ficam INCERTO. A API externa não oferece transação conjunta com nossa consulta, portanto não há garantia de exclusão mútua contra edições feitas diretamente no Sírius entre a validação e a gravação.

Rotas adicionadas: `POST /siriusservidor/agendavendedor/alterar` com array de `AgendaVendedorRequest` e `DELETE /siriusservidor/agendavendedor/excluir/{codigo}`. A permissão efetiva de edição/exclusão depende da sessão do Sírius; o Swagger nomeia a exclusão como exclusão de agenda própria. Não são utilizados endpoints de eventos de atendimento ou de recorrência do cliente.

O arquivo `backend/tests/fixtures/agenda-ui.mjs` serve o build do frontend na porta local 5190 com dados inteiramente fictícios para QA de criação, edição, exclusão e filtros; não carrega `.env`, banco nem integrações externas. Não faz parte do servidor da aplicação.

## Operação em formato CRM

`/agenda/operar` oferece uma fila diária para toda a equipe da filial ou para um vendedor. Os cartões são separados em **A fazer**, **Atendidos** e **Conferir no Sírius**. Busca por cliente, vendedor, cidade ou contato e troca de data permitem organizar o trabalho do dia. O detalhe mostra agenda, status, interação e contato antes de registrar o resultado.

A lista de resultados vem de `GET /siriusservidor/ocorrenciatmk/obter`; nenhum código de ocorrência é criado ou inferido localmente. O operador seleciona a ocorrência, informa a pessoa/setor contatado, mantém ou ajusta o tipo de interação e registra um resumo. O backend relê a tabela de ocorrências e o agendamento no Sírius, confere vendedor, data e versão, e envia um array de `AgendaEventoRequest` para `POST /siriusservidor/agendaevento/inserir`.

O campo `usuarioLogado` usa `loginSirius` da conexão autenticada. `dataAgenda` e `horaAgenda` representam o instante do registro no fuso de Brasília. Campos opcionais para cliente novo e sessão são omitidos no atendimento de clientes da carteira. A tela não usa `validarocorrencia/{codigo}`, pois essa rota pertence ao fluxo documentado de ocorrências de cliente novo.

Cada tentativa recebe uma chave única e é persistida em `atendimentos_agenda` como ENVIANDO antes do POST. Um lock por destino, vendedor e agenda impede dois atendimentos simultâneos. O mesmo compromisso não aceita outro registro enquanto existir um atendimento ENVIANDO, CONCLUIDO ou INCERTO pelo Gerente Comercial. Repetir a mesma requisição não repete o POST; reutilizar a chave com dados diferentes é recusado.

O endpoint de inclusão não documenta um modelo de resposta nem uma consulta do histórico de eventos para clientes existentes. Por isso, HTTP 2xx sem indicação explícita de falha é registrado como CONCLUIDO; erro ou timeout vira INCERTO. Em estado incerto, a aplicação bloqueia nova tentativa e orienta a conferência no histórico do Sírius para evitar duplicidade. Atendimentos realizados fora desta aplicação não aparecem nas colunas locais, embora o status atualizado da agenda continue visível após a consulta.

Acesse **Agenda dos vendedores** ou **Agendar** na carteira / oportunidade. Conecte-se ao Sírius, escolha um vendedor da filial conectada, os clientes e as regras, gere a prévia e use **Confirmar e criar** para enviar exatamente a proposta revisada.

## Regras

- Padrões editáveis: 12 contatos totais por dia, 20 minutos por contato, 10 minutos de intervalo, expediente 08h–18h, almoço 12h–13h, segunda a sexta e 7 dias entre contatos do mesmo cliente.
- Janela de até 31 dias; horários de Brasília. Horários passados não são usados. Datas de férias, feriados e outros bloqueios podem ser informadas explicitamente.
- Compromissos existentes e reservas locais consomem capacidade diária. Horários desconhecidos bloqueiam o dia inteiro; feriados sinalizados pelo Sírius também. Estados de cancelamento/conclusão não são interpretados porque o Swagger não define seus valores; todos os registros retornados são considerados conservadoramente.
- Reagendamentos bloqueiam o horário original e o novo. A consulta inclui dias anteriores e posteriores ao período para respeitar o intervalo entre contatos.
- Cada cliente recebe no máximo um novo contato por prévia. A seleção automática utiliza oportunidades NOVA, EM_ANALISE ou ENCAMINHADA, ordenadas pela maior pontuação do cliente. A seleção manual permite outros clientes da carteira.
- Agrupamento opcional por cidade prefere a cidade do último cliente escolhido no dia, após iniciar pela maior prioridade. Não calcula distâncias, trânsito nem rotas. Ajuste a margem de deslocamento para visitas. Não há calendário nacional/municipal automático.
- A prévia lista os clientes sem encaixe. Mudar os parâmetros exige uma nova prévia. Confirmações expiram após 30 minutos e reconsultam a agenda para detectar conflitos.

## Contrato externo e limites

A especificação consultada em 14/09/2026 está em `sirius-api-current.json`.

- `GET /siriusservidor/agendavendedor/obter`: authorization, filial, vendedor, dataInicial, dataFinal.
- `POST /siriusservidor/agendavendedor/inserir`: array de AgendaVendedorNovaRequest; valida resposta AgendaVendedorNovaResponse, incluindo correspondência de codigoExterno e vendedor por item.
- A geração automática usa apenas a rota de inclusão. A manutenção manual usa também alterar e excluir, conforme descrito acima.
- `tipoInteracao` é escolhido pelas opções `Presencial` ou `Remoto`, enviadas ao Sírius como `P` e `R`. O backend rejeita qualquer outro valor.
- A visualização apresenta os status como `Positivado`, `Recusado`, `Em aberto` e `Reagendado`, mantendo internamente os códigos `P`, `C`, `A` e `R` do Sírius.
- `dataAgendaLong` é tratado como epoch em milissegundos, com a data à meia-noite de Brasília; filtros usam AAAA-MM-DD e horários HH:mm. São hipóteses de interoperabilidade que precisam de validação com um registro real nesta instalação, pois o Swagger só informa os tipos. Retornos incompatíveis bloqueiam o planejamento.
- O envio usa sequenciaRota=0 para não renumerar a rota existente. Permissões e validações adicionais do servidor podem recusar a inclusão.

## Persistência e concorrência

`planos_agenda` guarda a proposta, regras, usuário, destino/filial, vendedor, estado e resultado. A confirmação nunca aceita horários arbitrários enviados pelo frontend.

Um advisory lock PostgreSQL por destino/vendedor serializa a revalidação e a reserva da capacidade, inclusive entre processos desta aplicação. O estado ENVIANDO é persistido antes do POST externo. Confirmações repetidas retornam o estado existente sem repetir o POST.

Retorno parcial, formato divergente, erro ou timeout ficam INCERTO; uma interrupção do processo pode deixar ENVIANDO. Ambos preservam reservas e impedem reenvio automático do lote. O histórico permite inspecionar a proposta e a situação. A conferência/reconciliação de envios incertos deve ser feita no Sírius. Alterações e exclusões confirmadas por esta aplicação liberam as reservas anteriores; mudanças feitas diretamente no Sírius ainda não liberam reservas automaticamente.

A API externa não documenta operação atômica de reservar/criar nem garantia de idempotência por codigoExterno. Alterações diretas no Sírius entre a última consulta e a inclusão ainda podem gerar conflito. Não se promete proteção contra gravações concorrentes realizadas fora desta aplicação.

## Validação

Testes automatizados usam respostas simuladas, sem criar agendas no serviço real: limite diário, almoço, margem de atendimento, prioridade, agrupamento, dias bloqueados, feriados, contatos próximos, reagendamentos, respostas inválidas, contrato HTTP, expiração, propriedade da prévia, reservas, repetição, timeout e retorno parcial. A migration é aditiva e não altera tabelas comerciais existentes.
