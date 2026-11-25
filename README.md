# Clareia

Organizador de tarefas pessoal, em português do Brasil, com conta própria: as tarefas ficam salvas na nuvem (Supabase) e aparecem em todos os aparelhos onde você entrar. *Clareia* é um nome provisório.

Capture tarefas só com o título, escolha até três para o foco do dia, organize em listas e acompanhe o que foi concluído.

Publicado em <https://clareia-sage.vercel.app>.

## Requisitos

- Node.js `^20.19.0` ou `>=22.12.0` (exigência do Vite 8). Desenvolvido com Node 26 e npm 11.
- Um projeto Supabase com o esquema de `supabase/migrations` aplicado (veja **Banco de dados e login**).

## Instalar e executar

Crie o arquivo `.env.local` (não vai para o Git) com o endereço e a chave **publicável** do projeto Supabase:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Depois:

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (normalmente `http://localhost:5173`). Sem sessão, o app mostra a tela **Entrar**.

## Comandos de verificação

| Comando | O que faz |
| --- | --- |
| `npm run typecheck` | Checagem de tipos (TypeScript estrito). |
| `npm run lint` | ESLint. |
| `npm test` | Testes de domínio e do repositório contra um servidor simulado (Vitest). |
| `npm run build` | Checagem de tipos e build de produção em `dist/`. |
| `npm run check` | Tipos, lint, testes e build em sequência. |
| `npm run test:e2e` | Testes de ponta a ponta com Playwright, incluindo cadastro, confirmação, login e recuperação de senha. Usam o servidor simulado (`VITE_BACKEND=memory`), sem tocar no Supabase. |
| `node scripts/integration-test.mjs` | Testa contra o Supabase real: cria dois usuários temporários, verifica gravação, isolamento entre contas (RLS), limite de foco no banco, listas e backup, e apaga os usuários. Requer `.env.supabase`. |

Na primeira vez que usar os testes de ponta a ponta, instale o navegador do Playwright: `npx playwright install chromium`.

## Conta e login

- **Criar conta:** e-mail e senha (mínimo de 8 caracteres, com letras e números). O Supabase envia um link de confirmação; a conta só entra depois de confirmada. Na tela de entrada há **Reenviar link de confirmação**.
- **Entrar / Sair:** a sessão fica salva no navegador e é renovada automaticamente. **Configurações → Conta → Sair da conta** encerra a sessão neste aparelho.
- **Esqueci minha senha:** envia um link; ao abri-lo, o app pede a nova senha. **Configurações → Conta → Alterar senha** troca a senha estando conectado.
- **Tarefas de antes do login:** se este navegador tiver tarefas da versão sem conta, no primeiro acesso o app oferece **Enviar para minha conta** (acrescenta sem substituir nada e mantém a cópia local). Se escolher **Agora não**, a opção continua em Configurações.

## Como usar

- **Cadastrar:** escreva o título no campo “O que você precisa fazer?” e pressione Enter ou use **Adicionar**. Só o título é obrigatório. Em **Hoje**, a tarefa recebe *Fazer em* = hoje; dentro de uma lista, ela entra nessa lista; nas demais telas vai para a **Entrada**. **Mais detalhes** abre o editor antes de criar. **Nova tarefa**, no cabeçalho, faz o mesmo.
- **Organizar:** crie listas em **Nova lista** (nome e cor da paleta). Mova uma tarefa pelo menu `…` da linha (**Mover para**) ou pelo editor. Tarefas sem lista ficam na **Entrada**. Em Entrada e em cada lista, a **Ordem manual** habilita **Mover para cima/baixo** no menu da tarefa.
- **Detalhar:** clique no título para abrir o editor: descrição, prioridade, datas e etapas (checklist de um nível). Marcar todas as etapas não conclui a tarefa.
- **Planejar:** use **Fazer em** e **Prazo** (veja abaixo). **Próximas** mostra o que tem data futura; **Todas** mostra todas as pendentes.
- **Focar:** no menu da tarefa, **Focar hoje** coloca a tarefa em **Em foco** (máximo de 3 por dia, garantido também pelo banco, mesmo entre aparelhos). Para escolher outra com o limite atingido, use **Retirar do foco** em uma delas. Concluir ou excluir uma tarefa libera a vaga. Ao virar o dia, o foco antigo deixa de valer, mas nada é apagado nem concluído.
- **Concluir:** marque a caixa da tarefa. Se houver etapas abertas, o app pede confirmação e não marca as etapas por você. O histórico fica em **Concluídas**, onde é possível **Reabrir**.
- **Excluir:** **Mover para a Lixeira** é reversível (**Restaurar**). **Excluir definitivamente** pede confirmação e não tem volta.
- **Buscar:** **Busca** pesquisa em título, descrição e etapas, sem diferenciar maiúsculas ou acentos (“reuniao” encontra “Reunião”), com filtros de lista, prioridade, situação e prazo combinados.

### Pomodoro

- **Iniciar:** o botão de temporizador na linha da tarefa (ícone de cronômetro, “Iniciar foco”) começa uma sessão de foco. Padrões: 25 min de foco, 5 min de pausa curta e 15 min de pausa longa depois de 4 Pomodoros completos. Ajuste em **Configurações → Pomodoro**.
- **Durante a sessão:** um painel fica visível em todas as telas (cartão no canto, no computador; barra acima da navegação, no celular) com a tarefa, o tempo restante, o anel de progresso, a etapa (Foco, Pausa curta, Pausa longa, Pausado, escrita por extenso e não só pela cor) e quantos Pomodoros a tarefa já tem. Há **Pausar**, **Retomar** e **Encerrar**; encerrar antes da hora pede confirmação e não conta como Pomodoro. O título da aba mostra o tempo.
- **Um temporizador por vez:** iniciar o foco em outra tarefa pergunta antes. **Pausar e trocar** guarda a sessão atual, pausada, para retomar depois. **Encerrar e trocar** descarta a sessão atual.
- **Quando o tempo acaba:** toca um sino suave e aparece o aviso “O tempo de foco terminou. Você concluiu esta tarefa?”. Ele oferece três caminhos:
  - **Concluir tarefa:** conclui e oferece uma pausa.
  - **Continuar tarefa:** pausa, mais um Pomodoro, ou 5 ou 10 min extras.
  - **Decidir depois:** a tarefa fica pendente.

  O fim do tempo **nunca** conclui a tarefa sozinho. Ao fim da pausa, o aviso diz que dá para retomar a tarefa. A próxima etapa só começa com uma ação sua.
- **Contagem:** cada sessão que chega ao fim é registrada na conta (tabela `focus_sessions`) e aparece na linha da tarefa, por exemplo “3 Pomodoros · +10 min extra”. O tempo extra é contado à parte. Sessões interrompidas não contam.
- **Som e notificações:** em Configurações você controla o volume, silencia ou ouve uma prévia do sino. Também pode **Ativar notificações**, que só são pedidas quando você clica; elas aparecem quando o Clareia está em outra aba ou minimizado. O aviso na tela aparece sempre. Se o navegador bloquear o som ou a notificação, o temporizador continua normalmente e o aviso explica o que aconteceu.
- **Confiabilidade:** o tempo é calculado pelo horário previsto de término, não por contagem. A sessão fica salva no navegador (por conta): ao atualizar a página ela continua, pausada ou correndo. Entre abas há um único temporizador; uma trava (Web Locks) garante que só uma aba toque o sino e registre a sessão. A resposta ao aviso, dada em qualquer aba, vale para todas. Se o tempo acabar com a página fechada, o aviso aparece uma vez ao voltar, sem tocar o sino.
- **Limitações:** o alarme só toca com o Clareia aberto (aba ou app instalado). Com o navegador fechado, nada toca, porque não existe servidor de push. Em aba oculta, o navegador pode atrasar o aviso alguns segundos; o título com o tempo e o cálculo pelo horário de término reduzem isso. No iPhone, notificações só funcionam com o app adicionado à Tela de Início. O temporizador ativo vale para o navegador onde foi iniciado e não aparece em outro aparelho; a contagem, sim. Tempos, volume e notificações são preferências deste aparelho.

### Fazer em × Prazo

- **Fazer em** é a *intenção de trabalho*: o dia em que você pretende trabalhar na tarefa.
- **Prazo** é o *vencimento*: quando a entrega precisa estar pronta.

Os dois campos são independentes. **Focar hoje** define Fazer em como hoje e **não** altera o Prazo. Uma tarefa com Fazer em no passado e Prazo no futuro aparece em **Replanejar** (e não como atrasada); só o Prazo anterior a hoje aparece como **Prazo passou**.

## Compras

A aba **Compras** (no menu lateral e, no celular, na quinta aba da navegação) guarda listas de compras de um jeito que não mistura previsão com dinheiro gasto.

- **Listas:** nome, mercado (opcional), orçamento (opcional; zero é válido) e data prevista (opcional). Status: *rascunho*, *em compras* e *finalizada*. **Arquivar** tira a lista da tela principal sem apagar nada. Excluir só vale para listas que ainda não foram finalizadas; a lista finalizada fica como registro.
- **Itens:** digite o nome e pressione Enter para adicionar com quantidade 1 e categoria “Outros”. **Com detalhes** abre o editor: embalagem (cadastro de produto e variante), categoria (dez categorias fixas), unidade de venda (un, kg ou L), quantidade e preço estimado. Gramas e mililitros são convertidos automaticamente para kg e L.
- **Previsão × confirmação:** a estimativa é só previsão. O total gasto só entra quando você confirma o preço e a quantidade efetiva de um item no mercado (**Informar preço**). O estimado vem da última compra confirmada da mesma variante no mesmo mercado. Preço de outro mercado é mostrado como referência e só é usado se você escolher **Usar preço de outro mercado**.
- **Modos:** **Planejar** organiza a lista por categoria. **Ir às compras** mostra pendentes antes do carrinho, marca itens no carrinho, permite **Dividir** uma linha (o restante volta como pendente) e **Desisti** (o item sai da previsão e fica em “Desistidos”).
- **Dinheiro:** valores são guardados em centavos e quantidades em milésimos, sem ponto flutuante. O arredondamento do valor bruto é meio para cima.
- **Finalizar:** **Revisar e finalizar** exige que todos os itens do carrinho tenham preço confirmado. Você confere mercado, data, desconto geral e despesas extras, e escolhe se os itens pendentes ficam de fora ou vão para uma nova lista. A finalização é uma única operação no banco: repetir o clique ou abrir a lista em outra aba não cria outra compra.
- **Correções e anulações:** a compra finalizada fica somente leitura na lista. **Corrigir** cria uma nova revisão (exige motivo) e preserva a anterior como substituída. **Anular** exige motivo e mantém o registro, que sai dos totais.
- **Histórico:** em **Compras → Histórico** você filtra por período e mercado, vê o total do período e pode mostrar compras anuladas. **Recomprar** cria uma lista a partir de uma compra anterior.
- **Produtos e comparação:** em **Compras → Produtos** você cadastra mercados, produtos e embalagens. A tela de produto compara preços por embalagem ou por kg, L ou un, com gráfico e tabela. Só aparecem pontos de compras reais: sem compra, não há ponto nem variação, e uma compra sem anterior no mesmo mercado não mostra “0,00%”.
- **Acessibilidade:** alvos de toque de 44 px, sem elementos interativos aninhados, movimento reduzido respeitado, funciona em 360, 768 e 1440 px.
- **Limitações:** Compras precisa de internet (ainda não há modo offline). Não entra em contadores nem no foco de tarefas. A comparação usa os preços confirmados; não há leitura de código de barras nem de nota fiscal.

## Sincronização e conexão

- Cada alteração aparece na hora e é gravada na conta em seguida, em ordem. Se a gravação falhar (sem internet, sessão expirada), a alteração é desfeita na tela e o app avisa; o texto digitado é preservado para tentar de novo.
- O app busca o que outros aparelhos gravaram ao voltar para a janela, ao reconectar e a cada minuto.
- Se dois aparelhos editarem a mesma tarefa ao mesmo tempo, vale a última gravação.
- É preciso internet para usar o app; ainda não há modo offline.

## Exportar e restaurar dados

Em **Configurações**:

- **Exportar dados** gera `clareia-backup-AAAA-MM-DD.json` com listas, tarefas (pendentes, concluídas e na Lixeira), etapas, sessões de foco e o bloco `shopping` (mercados, produtos, variantes, listas, itens e compras com todas as revisões). Backups antigos, sem sessões, continuam aceitos. O app registra “Última exportação gerada” na conta.
- **Versões:** o formato atual é o 2. Um arquivo da versão 1 não tem o bloco de compras: ao restaurá-lo, as compras atuais são mantidas. Arquivos de uma versão mais nova que a do app são recusados sem alterar nada.
- **Escolher arquivo de backup** valida o arquivo inteiro (até 10 MiB) antes de qualquer alteração. Se estiver válido, mostra as contagens e pede confirmação para **Substituir dados da conta**, com opção de exportar os dados atuais antes. A restauração acontece em uma única transação no banco; se algo falhar, os dados anteriores permanecem intactos. Não existe mesclagem.

## Banco de dados e login (Supabase)

- **Esquema:** `supabase/migrations/20261124180000_clareia_schema.sql` cria `lists`, `tasks` e `user_settings`, cada linha ligada a `auth.users` pelo `user_id`. `20261124210000_focus_sessions.sql` acrescenta `focus_sessions` (Pomodoros e tempo extra por tarefa, só inserção, apagados junto com a tarefa) e inclui as sessões em `import_data`.
- **Segurança:** RLS ativo em todas as tabelas; cada usuário só lê e altera as próprias linhas, e o papel anônimo não tem acesso. O app usa apenas a chave publicável.
- **Regras no banco:** gatilho que impede mais de 3 tarefas em foco por dia (com trava por usuário contra gravações simultâneas) e funções `delete_list`, `set_task_positions` e `import_data`, que executam operações compostas numa única transação.
- **Autenticação:** `supabase/auth-config.json` (endereço do site, endereços de retorno permitidos, senha mínima, confirmação de e-mail obrigatória).
- **Administração:** `node scripts/supabase-admin.mjs` aplica SQL e configurações pela Management API. Lê `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` de `.env.supabase`, que não vai para o Git.

### E-mails da conta

Com o servidor de e-mail padrão do Supabase (plano gratuito):

- os e-mails de confirmação e de redefinição saem **em inglês**, com o texto padrão;
- o envio é limitado a poucas mensagens por hora;
- o Supabase só entrega para endereços autorizados no projeto.

Para abrir o cadastro a qualquer pessoa, configure um SMTP próprio (por exemplo, Resend) em *Authentication → Emails → SMTP Settings*. Depois aplique os modelos em português de `supabase/email-templates.pt-BR.json` com `node scripts/supabase-admin.mjs auth-patch supabase/email-templates.pt-BR.json`. Esses modelos levam ao app um link que só confirma após um toque, o que protege contra leitores automáticos de links, e trazem também um código de 6 dígitos.

## No celular

O Clareia reconhece o celular pela largura da tela (menos de 768 px) e também quando é um aparelho de toque deitado. Nesse caso se organiza como aplicativo: barra superior compacta com busca, navegação inferior (Hoje, Entrada, Próximas, Mais), botão flutuante **Nova tarefa** ao alcance do polegar, editor em tela cheia e respeito às bordas do aparelho (entalhe e barra de gestos). As telas de conta também se adaptam.

Ele pode ser adicionado à tela inicial e abre em tela cheia, sem a barra do navegador:

- **Android (Chrome):** menu ⋮ → *Instalar aplicativo*, ou **Configurações → Usar como aplicativo → Instalar aplicativo**.
- **iPhone (Safari):** *Compartilhar* → *Adicionar à Tela de Início*.

No iPhone, o app instalado tem uma sessão separada da do Safari: entre na conta dentro dele. Os links de e-mail abrem no navegador; depois de confirmar ou trocar a senha por lá, entre no app instalado com a senha.

Os ícones em `public/icons` são gerados por `node scripts/generate-icons.mjs`.

## Publicar na Vercel

O projeto está ligado ao repositório do GitHub: cada `git push` na `main` publica uma nova versão. O preset **Vite** usa `npm run build` e a pasta `dist`; não é preciso configurar rotas, porque o app usa `HashRouter`. As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` estão configuradas na Vercel para produção, prévias e desenvolvimento.

## Estrutura

```
src/app              layout, navegação, rotas, contextos (login, dados) e páginas
src/backend          Supabase (cliente, autenticação, persistência), servidor simulado e erros de login
src/components/ui    componentes reutilizáveis (botão, campo, data, estado vazio…)
src/features/auth    telas de entrar, criar conta, confirmar e-mail e nova senha
src/features/account conta (alterar senha, sair) e envio das tarefas de antes do login
src/features/tasks   captura, linha, grupos, editor e checklist
src/features/lists   gerenciamento de listas
src/features/backup  exportação e restauração
src/features/compras listas, itens, finalização, histórico, produtos e comparações (regras em src/domain/shopping)
src/features/install instalação na tela inicial
src/features/pomodoro temporizador: regras (model.ts), painel, avisos, som, notificações e configurações
public/notify-sw.js  service worker mínimo, só para notificações no celular (sem cache)
src/db               cópia local, repositório (regras e gravação em fila) e leitura dos dados antigos (Dexie)
src/domain           tipos, datas, schemas Zod, Hoje/foco, filtros, ordenação, backup
src/styles           tokens e estilos globais
supabase             migração SQL, configuração de autenticação e modelos de e-mail
e2e                  testes de ponta a ponta (Playwright)
```

Stack: React + TypeScript (estrito) + Vite, CSS Modules, Radix Primitives, Lucide, Supabase (Postgres, Auth, RLS), Zod e React Router (HashRouter). Dexie só para ler as tarefas da versão sem conta. Testes com Vitest, Playwright e axe-core.

## Evoluções previstas (ainda não existem)

Recorrência, Kanban, calendário completo, lembretes por push com o navegador fechado, uso offline (service worker), modo escuro, arrastar e soltar, login com Google, equipes e recursos de IA.
