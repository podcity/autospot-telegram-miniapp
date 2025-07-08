FROM nginx:alpine

# Копируем HTML файлы в nginx
COPY . /usr/share/nginx/html/

# Настройка nginx для SPA
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
