/** Devolve o foco ao controle de origem; se ele não existe mais, usa a região principal. */
export function restoreFocus(origin: HTMLElement | null | undefined): void {
  window.setTimeout(() => {
    if (origin && origin.isConnected) {
      origin.focus();
      return;
    }
    document.getElementById('main-content')?.focus();
  }, 0);
}
