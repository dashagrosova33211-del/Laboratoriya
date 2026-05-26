# Научно-образовательный комплекс: Лаборатория продовольственной безопасности

## Быстрый старт

### 1. Установка зависимостей
bash
npm install
### 2. Запуск как веб-приложение
bash
npm start
Откройте http://127.0.0.1:3000
### 3. Запуск как Electron-приложение
bash
npm run electron
### 4. Разработка (сервер + Electron одновременно)
bash
npm run dev
## Структура файлов

food-safety-lab/
├── package.json
├── main.js                     # Electron точка входа
├── preload.js                  # Electron preload
├── server.js                   # Express backend
├── engine/
│   ├── calculator.js           # Физико-химические расчёты
│   ├── math_models.js          # Математические модели
│   ├── expert_system.js        # Экспертная система + ХАССП
│   └── lab_simulator.js        # Движок симуляции
├── data/
│   ├── knowledge_base.json     # База ГОСТ и продуктов
│   ├── haccp_templates.json    # Шаблоны ХАССП
│   └── functional_foods.json   # Функциональные продукты
└── public/
    └── index.html              # Фронтенд SPA