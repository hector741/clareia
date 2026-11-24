# Clareia

Organizador de tarefas pessoal, em português do Brasil, que funciona inteiramente no navegador. Sem cadastro, sem servidor e sem integrações. *Clareia* é um nome provisório.

Capture tarefas só com o título, escolha até três para o foco do dia, organize em listas e acompanhe o que foi concluído.

## Requisitos

- Node.js `^20.19.0` ou `>=22.12.0` (exigência do Vite 8). Desenvolvido com Node 26 e npm 11.
- Um navegador atual (Chrome, Edge, Firefox ou Safari) com IndexedDB habilitado.

## Instalar e executar

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (normalmente `http://localhost:5173`). A raiz leva a `#/hoje`.

Para servir a versão de produção localmente:

```bash
npm run build
npm run preview
```

A pasta `dist/` é estática e pode ser publicada em qualquer hospedagem estática (as rotas usam `#`, então não é preciso configurar reescrita de URLs).

## Comandos de verificação

| Comando | O que faz |
| --- | --- |
| `npm run typecheck` | Checagem de tipos (TypeScript estrito). |
| `npm run lint` | ESLint. |
| `npm test` | Testes de domínio e de persistência (Vitest + fake-indexeddb). |
| `npm run build` | Checagem de tipos e build de produção em `dist/`. |
| `npm run check` | Tipos, lint, testes e build em sequência. |
| `npm run test:e2e` | Testes de ponta a ponta com Playwright (sobe o servidor de desenvolvimento na porta 5174). |

Na primeira vez que usar os testes de ponta a ponta, instale o navegador do Playwright: `npx playwright install chromium`.

## Como usar

- **Cadastrar:** escreva o título no campo “O que você precisa fazer?” e pressione Enter ou use **Adicionar**. Só o título é obrigatório. Em **Hoje**, a tarefa recebe *Fazer em* = hoje; dentro de uma lista, ela entra nessa lista; nas demais telas vai para a **Entrada**. **Mais detalhes** abre o editor antes de criar. **Nova tarefa**, no cabeçalho, faz o mesmo.
- **Organizar:** crie listas em **Nova lista** (nome e cor da paleta). Mova uma tarefa pelo menu `…` da linha (**Mover para**) ou pelo editor. Tarefas sem lista ficam na **Entrada**. Em Entrada e em cada lista, a **Ordem manual** habilita **Mover para cima/baixo** no menu da tarefa.
- **Detalhar:** clique no título para abrir o editor: descrição, prioridade, datas e etapas (checklist de um nível). Marcar todas as etapas não conclui a tarefa.
- **Planejar:** use **Fazer em** e **Prazo** (veja abaixo). **Próximas** mostra o que tem data futura; **Todas** mostra todas as pendentes.
- **Focar:** no menu da tarefa, **Focar hoje** coloca a tarefa em **Em foco** (máximo de 3 por dia). Para escolher outra com o limite atingido, use **Retirar do foco** em uma delas. Concluir ou excluir uma tarefa libera a vaga. Ao virar o dia, o foco antigo deixa de valer, mas nada é apagado nem concluído.
- **Concluir:** marque a caixa da tarefa. Se houver etapas abertas, o app pede confirmação e não marca as etapas por você. O histórico fica em **Concluídas**, onde é possível **Reabrir**.
- **Excluir:** **Mover para a Lixeira** é reversível (**Restaurar**). **Excluir definitivamente** pede confirmação e não tem volta.
- **Buscar:** **Busca** pesquisa em título, descrição e etapas, sem diferenciar maiúsculas ou acentos (“reuniao” encontra “Reunião”), com filtros de lista, prioridade, situação e prazo combinados.

### Fazer em × Prazo

- **Fazer em** é a *intenção de trabalho*: o dia em que você pretende trabalhar na tarefa.
- **Prazo** é o *vencimento*: quando a entrega precisa estar pronta.

Os dois campos são independentes. **Focar hoje** define Fazer em como hoje e **não** altera o Prazo. Uma tarefa com Fazer em no passado e Prazo no futuro aparece em **Replanejar** (e não como atrasada); só o Prazo anterior a hoje aparece como **Prazo passou**.

## Exportar e restaurar dados

Em **Configurações**:

- **Exportar dados** gera `clareia-backup-AAAA-MM-DD.json` com listas, tarefas (pendentes, concluídas e na Lixeira) e etapas. O app registra “Última exportação gerada”, mas o navegador não confirma onde o arquivo foi salvo.
- **Escolher arquivo de backup** valida o arquivo inteiro (até 10 MiB) antes de qualquer alteração. Se estiver válido, mostra as contagens e pede confirmação para **Substituir dados deste navegador**, com opção de exportar a base atual antes. A restauração acontece em uma única transação; se algo falhar, a base anterior permanece intacta. Não existe mesclagem nesta versão.

## Alcance dos dados locais

Suas tarefas ficam neste navegador. Exporte uma cópia para guardar ou transferir seus dados.

- Os dados são do mesmo navegador, perfil e endereço (origem). Outro navegador, perfil ou aparelho começa vazio.
- **Computador e celular não sincronizam.** Para transferir, exporte em um e restaure no outro.
- Limpar os dados do site, usar janela privativa ou desinstalar o navegador pode apagar as tarefas. Não há cópia remota, criptografia própria, notificações com o app fechado nem garantia de reabertura sem internet.

## No celular

O Clareia reconhece o celular pela largura da tela (menos de 768 px) e também quando é um aparelho de toque deitado. Nesse caso se organiza como aplicativo: barra superior compacta com busca, navegação inferior (Hoje, Entrada, Próximas, Mais), botão flutuante **Nova tarefa** ao alcance do polegar, editor em tela cheia e respeito às bordas do aparelho (entalhe e barra de gestos).

Ele pode ser adicionado à tela inicial e abre em tela cheia, sem a barra do navegador:

- **Android (Chrome):** menu ⋮ → *Instalar aplicativo*, ou **Configurações → Usar como aplicativo → Instalar aplicativo**.
- **iPhone (Safari):** *Compartilhar* → *Adicionar à Tela de Início*.

Os dados continuam no armazenamento do navegador daquele aparelho. A instalação exige HTTPS (como na Vercel). Ainda não existe modo offline: sem internet, o app instalado pode não abrir.

Os ícones em `public/icons` são gerados por `node scripts/generate-icons.mjs`.

## Publicar na Vercel

Importe o repositório na Vercel. O preset **Vite** é detectado automaticamente: comando de build `npm run build` e diretório de saída `dist`. Não é preciso configurar rotas, porque o app usa `HashRouter`.

## Estrutura

```
src/app            layout, navegação, rotas, contextos e páginas
src/components/ui  componentes reutilizáveis (botão, campo, data, estado vazio…)
src/features/tasks captura, linha, grupos, editor e checklist
src/features/lists gerenciamento de listas
src/features/backup exportação e restauração
src/features/install instalação na tela inicial
src/db             esquema Dexie, erros e repositório (operações transacionais)
src/domain         tipos, datas, schemas Zod, Hoje/foco, filtros, ordenação, backup
src/styles         tokens e estilos globais
e2e                testes de ponta a ponta (Playwright)
```

Stack: React + TypeScript (estrito) + Vite, CSS Modules, Radix Primitives, Lucide, Dexie / dexie-react-hooks, Zod e React Router (HashRouter). Testes com Vitest, fake-indexeddb, Playwright e axe-core.

## Evoluções previstas (ainda não existem)

Recorrência, Kanban, calendário completo, notificações, uso offline (service worker), modo escuro, arrastar e soltar, sincronização em nuvem entre aparelhos, equipes e recursos de IA. Nada disso está implementado na V1.
