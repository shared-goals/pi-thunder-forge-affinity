# Pi Thunder Forge affinity

Расширение Pi задаёт `X-Olla-Session-ID: <username>:pi:<session-uuid>` только для провайдера `thunder-forge`. Ключ стабилен при продолжении разговора и меняется для новой Pi-сессии. Olla учитывает модель отдельно. Разные ключи позволяют распределять разговоры между нодами, но не гарантируют выбор разных нод.

Используется штатный `before_provider_headers`; необходим Pi с поддержкой этого события (проверено на установленном Pi 1.2.0). Повторные попытки запроса используют тот же заголовок. Старые варианты заголовка удаляются без учёта регистра; остальные заголовки и провайдеры не меняются.

## Установка

Установить пакет из Git-репозитория:

```bash
pi install https://github.com/shared-goals/pi-thunder-forge-affinity.git
pi list
```

Git должен иметь доступ к Git-репозиторию через настроенный credential helper. Альтернатива с настроенными SSH-ключами: `pi install git:git@github.com:shared-goals/pi-thunder-forge-affinity.git`. Публикация в npm не требуется.

Pi добавляет источник в `packages` в `~/.pi/agent/settings.json` и самостоятельно клонирует пакет. Его каталог виден в `pi list`. Удалить постоянные `X-Olla-Session-ID` из описаний моделей Thunder Forge в `~/.pi/agent/models.json`, затем выполнить `/reload` в Pi. Настройки `thunderForgeAffinity` хранятся отдельно в пользовательском `settings.json` и не меняются при обновлении пакета.

Для pi-subagents добавить абсолютный путь `<каталог установленного пакета>/extensions/thunder-forge-affinity.ts` в массив `subagents.defaultSubagentOnlyExtensions` в `~/.pi/agent/settings.json`. Это сохраняет обычное обнаружение расширений и явно подключает affinity к foreground-детям и детям с ограниченным набором расширений; обычные background-дети также обнаруживают установленный пакет. Явные настройки конкретного агента или проекта могут переопределить default; их нужно проверять отдельно.

### Переход с ручного symlink

После успешного `pi install` удалить только старый symlink `~/.pi/agent/extensions/thunder-forge-affinity.ts`, предварительно проверив его через `ls -l`. Не удалять исходный репозиторий. В `subagents.defaultSubagentOnlyExtensions` заменить старый путь на файл установленного пакета, чтобы расширение не загружалось одновременно из разных копий. Выполнить `/reload`.

### Обновление и удаление

```bash
pi update --extensions
pi remove https://github.com/shared-goals/pi-thunder-forge-affinity.git
```

`pi update --extensions` обновляет все установленные extension-пакеты. После обновления выполнить `/reload`. При удалении убрать также соответствующую запись из `subagents.defaultSubagentOnlyExtensions`; иначе явная загрузка файла продолжит действовать. Если у источника указан tag или commit, он закреплён и автоматически на новую версию не перемещается.

## Имя пользователя

В `~/.pi/agent/settings.json` добавь блок:

```json
{
  "thunderForgeAffinity": {
    "username": "alice"
  }
}
```

Пользовательский каталог учитывает `PI_CODING_AGENT_DIR`, если он задан. Настройки расширения читаются перед запросом; проектные `.pi/settings.json` не используются.

Для разового переопределения запусти Pi с переменной окружения:

```bash
PI_THUNDER_FORGE_USER=alice pi
```

Приоритет: непустая `PI_THUNDER_FORGE_USER` → `thunderForgeAffinity.username` в настройках Pi → имя текущего пользователя ОС (`os.userInfo().username`). Дочерние процессы наследуют переменную. Пробелы по краям удаляются; явно заданное значение в JSON должно быть непустой строкой. Имя кодируется через `encodeURIComponent`, чтобы Unicode, двоеточия и другие специальные символы были безопасны в HTTP-заголовке. После изменения окружения перезапусти Pi; для первого подключения новой версии расширения выполни `/reload`.

## Проверка

```bash
npm test
```

Тест проверяет стабильность ключа, независимость сессий, замену старого заголовка и отсутствие изменений у других провайдеров. Дополнительно при первоначальной установке проверены реальные HTTP-запросы Pi и native pi-subagents через локальный тестовый сервер. На Thunder Forge получен HTTP 200 с `sticky: miss` и `source: session_header`; полная live-проверка `miss → hit` пока не завершена.

Routing affinity не гарантирует попадание в KV-cache. Olla может перепривязать ключ после отказа ноды, истечения TTL, вытеснения записи или перезапуска.

Источники: [пакеты Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), [API расширений Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts), [sticky sessions Olla](https://thushan.github.io/olla/concepts/sticky-sessions/).
