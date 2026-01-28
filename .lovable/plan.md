

# План: "Запомнить меня" + Поиск KB для пользователей

## 1. Чекбокс "Запомнить меня" на Login

**Файл:** `src/pages/Login.tsx`

### Изменения:

**Импорт (строка 11):**
```typescript
import { Checkbox } from '@/components/ui/checkbox';
```

**Новое состояние (после строки 37):**
```typescript
const [rememberMe, setRememberMe] = useState(true);
```

**UI чекбокс (после строки 183, между полем пароля и CAPTCHA):**
```tsx
<div className="flex items-center space-x-2">
  <Checkbox 
    id="remember-me"
    checked={rememberMe}
    onCheckedChange={(checked) => setRememberMe(checked === true)}
  />
  <label 
    htmlFor="remember-me" 
    className="text-sm font-medium leading-none cursor-pointer"
  >
    {t('remember_me')}
  </label>
</div>
```

**Логика персистенции (в handleLogin после успешного входа):**
```typescript
if (!rememberMe && !error) {
  // Move session to sessionStorage (expires on browser close)
  const sessionKey = `sb-ktnygkszihdganoqamhi-auth-token`;
  const sessionData = localStorage.getItem(sessionKey);
  if (sessionData) {
    sessionStorage.setItem(sessionKey, sessionData);
    localStorage.removeItem(sessionKey);
  }
}
```

### Переводы (уже существуют):
- EN: `"remember_me": "Remember me"`
- RU: `"remember_me": "Запомнить меня"`  
- HY: `"remember_me": "\u0540\u056b\u0577\u0565\u056c \u056b\u0576\u0571"`

---

## 2. Поиск KB для обычных пользователей

**Файл:** `src/pages/Dashboard.tsx`

### Концепция:

Добавить кнопку "Поиск в базе знаний" для **всех пользователей** (не только админов). Кнопка откроет Sheet с поисковой строкой и результатами из Knowledge Base.

### Изменения:

**Новые импорты (строка 6):**
```typescript
import { KBSearchFilters } from '@/components/kb/KBSearchFilters';
import { KBDocumentCard } from '@/components/kb/KBDocumentCard';
import { useKnowledgeBase, type KBFilters as KBFiltersType } from '@/hooks/useKnowledgeBase';
```

**Иконка Search (строка 29):**
```typescript
import { Search } from 'lucide-react';
```

**Новое состояние (после строки 63):**
```typescript
const [kbSearchOpen, setKbSearchOpen] = useState(false);
const [kbFilters, setKbFilters] = useState<KBFiltersType>({ page: 1, pageSize: 10 });
```

**Hook для KB (после строки 65):**
```typescript
const { documents: kbDocuments, isLoading: kbLoading } = useKnowledgeBase(kbFilters);
```

**Кнопка для всех пользователей (строка 177, перед условием isAdmin):**
```tsx
<Sheet open={kbSearchOpen} onOpenChange={setKbSearchOpen}>
  <SheetTrigger asChild>
    <Button variant="outline">
      <Search className="mr-2 h-4 w-4" />
      {t('dashboard:search_kb')}
    </Button>
  </SheetTrigger>
  <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
    <SheetHeader>
      <SheetTitle>{t('kb:knowledge_base')}</SheetTitle>
      <SheetDescription>
        {t('dashboard:search_kb')}
      </SheetDescription>
    </SheetHeader>
    <div className="mt-6 space-y-4">
      <KBSearchFilters filters={kbFilters} onFiltersChange={setKbFilters} />
      
      {kbLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : kbDocuments.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {t('kb:no_results')}
        </p>
      ) : (
        <div className="space-y-3">
          {kbDocuments.map((doc) => (
            <KBDocumentCard
              key={doc.id}
              document={doc}
              onView={(id) => {
                setKbSearchOpen(false);
                navigate(`/kb/${id}`);
              }}
              isAdmin={false}
            />
          ))}
        </div>
      )}
    </div>
  </SheetContent>
</Sheet>
```

**Удалить KB кнопку только для админов (строки 178-183):**
Кнопка `navigate('/kb')` остаётся только для админов для полного управления KB.

---

## Расположение элементов

### Login форма:
```text
┌─────────────────────────────────────┐
│           ДОБРО ПОЖАЛОВАТЬ          │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ Имя пользователя               ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ Пароль                         ││
│  └─────────────────────────────────┘│
│                                     │
│  [x] Запомнить меня       <── NEW  │
│                                     │
│        [CAPTCHA WIDGET]             │
│                                     │
│  ┌─────────────────────────────────┐│
│  │         ВОЙТИ                  ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Dashboard кнопки:
```text
┌────────────────────────────────────────────────────────┐
│ [Календарь] [Аудио] [Документ] [🔍 Поиск KB] [+ Дело] │
│                                    ↑ NEW               │
│                                                        │
│ Только для Admin:                                      │
│ [📚 База знаний] [📊 Статистика]                       │
└────────────────────────────────────────────────────────┘
```

---

## Порядок имплементации

1. Добавить чекбокс "Запомнить меня" в Login.tsx
2. Добавить логику sessionStorage для временных сессий
3. Добавить Sheet с поиском KB в Dashboard.tsx для всех пользователей
4. Протестировать оба функционала

