---
name: database-queries
description: Execute and manage database queries across PostgreSQL, MySQL, and MongoDB
---

# Database Queries Skill

Execute and manage database queries.

## When to Use

- User needs to run SQL queries against a database
- Query optimization or explanation requested
- Database schema exploration needed
- Data migration or transformation tasks

## Steps

1. Identify the database type (PostgreSQL, MySQL, MongoDB)
2. Connect using appropriate credentials from environment/config
3. Execute the requested query with proper parameterization
4. Return results in appropriate format

## Security Notes

- Never log sensitive data
- Use parameterized queries to prevent SQL injection
- Validate all user input before query execution

## Example Triggers

- "query the users table for inactive accounts"
- "explain this SQL query performance"
- "list all tables in the database"