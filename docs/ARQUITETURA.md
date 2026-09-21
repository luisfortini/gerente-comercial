# Arquitetura e contratos confirmados

O repositório estava vazio em 26/08/2026. A especificação Swagger 2.0 foi copiada sem alterações para `docs/sirius-api-v2.json`.

## Componentes

- `frontend`: React, Vite, TypeScript, Tailwind CSS e Recharts. Consome apenas a API local.
- `backend`: Express/TypeScript, autenticação JWT em cookie HttpOnly, cliente Sírius com timeout e lista fechada de consultas, sincronizador mensal e motor analítico determinístico.
- `PostgreSQL`: fonte do dashboard. Prisma aplica nomes físicos em português, chaves únicas e índices.
- Sessão Sírius: token mantido somente em memória e associado ao usuário autenticado. Reiniciar o backend exige reconexão, deliberadamente, pois a senha não é armazenada.

## Swagger confirmado

| Operação | Método | Body/resposta |
|---|---|---|
| `/autenticacao/entrar` | POST | `CredencialImpl` → `LoginRespostaImpl` |
| `/vendedor/obtertodos` | GET | sem body → `Vendedor[]` |
| `/vendedor/obter` | POST | `UsuarioCompletoRequest` → `Vendedor[]` |
| `/dashboards/vendedor/carteira-completa` | POST | `FiltroDashboardVendedorRequest` → `ClienteCarteiraResponse[]` |
| `/relatorios/vendas` | POST | `SolicitacaoIdentificacaoRequest` → `RelatorioVendas[]` |
| `/relatorios/produtocliente` | POST | `SolicitacaoIdentificacaoRequest` → `RelatorioProdutoCliente[]` |
| `/relatorios/vendacliente` | POST | `SolicitacaoIdentificacaoRequest` → `RelatorioVendaCliente[]` |
| `/relatorios/vendasproduto` | POST | `SolicitacaoIdentificacaoRequest` → `RelatorioVendaProduto[]` |
| `/dashboards/dadosmix` | POST | `FiltroDashboardRequest` → `VendaDadosMix[]` |

O Swagger marca `authorization` como header obrigatório nas consultas, mas não define security scheme nem prefixo. O sistema oferece token puro e `Bearer`. `SolicitacaoIdentificacaoRequest` possui os filtros confirmados `codigoFilial`, `dataInicial`, `dataFinal`, `vendedorSelecionado`, `codigoCliente`, `produto` e `fabricanteProduto`, entre outros. `FiltroDashboardRequest` exige `dataInicial` e `dataFinal`. Em `UsuarioCompletoRequest`, apenas `login` está marcado como obrigatório. `CredencialImpl` não marca campos obrigatórios apesar da necessidade operacional de login, senha e filial.

## Fórmula de prioridade

Pontuação limitada a 100: atraso relativo até 30 pontos; frequência (2 pontos por compra) até 20; valor médio (`log10(valor) × 5`) até 20; queda (0,4 ponto por ponto percentual) até 20; recorrência do produto, 10 pontos. Classificação: alta ≥ 80, média ≥ 50, baixa < 50. Não há aleatoriedade nem uso de IA.

## Incertezas e limites

- A documentação pode não refletir permissões e validações da instalação; o diagnóstico registra status e formato real de cada resposta.
- Sem credenciais reais não foram executadas consultas autenticadas nem confirmada a semântica de todos os inteiros de filtro.
- `RelatorioVendas.listaItens` é opcional. Sem ele, o motor continua por cliente e informa que os produtos estão indisponíveis.
- A carteira documentada retorna apenas classificação, dias desde a última compra, faturamento textual e razão social; não é usada como fonte primária da sincronização.
- O token em memória atende ao requisito de não persistência, mas não é adequado a múltiplas réplicas sem um armazenamento de sessão compartilhado.

## Validação real somente leitura

Em 26/08/2026, com filial 1 e sem executar qualquer rota de mutação, a autenticação aceitou a versão `1.1.5` e o formato de `authorization` com token puro. A consulta real confirmou 47 vendedores e os campos documentados de `Vendedor`. Em uma janela curta, `vendasproduto` retornou 10 registros e `dadosmix` retornou 3; vendas detalhadas, produtos por cliente e carteira retornaram listas válidas vazias. Na janela de 12 meses, `relatorios/vendas` retornou 2 vendas com todos os campos documentados, mas sem `listaItens`, confirmando na prática a necessidade do estado de análise por produto indisponível.

O fluxo local importou as 2 vendas e 2 clientes, manteve 47 vendedores e, após uma segunda sincronização idêntica, continuou com exatamente 2 vendas e zero chaves externas duplicadas. Os 13 intervalos mensais foram concluídos nas duas execuções.

Em 27/08/2026, uma nova validação mostrou que `RelatorioVendas.listaItens` continua documentado, mas veio `null` em todas as vendas reais, independentemente dos filtros testados. No modo `faturadosNota: 0`, o endpoint somente leitura `relatorios/vendasproduto` retornou 763 linhas para 195 vendas e apresentou correspondência integral e sem ambiguidade por filial, número do pedido, vendedor e data de emissão. No modo `1`, as notas retornadas não possuíam chaves correspondentes no relatório de produtos. A sincronização passou a usar o modo `0`, preferir `listaItens` quando disponível e recorrer a `vendasproduto` como fonte complementar, permitindo análises de mix e recompra por produto sem inventar dados.

Cada venda sincronizada registra o modo de relatório que a originou. Dashboard, resumo de cliente e motor de oportunidades usam o modo `0`, validado com itens, enquanto registros antigos de outros modos permanecem preservados no banco para auditoria. Essa separação evita duplicidade analítica sem apagar histórico local.
