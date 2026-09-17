FROM nginx:alpine

# Deployment files first — these are needed by the image itself and must
# never be affected by .dockerignore rules meant for the web root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY start.sh /start.sh

# Static site files
COPY . /usr/share/nginx/html

# Startup script: injects API_BASE_URL into the static files, then runs nginx
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"]
