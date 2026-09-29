/**
 * "The project changed underneath you."
 *
 * A confirmed master command writes chapters and Story Bible notes from the
 * app shell, where the page actually displaying them can't see the response.
 * Without this the author confirms a chapter plan, is told it worked, and
 * stares at an unchanged list until they reload.
 */
const listeners = new Set<() => void>();

export function publishProjectChanged(): void {
  listeners.forEach(listener => listener());
}

export function subscribeProjectChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
