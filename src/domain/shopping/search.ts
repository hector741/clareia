/** Texto para busca: sem acentos, sem diferença de maiúsculas e com espaços normalizados. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeText(query);
  return q === '' || normalizeText(text).includes(q);
}

/**
 * Sugestões de produtos parecidos com o nome digitado. Só sugere: nunca funde produtos.
 * Usa palavras em comum (com pelo menos três letras) ou um nome que contém o outro.
 */
export function similarNames<T extends { id: string; name: string }>(name: string, candidates: readonly T[], limit = 5): T[] {
  const query = normalizeText(name);
  if (query.length < 3) return [];
  const words = new Set(query.split(' ').filter((w) => w.length >= 3));
  const scored: { item: T; score: number }[] = [];
  for (const candidate of candidates) {
    const other = normalizeText(candidate.name);
    if (other === query) continue;
    const shared = other.split(' ').filter((w) => words.has(w)).length;
    const contains = other.includes(query) || query.includes(other);
    const score = shared + (contains ? 2 : 0);
    if (score > 0) scored.push({ item: candidate, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'pt-BR'))
    .slice(0, limit)
    .map((s) => s.item);
}
