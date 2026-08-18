#!/bin/sh
set -eu

unset CDPATH
project_dir=$(cd -- "$(dirname -- "$0")/../.." && pwd)

sudo install -m 0644 \
    "$project_dir/infra/systemd/ai-chatbot-certbot-renew.service" \
    /etc/systemd/system/ai-chatbot-certbot-renew.service
sudo install -m 0644 \
    "$project_dir/infra/systemd/ai-chatbot-certbot-renew.timer" \
    /etc/systemd/system/ai-chatbot-certbot-renew.timer
sudo systemctl daemon-reload
sudo systemctl enable --now ai-chatbot-certbot-renew.timer
sudo systemctl list-timers ai-chatbot-certbot-renew.timer --no-pager
