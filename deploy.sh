#!/bin/bash
# Configuration
SSH_KEY=~/.ssh/pioneerxity
DROPLET_IP=143.198.84.169

set -e

echo "=========================================="
echo "Target: root@${DROPLET_IP} using key ${SSH_KEY}"
echo "=========================================="

scp -i "$SSH_KEY" docker-compose.yml root@${DROPLET_IP}:~/omni
scp -i "$SSH_KEY" .env root@${DROPLET_IP}:~/omni
docker-compose build
docker-compose push

echo "=========================================="
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes -i $SSH_KEY root@${DROPLET_IP} "echo 'Digital Ocean SSH connection OK'" 2>/dev/null; then
    echo "ERROR: Cannot connect to ${DROPLET_IP}. Make sure SSH key is configured."
    exit 1
fi

ssh -i $SSH_KEY root@${DROPLET_IP} "cd ~/omni && docker-compose down && docker-compose up -d --pull always"