// PM2 process config for running the API on a Lightsail instance (VM).
// Usage on the server:  pm2 start ecosystem.config.js
// PM2 keeps the API alive, restarts it on crash, and (with `pm2 startup`) on reboot.
module.exports = {
  apps: [
    {
      name: 'villkro-api',
      script: 'src/server.js',
      // APP_ENV=production makes loadEnv.js read apps/api/.env.production
      env: {
        APP_ENV: 'production',
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      // Restart with a small delay if it keeps crashing (e.g. DB not reachable yet)
      restart_delay: 3000
    }
  ]
};
