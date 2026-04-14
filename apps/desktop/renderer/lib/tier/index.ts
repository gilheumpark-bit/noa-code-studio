/** Generation quota / tier gate (BYOK desktop — permissive defaults). */

export function canGenerate(): boolean {
  return true;
}

export function incrementGenerationCount(): void {
  /* no-op: server-side billing when connected */
}
