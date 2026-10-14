# Pi Thunder Forge affinity

Расширение Pi задаёт `X-Olla-Session-ID: user:pi:<session-uuid>` только для провайдера `thunder-forge`. Ключ стабилен при продолжении разговора и меняется для новой Pi-сессии. Olla учитывает модель отдельно. Разные ключи позволяют распределять разговоры между нодами, но не гарантируют выбор разных нод.

Используется штатный `before_provider_headers`; необходим Pi с поддержкой этого события (проверено на установленном Pi 1.2.0). Повторные попытки запроса используют тот же заголовок. Старые варианты заголовка удаляются без учёта регистра; остальные заголовки и провайдеры не меняются.

## Установка

Из клонированного репозитория подключить файл как локальное расширение:

```bash
ln -s "$PWD/extensions/thunder-forge-affinity.ts" ~/.pi/agent/extensions/thunder-forge-affinity.ts
```

Удалить постоянные `X-Olla-Session-ID` из описаний моделей Thunder Forge в `~/.pi/agent/models.json`, затем выполнить `/reload` в Pi.

Для pi-subagents добавить абсолютный путь к этому файлу в `subagents.defaultSubagentOnlyExtensions` в `~/.pi/agent/settings.json`. Это сохраняет обычное обнаружение расширений и явно подключает affinity к дочерним сессиям. Явные настройки конкретного агента или проекта могут переопределить default; их нужно проверять отдельно.

## Проверка

```bash
npm test
```

Тест проверяет стабильность ключа, независимость сессий, замену старого заголовка и отсутствие изменений у других провайдеров. Дополнительно при первоначальной установке проверены реальные HTTP-запросы Pi и native pi-subagents через локальный тестовый сервер. На Thunder Forge получен HTTP 200 с `sticky: miss` и `source: session_header`; полная live-проверка `miss → hit` пока не завершена.

Routing affinity не гарантирует попадание в KV-cache. Olla может перепривязать ключ после отказа ноды, истечения TTL, вытеснения записи или перезапуска.

Источники: [API расширений Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts), [sticky sessions Olla](https://thushan.github.io/olla/concepts/sticky-sessions/).
