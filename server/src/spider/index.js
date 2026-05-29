// Stub spider — real adapters live alongside this file.
// Each adapter exports: { name, async crawl({ sourceUrl }) -> grant[] }
export async function crawlAll(_sources) {
  console.warn('[spider] not yet implemented');
  return [];
}
