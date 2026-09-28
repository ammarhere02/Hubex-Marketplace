import { defineRailway, github, mysql, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const HubexMarketplace = github("ammarhere02/Hubex-Marketplace");

  const MySQL = mysql("MySQL", { region: "sfo" });
  MySQL.deploy = { startCommand: "docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --performance_schema=0 --innodb-buffer-pool-size=1G" };
  MySQL.networking = { privateNetworkEndpoint: "mysql" };
  const Redis = redis("Redis", { region: "sfo" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  Redis.networking = { privateNetworkEndpoint: "redis" };
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const mysqlVolume = volume("mysql-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const Worker = service("Worker", {
    source: HubexMarketplace,
    start: "npm run worker",
    preDeploy: "npx prisma migrate deploy",
    replicas: { "sfo": 1 },
    networking: { privateNetworkEndpoint: "balanced-laughter" },
    env: { DATABASE_URL: preserve(), LOG_LEVEL: preserve(), REDIS_URL: preserve(), SERVICE_ROLE: preserve(), SHOPIFY_API_VERSION: preserve(), SHOPIFY_CLIENT_ID: preserve(), SHOPIFY_CLIENT_SECRET: preserve(), SHOPIFY_SHOP: preserve(), SHOP_CURRENCY: preserve(), SYNC_INTERVAL_MINUTES: preserve() },
  });
  const HubexMarketplace2 = service("Hubex-Marketplace", {
    source: HubexMarketplace,
    start: "npm start",
    // Public liveness endpoint — "/" now sits behind the auth gate and 307s
    // to /login, which Railway counts as unhealthy.
    healthcheck: "/api/health",
    preDeploy: "npx prisma migrate deploy",
    replicas: { "sfo": 1 },
    networking: { privateNetworkEndpoint: "hubex-marketplace" },
    env: { ADMIN_EMAIL: preserve(), ADMIN_PASSWORD: preserve(), DATABASE_URL: preserve(), LOG_LEVEL: preserve(), REDIS_URL: preserve(), SHOPIFY_API_VERSION: preserve(), SHOPIFY_CLIENT_ID: preserve(), SHOPIFY_CLIENT_SECRET: preserve(), SHOPIFY_SHOP: preserve(), SHOP_CURRENCY: preserve(), SYNC_INTERVAL_MINUTES: preserve() },
  });

  return project("perfect-rejoicing", {
    resources: [MySQL, Redis, Worker, HubexMarketplace2, redisVolume, mysqlVolume],
  });
});
