# Repository Guidelines

Guidelines for agentic coding agents operating in the Sink codebase.

## Project Overview

Sink is a link shortener with analytics, running 100% on Cloudflare. Uses Nuxt 4 frontend and Cloudflare Workers backend.

**All documentation and comments must be in English.**

## Project Structure

```
app/                    # Nuxt 4 application
  ├── components/       # Vue components (PascalCase)
  │   ├── ui/           # shadcn-vue components (DO NOT EDIT)
  │   ├── dashboard/    # Dashboard components
  │   └── home/         # Landing page components
  ├── composables/      # Vue composables (camelCase)
  ├── pages/            # File-based routing
  ├── stores/           # Pinia stores
  ├── types/            # TypeScript types
  ├── utils/            # Utility functions
  └── lib/              # Shared helpers
server/                 # Nitro server (Cloudflare Workers)
  ├── api/              # API endpoints
  └── utils/            # Server utilities
schemas/                # Zod validation schemas
tests/                  # Vitest tests
```

## Commands

Use **pnpm** (v10+) with **Node.js 22+**.

```bash
pnpm dev                  # Start dev server (port 7465)
pnpm build                # Production build
pnpm preview              # Worker preview via wrangler
pnpm lint:fix             # ESLint with auto-fix
pnpm types:check          # TypeScript type check

# Testing (Vitest + Cloudflare Workers pool)
pnpm vitest               # Watch mode
pnpm vitest run           # CI mode (run once)
pnpm vitest tests/sink.spec.ts           # Single file
pnpm vitest tests/api/link.spec.ts       # Single API test
pnpm vitest -t "returns 200"             # Pattern match

# Deployment
pnpm deploy:pages         # Deploy to Cloudflare Pages
pnpm deploy:worker        # Deploy to Cloudflare Workers
```

## Code Style

Uses `@antfu/eslint-config`. Run `pnpm lint:fix` before committing.

- **Indentation**: 2 spaces | **Quotes**: Single | **Semicolons**: None | **Trailing commas**: Always

### TypeScript

- Use TypeScript for all code; prefer `interface` for objects, `type` for unions
- Avoid `any`; use proper types or `unknown`
- Use Zod for runtime validation (see `schemas/`)

```typescript
interface Link { id: string, url: string, slug: string }

export const LinkSchema = z.object({
  id: z.string().trim().max(26),
  url: z.string().trim().url().max(2048),
  slug: z.string().trim().max(2048),
})
```

### Vue Components

Use `<script setup lang="ts">` always. Files: PascalCase (`LinkEditor.vue`).

```vue
<script setup lang="ts">
import type { Link } from '@/types'

const props = defineProps<{ link: Link }>()
const emit = defineEmits<{ update: [link: Link] }>()
</script>

<template>
  <div>{{ props.link.slug }}</div>
</template>
```

### Imports

- **Prefer Nuxt auto-imports** (`ref`, `computed`, `useFetch`, etc.)
- Explicit imports: external libs (`import { z } from 'zod'`), types (`import type { Link } from '@/types'`), icons (`import { Copy } from 'lucide-vue-next'`)
- Path aliases: `@/` (app), `@@/` (root)

### Naming Conventions

| Item           | Convention       | Example                  |
| -------------- | ---------------- | ------------------------ |
| Components     | PascalCase       | `LinkEditor.vue`         |
| Composables    | `use` prefix     | `useDashboardRoute()`    |
| Stores         | `use...Store`    | `useDashboardLinksStore` |
| API routes     | method suffix    | `create.post.ts`         |
| Directories    | kebab-case       | `dashboard/links/`       |
| Functions/vars | camelCase        | `getLink`                |
| Constants      | UPPER_SNAKE_CASE | `DASHBOARD_ROUTES`       |

### Error Handling

```typescript
// Server API - use createError for HTTP errors
export default eventHandler(async (event) => {
  const link = await readValidatedBody(event, LinkSchema.parse)
  if (existingLink) {
    throw createError({ status: 409, statusText: 'Link already exists' })
  }
})
```

## Cloudflare Bindings

Access via `event.context.cloudflare.env`:

```typescript
const { KV, ANALYTICS, AI, R2 } = event.context.cloudflare.env
```

| Binding     | Type             | Purpose                    |
| ----------- | ---------------- | -------------------------- |
| `KV`        | Workers KV       | Link storage               |
| `ANALYTICS` | Analytics Engine | Click tracking & analytics |
| `AI`        | Workers AI       | AI-powered slug generation |
| `R2`        | R2 Bucket        | Data backup & file storage |

## UI Components

- Use shadcn-vue from `app/components/ui/` — **Never edit** (auto-generated)
- Use `ResponsiveModal` for mobile-optimized dialogs
- Use Tailwind CSS v4 for styling

## Accessibility

Use static English for `aria-label` (no `$t()` translations):

```vue
<button aria-label="Open menu">
...
</button>  <!-- Good -->

<button :aria-label="$t('menu.open')">
...
</button>  <!-- Bad -->
```

## Commits

Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`

```
feat: add link expiration
fix: correct analytics filter
```

## Pre-commit

`simple-git-hooks` runs `lint-staged` on commit, auto-runs `eslint --fix` on staged files.
