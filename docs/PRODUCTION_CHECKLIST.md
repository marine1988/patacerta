# PataCerta — Production Readiness Checklist

Last updated: 2026-06-30

## Security Audit Status

| Category | Status | Notes |
|----------|--------|-------|
| JWT Implementation | **SECURE** | Env-sourced secrets, 15min access/7d refresh, HS256 fixed |
| Password Security | **SECURE** | bcrypt cost 12, strong validation (8+ chars, upper/lower/number) |
| Auth/Authorization | **SECURE** | Triple guard on admin (auth + role + active user) |
| Session/Cookies | **SECURE** | httpOnly, secure, sameSite=strict |
| Input Validation | **SECURE** | Zod on all endpoints, Prisma parameterized queries |
| Rate Limiting | **SECURE** | Implemented on all public endpoints |
| Security Headers | **SECURE** | Helmet, HSTS (1 year, preload), CSP, Permissions-Policy |
| CORS | **SECURE** | Whitelist only, no wildcards, credentials enabled |
| Logs | **SECURE** | Pino with redact for password/token fields |
| Secrets | **SECURE** | All from env vars, no hardcoded defaults in prod |

---

## Environment Variables

### Required (Dokploy Environment tab)

```bash
# ---- Core ----
NODE_ENV=production
VOLUME_PREFIX=prod_patacerta

# ---- Database ----
POSTGRES_PASSWORD=<strong-random-password>

# ---- JWT (generate with: openssl rand -base64 48) ----
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string-different-from-above>

# ---- Admin User ----
ADMIN_EMAIL=admin@patacerta.pt
ADMIN_PASSWORD=<strong-password-min-8-chars-upper-lower-number>

# ---- MinIO ----
MINIO_ROOT_PASSWORD=<strong-random-password>

# ---- URLs ----
FRONTEND_URL=https://patacerta.pt
VITE_PUBLIC_URL=https://patacerta.pt
```

### Email (Required for full functionality)

```bash
# Resend.com (recommended)
RESEND_API_KEY=re_xxxxxxxxxxxx

# OR Mailgun SMTP
SMTP_HOST=smtp.eu.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@mg.patacerta.pt
SMTP_PASS=<mailgun-smtp-password>
SMTP_FROM=Patacerta <noreply@patacerta.pt>
```

### Stripe (Required for payments)

```bash
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
```

### Backups (Recommended)

```bash
# Age encryption (generate key: age-keygen -o backup-key.txt)
AGE_RECIPIENT=age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Healthchecks.io monitoring (create checks at healthchecks.io)
HEALTHCHECKS_URL_BACKUP=https://hc-ping.com/<uuid-postgres>
HEALTHCHECKS_URL_BACKUP_MINIO=https://hc-ping.com/<uuid-minio>
HEALTHCHECKS_URL_ROTATE=https://hc-ping.com/<uuid-rotate>
```

### Maintenance Mode

```bash
MAINTENANCE_MODE=0                    # Set to 1 to enable
MAINTENANCE_BYPASS_KEY=<secret-key>   # Optional: admin bypass via header
```

---

## Escape Hatches (Current Status)

These are temporary bypasses for initial setup. **Remove after configuring properly.**

| Variable | Current | Target | Action Required |
|----------|---------|--------|-----------------|
| `ALLOW_NO_SMTP_IN_PROD` | `1` | `0` | Configure RESEND_API_KEY, then set to 0 |
| `ALLOW_INSECURE_FLAGS_IN_PROD` | `1` | `0` | Ensure no debug flags, then set to 0 |
| `RUN_SEED_ON_BOOT` | `true` | Remove | Remove after seed data is populated |
| `MAINTENANCE_MODE` | `1` | `0` | Set to 0 when ready to go live |

---

## Pre-Launch Checklist

### Infrastructure
- [x] PostgreSQL running with strong password
- [x] MinIO running with strong password
- [x] Redis running
- [x] Volumes separated (prod_patacerta_*)
- [x] Domain configured (patacerta.pt)
- [x] SSL/HTTPS working

### Security
- [x] All secrets from environment variables
- [x] JWT secrets are unique and strong (64+ chars)
- [x] Admin password is strong
- [x] CORS whitelist configured
- [x] Rate limiting active
- [x] Security headers (Helmet, HSTS)

### Data
- [x] Seed data populated (districts, municipalities, breeds, categories)
- [x] Admin user created
- [ ] Remove RUN_SEED_ON_BOOT after verification

### Email
- [ ] Configure RESEND_API_KEY or SMTP
- [ ] Test email verification flow
- [ ] Test password reset flow
- [ ] Set ALLOW_NO_SMTP_IN_PROD=0

### Payments (if enabling)
- [ ] Configure Stripe live keys
- [ ] Create webhook endpoint in Stripe dashboard
- [ ] Test payment flow in test mode first

### Backups
- [ ] Generate age keypair, store private key securely OFFLINE
- [ ] Set AGE_RECIPIENT in Dokploy
- [ ] Create Healthchecks.io checks
- [ ] Set HEALTHCHECKS_URL_* variables
- [ ] Verify first backup runs (check docker logs cron)
- [ ] Test restore procedure (see docs/RESTORE.md)

### Monitoring
- [ ] Healthchecks.io configured
- [ ] Set up alerting (email/Slack/Discord)

### Final Steps
- [ ] Set ALLOW_INSECURE_FLAGS_IN_PROD=0
- [ ] Set MAINTENANCE_MODE=0
- [ ] Verify site is accessible
- [ ] Test critical flows (register, login, search)

---

## Quick Commands

```bash
# Check API health
curl https://patacerta.pt/api/health

# Enable maintenance mode (in Dokploy, set MAINTENANCE_MODE=1, restart)

# Admin bypass during maintenance
curl -H "X-Maintenance-Bypass: <your-bypass-key>" https://patacerta.pt/api/...

# Check backup logs
docker logs <cron-container-id> --tail 100
```

---

## Emergency Procedures

### Rollback
1. In Dokploy, go to Deployments
2. Click "Redeploy" on the previous working version

### Database Restore
See `docs/RESTORE.md` for full procedure.

### Maintenance Mode
1. In Dokploy, set `MAINTENANCE_MODE=1`
2. Restart the compose
3. Site shows maintenance page, API returns 503

---

## Support

- Repository: https://github.com/marine1988/patacerta
- Dokploy: https://dokploy.patacerta.pt (or your Dokploy URL)
