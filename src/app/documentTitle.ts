let page = 'Clareia';
let prefix: string | null = null;

function apply(): void {
  document.title = prefix ? `${prefix} · ${page}` : page;
}

export function setPageTitle(title: string): void {
  page = title;
  apply();
}

/** Texto antes do título da página (o tempo do Pomodoro, por exemplo); `null` remove. */
export function setTitlePrefix(value: string | null): void {
  if (value === prefix) return;
  prefix = value;
  apply();
}
