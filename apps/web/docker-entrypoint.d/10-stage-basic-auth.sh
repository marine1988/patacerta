#!/bin/sh
set -eu

password="${STAGE_BASIC_AUTH_PASSWORD:-}"
user="${STAGE_BASIC_AUTH_USER:-stage}"
auth_config=/etc/nginx/stage-basic-auth.conf

if [ -z "$password" ]; then
  printf 'auth_basic off;\n' > "$auth_config"
  rm -f /etc/nginx/.htpasswd
  exit 0
fi

case "$user" in
  *[!A-Za-z0-9._-]* | '')
    echo "[PataCerta] STAGE_BASIC_AUTH_USER contém caracteres inválidos" >&2
    exit 1
    ;;
esac

# APR1 e' suportado nativamente pelo modulo auth_basic do nginx Alpine.
# Usamos stdin para que a password nunca apareca na lista de processos.
printf '%s\n' "$password" | htpasswd -i -m -c /etc/nginx/.htpasswd "$user" >/dev/null

cat > "$auth_config" <<'EOF'
auth_basic "PataCerta stage";
auth_basic_user_file /etc/nginx/.htpasswd;
EOF