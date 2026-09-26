-- Runs once, on the first start of an empty MySQL volume.
-- `prisma migrate dev` creates a temporary "shadow" database to diff migrations,
-- so the app user needs CREATE/DROP beyond the hubex_marketplace schema.
-- Local development only; production would use a narrower migration user.
GRANT ALL PRIVILEGES ON *.* TO 'app'@'%';
FLUSH PRIVILEGES;
