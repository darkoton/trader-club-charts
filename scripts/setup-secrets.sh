#!/bin/bash

# Скрипт для настройки GitHub Secrets через GitHub CLI
# Требуется: gh (GitHub CLI) должен быть установлен и авторизован

set -e

echo "🔐 Настройка GitHub Secrets для автодеплоя..."
echo ""

# Проверка установки gh
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) не установлен!"
    echo "Установите: brew install gh"
    echo "Затем авторизуйтесь: gh auth login"
    exit 1
fi

# Проверка авторизации
if ! gh auth status &> /dev/null; then
    echo "❌ GitHub CLI не авторизован!"
    echo "Выполните: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI готов"
echo ""

# SSH настройки
echo "📡 Настройка SSH подключения..."
gh secret set SSH_HOST --body "185.180.220.180"
gh secret set SSH_USER --body "trader_front"
gh secret set DEPLOY_PATH --body "/var/www/trader_front/data/www/po-terminal.com"

# SSH ключ
echo ""
echo "🔑 Настройка SSH приватного ключа..."
echo "Введите путь к ПРИВАТНОМУ SSH ключу (например: ~/.ssh/trader_club):"
read -r SSH_KEY_PATH

# Расширяем ~ до полного пути
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "❌ Файл $SSH_KEY_PATH не найден!"
    exit 1
fi

gh secret set SSH_PRIVATE_KEY < "$SSH_KEY_PATH"

# Environment переменные
echo ""
echo "🌍 Настройка переменных окружения..."
gh secret set VITE_API_URL --body "https://api.po-terminal.com/api"
gh secret set VITE_SOCKET_URL --body "wss://ws.po-terminal.com"
gh secret set VITE_IS_DEV_MODE --body "false"

echo ""
echo "✅ Все секреты успешно настроены!"
echo ""
echo "📋 Список установленных секретов:"
gh secret list

echo ""
echo "🚀 Теперь при push в main будет автоматически происходить деплой на сервер!"
echo ""
echo "💡 Подсказка: добавьте публичный ключ на сервер:"
echo "   ssh-copy-id -i ${SSH_KEY_PATH}.pub trader_front@185.180.220.180"
