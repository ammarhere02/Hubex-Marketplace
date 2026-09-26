# docker/
- `mysql-init/` — SQL run once when the MySQL volume is first created. Grants the local
  `app` user permission to create Prisma's temporary shadow database. Local development only.
  If your volume predates this file: `docker compose down -v && docker compose up -d`.
