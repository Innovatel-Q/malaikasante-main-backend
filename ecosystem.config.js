module.exports = {
  apps: [
    {
      name: 'medecins-patients-dev',
      script: './bin/www',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      }
    },
    {
      name: 'medecins-patients-test',
      script: './bin/www',
      env: {
        NODE_ENV: 'test',
        TEST_PORT: 3015
      }
    },
    {
      name: 'medecins-patients-prod',
      script: './bin/www',
      env: {
        NODE_ENV: 'production',
        PROD_PORT: 5005
      },
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true
    }
  ]
};