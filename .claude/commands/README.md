# Custom Commands Directory

This directory contains custom Claude Code commands for this project.

## Directory Structure

- Place custom command files (`.js` or `.ts`) in this directory
- Each command file should export a command object with:
  - `name`: Command name
  - `description`: Command description
  - `execute`: Function that runs the command

## Example Command

```javascript
module.exports = {
  name: 'seed-db',
  description: 'Reset and seed database with test data',
  execute: async () => {
    // Reset database
    await exec('npx prisma migrate reset --force');
    // Seed with test data
    await exec('npm run db:seed');
    console.log('Database seeded successfully');
  }
};
```

## Available Commands

Custom commands for this medical platform backend will be added here.