FROM node:24-alpine AS frontend_build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:1.28-alpine

COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend_build /app/dist /usr/share/nginx/html
