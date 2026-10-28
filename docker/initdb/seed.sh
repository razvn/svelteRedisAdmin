#!/bin/sh
# Seed for the dev redis1 instance (sra-redis1). Runs once from the `seed`
# compose service after redis1 is healthy. Only touches databases 0-1.
set -e

redis-cli -h redis1 -p 6379 -n 0 <<'EOF'
FLUSHDB
SET app:config '{"theme":"dark","lang":"en","retries":3}'
SET app:counter 42
SET plain-string just some text
HSET user:1 name Alice email alice@example.test age 30
HSET user:2 name Bob email bob@example.test age 25
RPUSH queue:tasks "first" "second" "third"
SADD tags:redis cache nosql in-memory
ZADD leaderboard 100 alice 85 bob 92 carol
XADD stream:events '*' kind login user alice
XADD stream:events '*' kind logout user alice
EOF

redis-cli -h redis1 -p 6379 -n 1 <<'EOF'
FLUSHDB
SET session:abc "logged-in"
EXPIRE session:abc 3600
EOF

echo "seeded sra-redis1 databases 0-1"
