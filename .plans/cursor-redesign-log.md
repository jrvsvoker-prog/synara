# Редизайн Synara под Cursor — журнал работы

Статус на 15.08.2026. Все правки закоммичены одним коммитом на ветке **`cursor-theme`**;
`main` чистый и отслеживает официальный `origin/main` (https://github.com/Emanuele-web04/synara).

**Как подтягивать обновления официальной версии** (заказчик — не программист, делать за него):

```bash
cd "/Users/doom/syn fork"
git fetch origin
git checkout main && git pull          # свежий официальный main
git checkout cursor-theme
git rebase main                        # переложить наши правки поверх
```

При конфликтах (правки сидят в горячих файлах — ChatView.tsx, Sidebar.tsx, index.css,
theme.logic.ts — конфликты будут регулярно): разрешать, сохраняя ОБЕ стороны — новую
функциональность апстрима и наш визуал; после rebase прогнать fmt/lint/typecheck/тесты
и сверить вид рендером (скрипты в /tmp могли не пережить перезагрузку — пересоздать по
разделу 5/6). Работать заказчик продолжает на `cursor-theme`.

Цель: превратить форк Synara в персональный desktop-инструмент с минималистичным интерфейсом,
визуально близким к Cursor. Функциональность и бэкенд не трогаем — только presentation layer.

---

## 0. Окружение (сделано один раз)

Рабочая папка `/Users/doom/syn fork` была **пустой** — клона не было. Склонирован
`https://github.com/Emanuele-web04/synara` (HEAD `18ff998`).

Toolchain отсутствовал. Поставлено:

```bash
brew install mise          # менеджер версий
cd "/Users/doom/syn fork"
mise trust && mise install # node 24.13.1 + bun 1.3.12 из .mise.toml
mise exec -- bun install
```

Дальше все команды — через `mise exec --`, иначе подхватывается системный node 22.

Playwright chromium для browser-тестов: `mise exec -- bunx playwright install chromium`.

---

## 1. Что важно знать про архитектуру (выяснено аудитом)

**Цвета не живут в `index.css`.** Есть рантайм-движок тем `apps/web/src/theme/theme.logic.ts`
(~1400 строк): из seed `{surface, ink, accent, contrast}` выводится ~120 CSS-переменных —
границы, вторичный текст, кнопки, поверхности, ANSI-цвета терминала. Значения в `:root`
(`index.css`) — только фолбэк на первый кадр, движок их перетирает. Каталог из 25 тем лежит
в `theme.seed.generated.ts` (файл называется generated, но генератора в репозитории нет —
правится руками).

Формулы вывода общие для всех тем: правка базы альфы меняет вид **всех** 25 тем, не только
дефолтной. Это осознанный выбор, см. раздел «Открытые вопросы».

**Плотность и типографика уже параметризованы:** `lib/appDensity.ts` (высоты строк, паддинги),
`lib/appTypography.ts` + `hooks/useAppTypography.ts` (шкала кеглей от одного базового размера),
`lib/chatWidth.ts` (ширина колонки чата). Всё это — пользовательские настройки.

**Масштаб файлов:** `ChatView.tsx` — 12 400 строк, `Sidebar.tsx` — 6 800,
`MessagesTimeline.tsx` — 3 300. Слепой рефакторинг здесь опасен, правки точечные.

---

## 2. Сделано

### 2.1. Тема «Quiet» — новый дефолт

`theme.seed.generated.ts` — добавлен seed `quiet` (light + dark), зарегистрирован в
`CODE_THEME_OPTIONS` и `CODE_THEME_SEED_PATCH_METADATA`, назначен дефолтным в
`DEFAULT_THEME_STATE` и `DEFAULT_CHROME_THEME_BY_VARIANT` (`theme.logic.ts`).

| | light | dark |
| --- | --- | --- |
| surface (фон рабочей области) | `#fcfcfc` | `#181818` |
| ink (основной текст) | `#141414` | `#f0f0f0` |
| accent | `#0064b0` | `#81a1c1` |
| diff added / removed | `#007041` / `#be1744` | `#3fa266` / `#e34671` |
| opaqueWindows | `true` | `true` |

`opaqueWindows: true` — плоское окно вместо macOS-вибрантности с блюром, как на референсе.
Переключается в настройках.

### 2.2. Сайдбар как отдельный материал

Раньше сайдбар и колонка чата рисовались **одним** токеном `--color-background-surface`,
разделял их только шов. Добавлена функция `buildSidebarSurface` + константа
`SIDEBAR_TINT_ALPHA` (`theme.logic.ts`): сайдбар уходит на шаг назад от рабочей поверхности.

Коэффициенты подобраны так, чтобы воспроизвести пару `sideBar.background` / `editor.background`
из тем Cursor: `light 0.0388` → `#f3f3f3` над `#fcfcfc`, `dark 0.167` → `#141414` над `#181818`.

### 2.3. Нейтральная шкала по Cursor

Источник — `/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.glass.main.css`,
блок `body:not([data-cursor-glass-mode=true]) .monaco-workbench`. Cursor выводит все нейтральные
цвета из `--vscode-editor-foreground` процентами, **одна шкала на светлую и тёмную**:

```
text:   primary 100%  secondary 74%  tertiary 60%  quaternary 36%
stroke: primary  20%  secondary 12%  tertiary  8%  quaternary  4%
bg:     primary  20%  secondary 14%  tertiary  8%  quaternary  6%
```

Базы формул в `buildLightDerivedTokens` / `buildDarkDerivedTokens` подогнаны так, чтобы при
нулевом контрасте выдавать ровно эти числа:

| токен | было | стало |
| --- | --- | --- |
| textForegroundSecondary | .598 / .58 | **.741** |
| textForegroundTertiary | .45 / .42 | **.60** |
| iconSecondary | .598 | **.741** |
| iconTertiary | .45 | **.60** |
| border | .069 | **.08** |
| borderHeavy | .059 (был *легче* border) | **.12** |
| buttonSecondaryBackgroundHover | .04 | **.08** |

Отдельно починена инверсия: `borderHeavy` в светлой теме получался светлее обычного `border`
(общая база 0.09, но более крутой множитель работал против него при отрицательном
нормализованном контрасте). Главный потребитель — рамка композера, она была почти невидимой.

Скрипт сверки движка с извлечёнными значениями Cursor лежал в `/tmp/palette2.ts` (не в репо,
пересоздать легко) — давал 14/14 совпадений.

### 2.4. Типографика и плотность

- `appSettings.ts`: `DEFAULT_CHAT_FONT_SIZE_PX` **12 → 13**. Тянет за собой всю шкалу
  (`ui = base`, `meta = 0.84×`, `timestamp = 0.72×`): интерфейс 13px, чат 13px, мета 11px.
- `lib/appDensity.ts`: `BASE_ROW_HEIGHT_REM` **1.75 → 1.875** (28 → 30px) — под 13px текст
  28px зажимали строку.
- `lib/chatWidth.ts`: standard **46rem → 48rem** (768px).
- `sidebarRowStyles.ts`: секционный заголовок («Projects», «Chats») — с 13px/α.35 на
  **12px/α.51**. Был того же кегля, что пункты под ним, и при этом нечитаемый.

### 2.5. Сайдбар

- **Относительное время вернулось в строку треда** (`Sidebar.tsx`,
  `renderThreadRowTrailingCluster` + `threadRowTimeLabelClassName`). До этого оно было убрано
  в hover-карточку — в коде остался комментарий об этом.
- **Строки «активности» стали однострочными** (`SidebarActivityView.tsx`). Было два этажа:
  название + `📁 проект ⎇ ветка`. Стало: иконка провайдера, название, PR-чип, значок worktree,
  время. Проект и ветка ушли в hover-карточку (она их и так показывала). Иконка ветки убрана
  совсем — ветка есть у каждого треда, то есть сигнала не несла; значок остался только у
  worktree-тредов. Высота строки приведена к общему токену сайдбара.
- **Починен резерв места справа** (`Sidebar.logic.ts`,
  `resolveThreadRowTrailingReserveClass`). Функция была написана под комментарий «время теперь
  в hover-карточке», то есть под ноль, — из-за чего название наезжало на время
  («Badge Chip Design Analysis23h»). Теперь база равна ширине метки времени и растёт от неё.
  Заодно убрано дёрганье: в ветках с 2+ мета-чипами резерв при наведении был *уже* обычного.

### 2.6. Пустой экран

`ChatView.tsx`: убраны логотип 40px и заголовок 30px «What should we work on?». Композер стал
главным объектом и встал по центру. Пикер проекта висел на слове с пунктирным подчёркиванием
внутри заголовка — переехал в компактную пилюлю над композером
(`COMPOSER_TOOLBAR_PICKER_TRIGGER_CLASS_NAME`).

`chat/ChatEmptyStateHero.tsx`: вместо логотипа и «Let's build» — приглушённая строка с именем
проекта, либо ничего.

### 2.7. Чат

- **Карточка изменений файлов** (`MessagesTimeline.tsx`) — сворачивается по умолчанию
  (`expandedFileChangesByTurnId[...] ?? false`). Была раскрыта: рамка, список файлов,
  «Show 1 more file» между каждой парой сообщений. Счётчик и diff-статистика сведены на одну
  строку. Кнопки Undo/Review — на hover (`group/changed-files`).
- **Иконки под ответом агента** — на hover
  (`ASSISTANT_ACTION_HOVER_REVEAL_CLASS_NAME`, привязан к `group/assistant`). Порядок:
  сначала время, потом действия, чтобы блок рос вправо и не сдвигал сообщение. Закреплённое
  сообщение продолжает показывать пин всегда — это состояние, а не действие.
  В коде стоял комментарий, что иконки специально оставлены видимыми; у сообщений
  пользователя hover уже был, привели к одному правилу.
- **Markdown-заголовки** (`index.css`) сжаты: h1 `1.75em → 1.35em`, h2 `1.55 → 1.2`,
  h3 `1.35 → 1.1`, h4 `1.2 → 1.03`.
- **Плашка сообщения пользователя**: `--radius-user-message` `0.8rem → 0.625rem`.
- **Рамка композера** (`composerPickerStyles.ts`): у Cursor prompt input стоит на
  stroke-tertiary (8%) и переходит на stroke-secondary (12%) при наведении. Было 12% постоянно.

---

## 3. Изменённые файлы (21)

```
apps/web/src/appSettings.ts                        базовый кегль 12 → 13
apps/web/src/appSettings.test.ts
apps/web/src/components/ChatView.tsx               пустой экран без логотипа и заголовка
apps/web/src/components/ChatView.browser.tsx
apps/web/src/components/Sidebar.tsx                время в строке треда
apps/web/src/components/Sidebar.logic.ts           резерв места справа
apps/web/src/components/SidebarActivityView.tsx    однострочные строки активности
apps/web/src/components/chat/ChatEmptyStateHero.tsx
apps/web/src/components/chat/MessagesTimeline.tsx  карточка файлов, hover-действия
apps/web/src/components/chat/MessagesTimeline.test.tsx
apps/web/src/components/chat/composerPickerStyles.ts  рамка композера, 48rem
apps/web/src/components/timelineHeight.test.ts
apps/web/src/index.css                             фолбэки :root, markdown-заголовки, радиус
apps/web/src/lib/appDensity.ts                     высота строки 28 → 30
apps/web/src/lib/appDensity.test.ts
apps/web/src/lib/chatWidth.ts                      46rem → 48rem
apps/web/src/lib/chatWidth.test.ts
apps/web/src/sidebarRowStyles.ts                   секционный заголовок
apps/web/src/theme/theme.logic.ts                  seed по умолчанию, шкала, сайдбар
apps/web/src/theme/theme.logic.test.ts
apps/web/src/theme/theme.seed.generated.ts         seed «quiet»
```

Обновлённые тесты — это регрессионные якори на старые константы вывода, не отключение
проверок. В `timelineHeight.test.ts` размер шрифта прибит явно, чтобы смена дефолта настроек
больше не переписывала ожидания геометрии.

---

## 4. Состояние проверок

Последний полный прогон — зелёный:

```
mise exec -- bun run fmt        # ok
mise exec -- bun run lint       # 0 ошибок, 426 предупреждений (столько же было до правок)
mise exec -- bun run typecheck  # 7/7 пакетов
mise exec -- bun run test:web:focused   # 311 файлов, 3944 теста
```

Browser-тесты по затронутым областям тоже проходили:

```
cd apps/web && mise exec -- bun run vitest run --config vitest.browser.config.ts \
  src/components/SidebarThreadRowContent.browser.tsx \
  src/components/SidebarActivityView.browser.tsx \
  src/components/chat/MessagesTimeline.rowOverlap.browser.tsx \
  src/components/chat/MessagesTimeline.toolGroupCollapse.browser.tsx
```

**Известный флейк:** `src/components/ChatMarkdown.test.tsx > uses the theme foreground token
for markdown text` несколько раз падал в полном прогоне и стабильно проходил изолированно и
при повторе. Под нагрузкой, к правкам отношения не имеет. Если увидите — перезапустите.

---

## 5. Как запустить

**Десктоп на копии данных** (рабочий `~/.synara` не трогается):

```bash
rm -rf /tmp/syn-dev-home && mkdir -p /tmp/syn-dev-home
cp -R ~/.synara/userdata /tmp/syn-dev-home/dev
rm -rf /tmp/syn-dev-home/dev/state.sqlite.lifecycle-lock /tmp/syn-dev-home/dev/server-runtime.json
cd "/Users/doom/syn fork"
SYNARA_HOME=/tmp/syn-dev-home mise exec -- bun run dev:desktop
```

Важно: в dev-режиме данные берутся из `<SYNARA_HOME>/dev`, а не из `<SYNARA_HOME>/userdata`.

**Веб + Playwright для скриншотов** (нужен отдельный home, иначе конфликт лока sqlite):

```bash
SYNARA_HOME=/tmp/syn-demo-home SYNARA_PORT=3899 SYNARA_MODE=web SYNARA_NO_BROWSER=1 \
  VITE_DEV_SERVER_URL=http://localhost:5899 mise exec -- bun apps/server/src/index.ts &
cd apps/web && PORT=5899 VITE_WS_URL=ws://localhost:3899 mise exec -- bun run dev &
```

Playwright лежит в `apps/web/node_modules/playwright`, импортировать по абсолютному пути.
При съёмке ждать `[data-timeline-row-kind]`, а не фиксированный таймаут: иначе попадаешь на
splash-экран.

---

## 6. Поверхности сведены с эталоном (закрыто 15.08.2026)

Заказчик прислал скриншот светлого окна Cursor (3456×2172). Исходник найден в
`~/.synara/userdata/attachments/objects/` (копия — `/tmp/cursor-ref.png`), точные hex сняты
пикселями. Светлая палитра glass-окна:

| роль | light (замер) | dark (хардкоды glass CSS) |
| --- | --- | --- |
| фон страницы | `#f7f6f6` | `#14171d` (--cursor-bg-secondary) |
| сайдбар | `#efefef` | `#0c0e11` (--cursor-bg-primary) |
| композер/карточки | `#fcfcfc` | `#1b1f27` (--cursor-bg-elevated) |
| разделитель | `#dedede` | — |
| выбранная строка | `#e3e3e3` | — |
| текст 1/2/3/placeholder | `#141414` / `#4d4d4d` / `#6c6c6c` / `#a8a8a8` | — |

Вторичные цвета текста подтвердили нейтральную шкалу 74/60/36% с точностью ±3 — раздел 2.3
не трогали. Тёмный вариант — интерпретация: три хардкода glass CSS разложены по яркости в том
же порядке подъёма, что и в светлом (сайдбар назад → страница → карточки вперёд). Живого
тёмного скриншота Cursor не было — если появится, сверить.

Правки (все — поверх раздела 2):

- `theme.seed.generated.ts` + `DEFAULT_CHROME_THEME_BY_VARIANT`: quiet light surface
  `#fcfcfc → #f7f6f6`, dark `#181818 → #14171d`.
- `SIDEBAR_TINT_ALPHA`: light `0.0388 → 0.034` (→ `#efeeee`), dark `0.167 → 0.4`
  (→ `#0c0e11` точно). Тёмный шаг стал заметно крупнее — касается всех тем.
- Светлый `controlBase` `0.09 → 0.65`, светлый `elevatedPrimaryBase` `0.16 → 0.71`,
  светлый `PANEL_BASE_ALPHA` `0.18 → 0.63` — вся «приподнятая» семья (композер, поповеры,
  меню, карточки) теперь почти белая `#fcfcfc` над серой страницей, как у Cursor.
- Тёмный `controlBase` `0.06 → 0.077`, тёмный `elevatedPrimaryBase` `0.08 → 0.10` —
  выход на `#1d2026`/`#1c1f25` (цель `#1b1f27`; синеву канал ink не даёт, Δ≤2 на глаз ноль).
  ВАЖНО: в derived-функциях contrast нормализован и при нулевом seed-контрасте **отрицателен**
  (≈−0.74), базы подбирать только пробником, не арифметикой.
- `index.css`: `--composer-glass-opacity` `55% → 92%` (у Cursor композер — плоская
  непрозрачная карточка); фолбэки `:root` обновлены под новые поверхности.

Проверено рендером (web + Playwright, `/tmp/shot-theme.mjs`, пиксели через PIL):
light страница `#f7f6f6` / сайдбар `#efeeee` / композер `#fbfbfb`;
dark `#14171d` / `#0c0e11` / `#1d2025`. Всё в Δ≤2 от эталона.

Пробник движка: `/tmp/probe-theme.ts` (bun, печатает переменные quiet light/dark).

**Шов сайдбар ↔ контент стал плоским (15.08.2026).** По просьбе заказчика убрана тень
`--seam-shadow-*` с `.chat-content-card` (`index.css`) — blur 12px, наезжавший на сайдбар.
Осталась только тонкая линия `--seam-line` (12% чёрного light / 8% белого dark, инсет 0.6px),
как у Cursor. Заодно удалено правило гашения тени при сворачивании сайдбара (стало мёртвым).
Проверено рендером: light `#efeeee | #e6e5e5 | #f7f6f6`, dark `#0c0e11 | #1f2228 | #14171d` —
градиента у шва больше нет. Заметка: `.chat-content-card` есть только на открытом треде,
пустой New Chat шва не имеет — проверять на треде.

**Типографика сайдбара по Cursor (15.08.2026).** По второму скриншоту заказчика (зум
сайдбара): у Cursor вся навигация и неактивные чаты — secondary 74% (`#4d4d4d`), активный
чат — полный ink (`#141414`), метки времени/секций — tertiary (`#6c6c6c`). У нас всё это
централизовано в `sidebarRowStyles.ts`: `SIDEBAR_ROW_IDLE_TEXT_CLASS_NAME`
`text-foreground/89 → /74`, `SIDEBAR_ROW_LABEL_TEXT_CLASS_NAME` `text-foreground/95 → /74`.
Активные строки уже были `text-foreground` — не трогали. Токены тянут за собой навигацию,
строки тредов/проектов, активность и settings-nav. Проверено рендером: активный `#141414`,
неактивные и навигация `#4d4d4d`. При замере учитывать: скриншот сразу после клика ловит
сплэш — активная подсветка появляется после загрузки треда.

**Elevated-карточки в чате по Cursor (15.08.2026).** Эталоны: скриншоты карточки
«3 Files Changed» и плашки пользователя Cursor + `--glass-chat-bubble-background:
var(--cursor-bg-elevated)` из glass CSS. Паттерн один: карточка `#fcfcfc` (elevated) +
волосяная рамка `#eaeaea` на серой странице; заголовок карточки — tertiary `#717171`,
имена файлов — secondary `#505050`, никакой серой шапки-банда.

Сделано: общий класс `CHAT_ELEVATED_CARD_SURFACE_CLASS_NAME`
(`bg-[var(--color-background-control-opaque)]`, `chatTypography.ts`) применён к плашке
пользователя (обычной и форме редактирования — рамка непостоянных тредов стала видимой
`--color-border-light` вместо прозрачной) и к карточке «Edited N files»
(`MessagesTimeline.tsx`): серая шапка `--app-user-message-background 40%` убрана, заголовок
`text-foreground/92 → /60`, имена файлов `text-[--color-text-foreground] → /74`
(hover возвращает полный + underline). Инлайн-код и pdf-бэкдроп остались на старом сером
токене `--app-user-message-background` — серый чип на белой плашке теперь виден.
Проверено рендером: карточка/плашка `#fcfcfc`, рамка `#ee…`, заголовок `#717171`.

Кандидаты дальше в том же ключе: fenced code blocks (ещё серые), чипы под композером,
терминал/diff-поверхности (этапы 4–5 ТЗ).

---

## 7. Что осталось по дизайну

Не сделано, по убыванию заметности:

1. **Шапка сайдбара.** Сейчас `New thread / Kanban / Pull requests / Automations`.
   На референсе `New Chat / Search / Automations / Customize`. Это перекладывание функций в
   меню — то есть изменение поведения, требует решения заказчика.
2. **Серая плашка «Work in a project»** под композером на пустом экране — на референсе её нет.
3. **Чипсы под композером** (`Plan new idea`, `Multitask`, `Run in cloud`) — не добавлены,
   нужно решить, какие действия Synara им соответствуют.
4. **Вертикальная пунктирная метка навигации** слева от текста в чате.
5. **Не покрыто цветом:** фон плашки сообщения пользователя и код-блоков (у Cursor это
   `--glass-chat-bubble-background`, выводится из `bg-elevated`, а не из нейтральной шкалы).
6. Этапы 4–5 исходного ТЗ целиком: терминал, diff, браузер, approvals, attachments,
   command palette, диалоги, контекстные меню; полировка тёмной темы, visual regression.

---

## 8. Решения, ждущие подтверждения

- **Правки формул применились ко всем 25 темам,** не только к «Quiet»: плотнее вторичный
  текст, заметнее ховер и границы. Направление везде одинаковое. Если это нежелательно —
  нужно разветвлять вывод по теме, что усложнит `theme.logic.ts`.
- **Имя проекта убрано из строк активности.** В режиме «All activity» треды разных проектов
  идут вперемешку, и это единственное место, где имя реально помогало. Можно вернуть
  приглушённым суффиксом в той же строке.
- **Тёмная тема — интерпретация без живого эталона** (см. раздел 6): порядок подъёма
  поверхностей взят из светлого замера. Если появится тёмный скриншот Cursor — сверить.
