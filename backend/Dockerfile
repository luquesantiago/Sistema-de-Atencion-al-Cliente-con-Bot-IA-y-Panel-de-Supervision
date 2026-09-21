# Imagen de desarrollo del backend.
# node:24-slim no trae OpenSSL y el motor de migraciones de Prisma lo necesita
# (sin él, "prisma migrate" falla). El código no se copia: se monta desde ./backend.
FROM node:24-slim
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
