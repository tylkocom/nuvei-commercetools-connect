export function sanitizeForEvidence() {
  throw new Error('sanitizeForEvidence not implemented');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  sanitizeForEvidence();
}
