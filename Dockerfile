# Chess Analyzer: a static Vite build served by nginx. The engine is the
# single-threaded Stockfish WASM build, so the page needs no cross-origin
# isolation (COOP/COEP) headers.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Copies the engine into public/, type-checks, then bundles (see package.json).
RUN npm run build

FROM nginx:alpine AS run
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Run as the image's unprivileged nginx user. Docker lets containers bind
# port 80 without root (net.ipv4.ip_unprivileged_port_start=0). The "user"
# directive only applies to a root master process, so it is dropped.
RUN sed -i "/^user /d" /etc/nginx/nginx.conf \
  && touch /run/nginx.pid \
  && chown nginx:nginx /run/nginx.pid \
  && chown -R nginx:nginx /var/cache/nginx
USER nginx
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
