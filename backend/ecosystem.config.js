module.exports = {
  apps: [{
    name: 'menu-backend',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      FRONTEND_URL: 'https://frontend-8gzh4cxen-rashul-rajbhandaris-projects.vercel.app',
      REDIS_URL: 'redis://localhost:6379'
    }
  }]
};