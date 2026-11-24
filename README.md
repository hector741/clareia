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

### Fazer em × Prazo

- **Fazer em** é a *intenção de trabalho*: o dia em que você pretende trabalhar na tarefa.
- **Prazo** é o *vencimento*: quando a entrega precisa estar pronta.

Os dois campos são independentes. **Focar hoje** define Fazer em como hoje e **não** altera o Prazo. Uma tarefa com Fazer em no passado e Prazo no futuro aparece em **Replanejar** (e não como atrasada); só o Prazo anterior a hoje aparece como **Prazo passou**.

## Sincronização e conexão

- Cada alteração aparece na hora e é gravada na conta em seguida, em ordem. Se a gravação falhar (sem internet, sessão expirada), a alteração é desfeita na tela e o app avisa; o texto digitado é preservado para tentar de novo.
- O app busca o que outros aparelhos gravaram ao voltar para a janela, ao reconectar e a cada minuto.
- Se dois aparelhos editarem a mesma tarefa ao mesmo tempo, vale a última gravação.
- É preciso internet para usar o app; ainda não há modo offline.

## Exportar e restaurar dados

Em **Configurações**:

- **Exportar dados** gera `clareia-backup-AAAA-MM-DD.json` com listas, tarefas (pendentes, concluídas e na Lixeira) e etapas. O app registra “Última exportação gerada” na conta.
- **Escolher arquivo de backup** valida o arquivo inteiro (até 10 MiB) antes de qualquer alteração. Se estiver válido, mostra as contagens e pede confirmação para **Substituir dados da conta**, com opção de exportar os dados atuais antes. A restauração acontece em uma única transação no banco; se algo falhar, os dados anteriores permanecem intactos. Não existe mesclagem.

## Banco de dados e login (Supabase)

- **Esquema:** `supabase/migrations/20261124180000_clareia_schema.sql` cria `lists`, `tasks` e `user_settings`, cada linha ligada a `auth.users` pelo `user_id`.
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
src/features/install instalação na tela inicial
src/db               cópia local, repositório (regras e gravação em fila) e leitura dos dados antigos (Dexie)
src/domain           tipos, datas, schemas Zod, Hoje/foco, filtros, ordenação, backup
src/styles           tokens e estilos globais
supabase             migração SQL, configuração de autenticação e modelos de e-mail
e2e                  testes de ponta a ponta (Playwright)
```

Stack: React + TypeScript (estrito) + Vite, CSS Modules, Radix Primitives, Lucide, Supabase (Postgres, Auth, RLS), Zod e React Router (HashRouter). Dexie só para ler as tarefas da versão sem conta. Testes com Vitest, Playwright e axe-core.

## Evoluções previstas (ainda não existem)

Recorrência, Kanban, calendário completo, notificações, uso offline (service worker), modo escuro, arrastar e soltar, login com Google, equipes e recursos de IA.
