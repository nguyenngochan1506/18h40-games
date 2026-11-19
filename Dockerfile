# syntax=docker/dockerfile:1
# Build: docker build --target server|web .  (assets/ phải có sẵn: pnpm assets)
FROM rust:1-bookworm AS rust
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps/server apps/server
COPY crates crates
RUN cargo build --release --locked -p server

FROM node:22-bookworm-slim AS webbuild
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY scripts scripts
COPY assets assets
RUN pnpm --filter web build

FROM debian:bookworm-slim AS server
RUN useradd -r -u 10001 app
COPY --from=rust /src/target/release/server /usr/local/bin/server
USER app
ENV BIND_ADDR=0.0.0.0:3000
EXPOSE 3000
CMD ["server"]

FROM nginx:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=webbuild /src/apps/web/dist /usr/share/nginx/html
