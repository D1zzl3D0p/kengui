/**
 * Bridge between the generated OpenAPI contract and the names the rest of the
 * app imports. The `./generated/` directory is a git-ignored build artifact
 * produced by `npm run contract:generate` from the pinned kenkui version, so
 * these aliases can never drift from the server schema. Client-side ergonomic
 * types (unions, generics, hosted-mode extensions) live in their own api
 * modules and are built on top of these.
 */
import type { components } from './generated/openapi';

export type Schemas = components['schemas'];
