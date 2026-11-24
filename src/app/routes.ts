export const routes = {
  today: '/hoje',
  inbox: '/entrada',
  upcoming: '/proximas',
  all: '/todas',
  list: (id: string) => `/listas/${id}`,
  search: '/busca',
  completed: '/concluidas',
  trash: '/lixeira',
  settings: '/configuracoes',
} as const;
