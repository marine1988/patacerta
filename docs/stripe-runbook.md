# Stripe Runbook — PataCerta

Operações e troubleshooting do sistema de pagamentos. **Audiência:** developers e admins com acesso ao Dokploy + dashboard Stripe.

> Constantes em `apps/api/src/lib/stripe.ts`:
>
> - `SPONSORED_SLOT_PRICE_CENTS = 1000` (10,00 EUR)
> - `SPONSORED_SLOT_DURATION_DAYS = 30`
> - `MAX_SLOTS_PER_BREED = 3` (em `payments.controller.ts`)

---

## 1. Arquitectura resumida

```
Frontend (Dashboard > Destaque)
   │  POST /api/payments/sponsored-slot/checkout {breedId}
   ▼
API (payments.controller.ts)
   │  1. cria SponsoredBreedSlot (PAUSED + PENDING) com placeholders
   │  2. cria Stripe Checkout Session (mode=payment, eur, multibanco+card)
   │  3. persiste session.id no slot
   │  4. devolve {sessionId, url, slotId}
   │  Se Stripe falha → DELETE do slot órfão (try/catch)
   ▼
Frontend faz window.location.href = url
   ▼
Stripe Checkout (hosted) — utilizador paga
   ▼
Stripe webhook → POST /api/webhooks/stripe
   │  1. valida Stripe-Signature contra STRIPE_WEBHOOK_SECRET
   │  2. regista event.id em StripeEvent (idempotência)
   │  3. dispatch por event.type
   ▼
checkout.session.completed (paid):
   - slot.paymentStatus = PAID
   - slot.status = ACTIVE
   - slot.startsAt = now, endsAt = now + 30d
   - envia email confirmação (best-effort)
```

**Pontos críticos:**

- O webhook tem de receber **raw body**: montado em `apps/api/src/index.ts:124` com `express.raw({type: 'application/json'})` **antes** do `express.json()`.
- Idempotência por `event.id` em tabela `StripeEvent`. Re-tentativas devolvem 200 sem efeito.
- Multibanco: `checkout.session.completed` chega **unpaid** (referência emitida); pagamento real só em `checkout.session.async_payment_succeeded`.

---

## 2. Eventos Stripe tratados

| Evento                                                   | Acção                               |
| -------------------------------------------------------- | ----------------------------------- |
| `checkout.session.completed` (`payment_status='paid'`)   | Activa slot                         |
| `checkout.session.completed` (`payment_status='unpaid'`) | No-op (Multibanco a aguardar)       |
| `checkout.session.async_payment_succeeded`               | Activa slot (Multibanco confirmado) |
| `checkout.session.async_payment_failed`                  | Marca FAILED+EXPIRED                |
| `checkout.session.expired`                               | Marca FAILED+EXPIRED                |
| `charge.refunded`                                        | Marca REFUNDED+EXPIRED              |

Outros eventos são ignorados com log.

---

## 3. Variáveis de ambiente (Dokploy → Environment)

| Variável                      | Onde | Valor                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`           | api  | `sk_test_...` (stage) / `sk_live_...` (prod)                              |
| `STRIPE_WEBHOOK_SECRET`       | api  | `whsec_...` (do endpoint configurado em Stripe Dashboard)                 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | web  | `pk_test_...` / `pk_live_...` (não é usada no fluxo actual mas reservada) |
| `BACKEND_URL`                 | api  | `https://api-stage.patacerta.pt` (success/cancel URLs)                    |
| `FRONTEND_URL`                | api  | `https://stage.patacerta.pt` (redirect pós-pagamento)                     |

**Como verificar quais estão presentes em runtime:**

```bash
# No container api (Dokploy → Containers → api → Terminal)
env | grep -E 'STRIPE|FRONTEND|BACKEND' | sed 's/=.*/=***/'
```

---

## 4. Configurar webhook na Stripe (uma vez por ambiente)

1. Stripe Dashboard → **Developers > Webhooks > Add endpoint**.
2. URL: `https://api-stage.patacerta.pt/api/webhooks/stripe` (ou prod equivalente).
3. **Eventos a subscrever** (cinco):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
4. Copiar o **Signing secret** (`whsec_...`) e colar em `STRIPE_WEBHOOK_SECRET` no Dokploy.
5. Redeploy do serviço `api` para apanhar o env novo.
6. Smoke test: `Send test webhook` → `checkout.session.completed`. Confirmar 200 nos logs api.

---

## 5. Cron de expiração (`expire-sponsored-slots`)

Slots `ACTIVE` cujo `endsAt < now` ficam órfãos no estado activo até este job correr. **Não causa bug visível** (filtros de runtime já excluem `endsAt` no passado) mas mantém auditoria limpa e contadores admin correctos.

**Configurar em Dokploy → Schedules:**

| Campo           | Valor                                                     |
| --------------- | --------------------------------------------------------- |
| Name            | `expire-sponsored-slots`                                  |
| Schedule (cron) | `0 * * * *` (horário)                                     |
| Container       | `api` (mesmo serviço, mesmo image)                        |
| Command         | `pnpm --filter @patacerta/api job:expire-sponsored-slots` |

Frequência horária é suficiente — slots são de 30 dias, latência de 1h sobre `endsAt` não tem impacto.

**Correr manualmente uma vez (validação inicial):**

```bash
# No container api
pnpm --filter @patacerta/api job:expire-sponsored-slots
# Output esperado:
# [expire-sponsored-slots] Expired N sponsored slots (now=2026-05-06T...)
```

---

## 6. Operações comuns

### 6.1 Reembolsar um slot

1. Stripe Dashboard → **Payments** → procurar pelo PaymentIntent ID
   (guardado em `SponsoredBreedSlot.stripePaymentIntentId`).
2. **Refund** → full ou partial.
3. Webhook `charge.refunded` chega automaticamente → slot fica `REFUNDED+EXPIRED`.
4. Não é preciso intervir na DB. Verificar com:
   ```sql
   SELECT id, "paymentStatus", status, notes
   FROM "SponsoredBreedSlot"
   WHERE "stripePaymentIntentId" = 'pi_xxx';
   ```

### 6.2 Forçar activação manual (webhook não chegou)

Cenário raro: webhook caiu, slot ficou `PAUSED+PENDING` mas pagamento foi recebido.

1. Confirmar no Stripe Dashboard que o `payment_status` da session é `paid`.
2. Reenviar o webhook: Dashboard → **Webhooks > [endpoint] > Recent events** → encontrar o evento → **Resend**.
3. Se persistir falha: activação manual via SQL (último recurso):
   ```sql
   UPDATE "SponsoredBreedSlot"
   SET "paymentStatus" = 'PAID',
       status = 'ACTIVE',
       "startsAt" = NOW(),
       "endsAt" = NOW() + INTERVAL '30 days',
       "paidAt" = NOW(),
       notes = COALESCE(notes, '') || ' | Activado manualmente por <admin> em <data>'
   WHERE "stripeCheckoutSessionId" = 'cs_xxx';
   ```

### 6.3 Apagar slot órfão (PENDING há horas)

Sessions Stripe expiram automaticamente em 24h e disparam `checkout.session.expired` → slot fica `FAILED+EXPIRED`. **Não é preciso acção manual.**

Se o webhook não correu por algum motivo, eliminar via API admin:

```bash
# Login admin
TOKEN=$(curl -s -X POST https://api-stage.patacerta.pt/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@patacerta.pt","password":"AdminPass123!"}' \
  | jq -r .accessToken)

# DELETE slot
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  https://api-stage.patacerta.pt/api/admin/sponsored-slots/123
```

### 6.4 Rotação test → live (go-live)

1. Stripe Dashboard → toggle **Test mode → Live mode** (canto superior direito).
2. **Developers > API keys** → copiar `sk_live_...` e `pk_live_...`.
3. **Developers > Webhooks** → criar novo endpoint para o domínio de produção
   com os mesmos 5 eventos (ver §4) → copiar novo `whsec_...`.
4. Dokploy (ambiente prod, **não** stage):
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `VITE_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → `whsec_live...`
5. Redeploy api + web.
6. **Activar Multibanco/MB Way em modo live**:
   Stripe Dashboard (live mode) → **Settings > Payment methods** → activar `multibanco`.
   Requer activação prévia da conta para método europeu.
7. Smoke test: comprar 1 slot real (10€) com cartão pessoal → reembolsar pelo dashboard.

---

## 7. Troubleshooting

### 7.1 Webhook devolve 400 "Assinatura inválida"

**Causa típica:** mismatch entre `STRIPE_WEBHOOK_SECRET` no Dokploy e o secret do endpoint na Stripe.

1. No Stripe Dashboard, abrir o webhook endpoint → **Reveal signing secret** → comparar.
2. Re-deploy api após qualquer alteração ao env (nova var só é apanhada no boot).
3. Se múltiplos endpoints existem (ex: stage + prod), garantir que cada um tem o secret correcto na sua Dokploy app.

### 7.2 Webhook devolve 503 "Webhook não configurado"

`STRIPE_WEBHOOK_SECRET` em falta no env. Confirmar com `env | grep STRIPE` no container api.

### 7.3 Checkout devolve 500 "STRIPE_NOT_CONFIGURED"

`STRIPE_SECRET_KEY` em falta. Mesmo procedimento.

### 7.4 Checkout devolve 409 "DUPLICATE_SLOT"

O criador já tem um slot (PENDING/ACTIVE/PAUSED) para essa raça. Comportamento esperado. Se o slot é PENDING há mais de 24h, ver §6.3.

### 7.5 Checkout devolve 400 "expires_at must be less than 24 hours"

Bug histórico (corrigido em commit `82c7689`). Se reaparecer, confirmar que `payments.controller.ts` ainda usa `+23h` para `expires_at`.

### 7.6 Slot fica PAID mas não aparece destacado no simulador

O simulador filtra por `status=ACTIVE AND endsAt > now`. Verificar:

```sql
SELECT id, status, "paymentStatus", "endsAt"
FROM "SponsoredBreedSlot" WHERE id = 123;
```

Se `status='PAUSED'` apesar de PAID → o webhook só falhou parcialmente. Forçar activação (§6.2).

### 7.7 Logs úteis no Dokploy

```bash
# Stripe-related apenas
docker logs <api-container> 2>&1 | grep -i 'stripe\|webhook\|payment'

# Últimas 200 linhas
docker logs --tail 200 <api-container>
```

---

## 8. Testes E2E (CI / pré-deploy)

Dois specs em `apps/web/e2e/specs/`:

```bash
# Ambos os specs (mesmo user → workers=1 obrigatório)
E2E_BASE_URL=https://stage.patacerta.pt \
E2E_API_URL=https://stage.patacerta.pt/api \
E2E_BREEDER_EMAIL=canil.alvalade@example.pt \
E2E_BREEDER_PASSWORD=DemoPass123 \
E2E_STRIPE_WEBHOOK_SECRET=whsec_xxx \
pnpm --filter @patacerta/web exec playwright test \
  e2e/specs/sponsored-slot-checkout.spec.ts \
  e2e/specs/sponsored-slot-webhook.spec.ts \
  --workers=1
```

| Spec                              | Cobre                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| `sponsored-slot-checkout.spec.ts` | Login → modal → redirect Stripe → asserir produto/preço/email → cleanup |
| `sponsored-slot-webhook.spec.ts`  | Webhook assinado simulado → slot ACTIVE+PAID → cleanup                  |

Sem `E2E_STRIPE_WEBHOOK_SECRET`, o webhook spec é **skipped** (não falha CI).

---

## 9. Cartões e dados de teste

| Cenário                    | PAN                   | Detalhes                   |
| -------------------------- | --------------------- | -------------------------- |
| Sucesso                    | `4242 4242 4242 4242` | Qualquer CVC + data futura |
| Recusa genérica            | `4000 0000 0000 0002` | —                          |
| 3DS obrigatório            | `4000 0025 0000 3155` | Confirmar challenge        |
| Multibanco (não há cartão) | —                     | Stripe gera referência ATM |

Código postal PT: `1000-001` (qualquer válido).

---

## 10. Contactos de emergência

- **Stripe Dashboard**: https://dashboard.stripe.com
- **Stripe Status**: https://status.stripe.com (verificar antes de assumir bug nosso)
- **Suporte Stripe**: chat dentro do dashboard, resposta tipicamente <2h em horário útil
