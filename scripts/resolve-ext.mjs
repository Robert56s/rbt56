// Node cannot resolve extensionless relative imports (`from './format'`) that
// Vite resolves fine. This registers a resolve hook that retries such
// specifiers with `.js` appended, so scripts can import src/lib modules as-is.
//
//   node --import ./scripts/resolve-ext.mjs <script>
import { register } from 'node:module';

register('./resolve-ext-hooks.mjs', import.meta.url);
