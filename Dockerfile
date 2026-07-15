# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar todas las dependencias (incluyendo devDependencies para el build)
RUN npm ci

# Copiar el resto del código fuente
COPY . .

# Construir la app de producción
RUN npm run build

# Stage 2: Serve con Nginx
FROM nginx:alpine

# Copiar el build generado al directorio de nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar la configuración personalizada de nginx para SPA (React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
