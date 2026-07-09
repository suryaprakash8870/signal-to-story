import { readFileSync } from 'fs';
import path from 'path';

/**
 * Loads a fixture JSON from /fixtures. Inbound connectors read these in Test
 * Mode (08-TEST-FIXTURES-AND-TESTING.md) — real, working behavior against
 * sample data, not a placeholder.
 */
export function loadFixture(name: string): any {
  const file = path.join(process.cwd(), 'fixtures', name);
  return JSON.parse(readFileSync(file, 'utf8'));
}
