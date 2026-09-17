FROM nginx:alpine

# Static site files
COPY . /usr/share/nginx/html

# nginx vhost (listen port is templated as __PORT__ and set at container start)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Startup script: injects API_BASE_URL into the static files, then runs nginx
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"]
