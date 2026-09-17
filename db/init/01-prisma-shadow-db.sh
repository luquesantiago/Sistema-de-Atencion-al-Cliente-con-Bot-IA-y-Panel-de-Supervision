#!/bin/bash
# Prisma "migrate dev" crea una base temporal (shadow database).
# El usuario de la app no tiene permiso para crear bases, así que se lo damos
# solo para las que empiezan con prisma_migrate_shadow_db. Corre una sola vez,
# cuando el volumen de MySQL está vacío.
set -e
mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
  GRANT ALL PRIVILEGES ON \`prisma_migrate_shadow_db%\`.* TO '${MYSQL_USER}'@'%';
  FLUSH PRIVILEGES;
EOSQL
