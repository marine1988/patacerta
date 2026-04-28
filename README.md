# Name

### patacerta

# Synopsis

PataCerta — verified pet breeders platform (Portugal).

# Description

# Example

# Install:

`npm install patacerta`

# Test:

`pnpm test`

# Testes E2E (Playwright):

```bash
# Pré-requisitos: docker compose up + db migrate + db seed + db seed:demo
pnpm --filter @patacerta/web test:e2e:install   # primeira vez
pnpm --filter @patacerta/web test:e2e
```

Ver `apps/web/e2e/README.md` para detalhes. Em CI, o workflow
`.github/workflows/e2e.yml` arranca a stack completa e corre o suite.

#License:
