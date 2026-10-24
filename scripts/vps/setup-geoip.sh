#!/usr/bin/env bash
# Visitor-country detection for the country homepages on a self-hosted nginx (D-151).
# Run once as root on the VPS:  bash scripts/vps/setup-geoip.sh [/etc/nginx/sites-enabled/default]
# Installs nginx's GeoIP2 module, downloads the free DB-IP country database and
# makes nginx pass the visitor's country to the app as X-Country-Code (+ CF-IPCountry,
# which the app also understands). Idempotent; backs up the site config first.
set -euo pipefail

SITE="${1:-/etc/nginx/sites-enabled/default}"
DB_DIR=/usr/share/GeoIP
DB="$DB_DIR/dbip-country-lite.mmdb"

export DEBIAN_FRONTEND=noninteractive
apt-get install -y -q libnginx-mod-http-geoip2

mkdir -p "$DB_DIR"
if [ ! -s "$DB" ] || [ -n "$(find "$DB" -mtime +40 2>/dev/null)" ]; then
  for m in "$(date +%Y-%m)" "$(date -d '-1 month' +%Y-%m)"; do
    if curl -fsSL -o "$DB.gz" "https://download.db-ip.com/free/dbip-country-lite-$m.mmdb.gz"; then
      gunzip -f "$DB.gz"
      echo "GeoIP database: dbip-country-lite-$m"
      break
    fi
  done
fi
[ -s "$DB" ] || { echo "Could not download the DB-IP database" >&2; exit 1; }

cat > /etc/nginx/conf.d/geoip2.conf <<'EOF'
# Visitor country for the UpayaInd country homepages (D-151). Free DB-IP lite database; refresh monthly:
#   bash scripts/vps/setup-geoip.sh   (re-downloads when the file is older than 40 days)
geoip2 /usr/share/GeoIP/dbip-country-lite.mmdb {
    auto_reload 24h;
    $geoip2_country_code default=XX source=$remote_addr country iso_code;
}
EOF

cp "$SITE" "$SITE.pre-geoip.bak.$(date +%s)"
if ! grep -q "X-Country-Code" "$SITE"; then
  sed -i 's|\(\s*\)proxy_set_header X-Forwarded-Proto \$scheme;|&\n\1proxy_set_header X-Country-Code $geoip2_country_code;\n\1proxy_set_header CF-IPCountry $geoip2_country_code;|' "$SITE"
fi
grep -n "Country" "$SITE" || { echo "Could not add the proxy headers to $SITE — add them to the location / block by hand." >&2; exit 1; }

nginx -t
systemctl reload nginx
echo "Done. Test from another country: curl -sI https://upayaind.com/ | grep -i set-cookie  → market=IN / market=UK"
