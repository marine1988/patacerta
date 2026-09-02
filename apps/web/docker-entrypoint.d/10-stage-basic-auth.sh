#!/bin/sh
set -eu

password="${STAGE_BASIC_AUTH_PASSWORD:-}"
user="${STAGE_BASIC_AUTH_USER:-stage}"

if [ -z "$password" ]; then
  rm -f /etc/nginx/conf.d/10-stage-basic-auth.conf /etc/nginx/.htpasswd
  exit 0
fi

case "$user" in
  *[!A-Za-z0-9._-]* | '')
    echo "[PataCerta] STAGE_BASIC_AUTH_USER contém caracteres inválidos" >&2
    exit 1
    ;;
esac

printf '%s\n' "$password" | htpasswd -i -B -c /etc/nginx/.htpasswd "$user"

cat > /etc/nginx/conf.d/10-stage-basic-auth.conf <<'EOF'
auth_basic "PataCerta stage";
auth_basic_user_file /etc/nginx/.htpasswd;
EOF