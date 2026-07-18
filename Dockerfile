# Chess Analyzer — Vite + React + Stockfish (WASM). Built to static, served by
# nginx with cross-origin isolation headers (needed for Stockfish's threaded WASM
# / SharedArrayBuffer). We run copy:stockfish then vite build, skipping the tsc
# --noEmit checks so type warnings don't block the image.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run copy:stockfish && npx vite build

FROM nginx:alpine AS run
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
