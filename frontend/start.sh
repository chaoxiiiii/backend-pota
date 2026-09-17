#!/bin/sh
set -e

# API_BASE_URL must point at the deployed backend, e.g.
#   https://esaka-backend-production.up.railway.app
: "${API_BASE_URL:?API_BASE_URL environment variable is required}"

# Railway assigns a dynamic PORT; default to 80 locally
PORT="${PORT:-80}"

# Escape sed replacement metacharacters in the URL (& | \)
ESCAPED_API_URL=$(printf '%s' "$API_BASE_URL" | sed 's/[&|\\]/\\&/g')

echo "Pointing frontend at API: $API_BASE_URL"

# Replace the hardcoded local backend URL in every JS/HTML file
find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) \
    -exec sed -i "s|http://127.0.0.1:8000|${ESCAPED_API_URL}|g" {} \;

# Set nginx listen port
sed -i "s/__PORT__/${PORT}/g" /etc/nginx/conf.d/default.conf

echo "Starting nginx on port ${PORT}"
exec nginx -g 'daemon off;'
