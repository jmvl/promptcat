# PromptCat IndexedDB Schema Documentation

## Database Overview

- **Name**: `PromptCatDB`
- **Version**: 2
- **Storage Type**: IndexedDB (client-side, browser-native)
- **Purpose**: Persistent storage for prompt management application

## Object Stores

### 1. `prompts` (keyPath: `id`)

Primary store for all prompt entities.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique timestamp-based identifier (Date.now()) |
| `title` | string | Prompt title (max ~500 chars) |
| `body` | string \| object | Prompt content (plain text or encrypted object) |
| `notes` | string \| object | Additional notes (plain text or encrypted object) |
| `folderId` | number \| null | Foreign key to `folders.id`; null = no folder |
| `tags` | string[] | Array of tag names |
| `isFavorite` | boolean | User's favorite flag |
| `isLocked` | boolean | Whether prompt is individually encrypted |
| `passwordCheck` | string \| null | Encrypted ID for password validation (if locked) |
| `dateCreated` | number | Timestamp (ms) of creation |
| `dateModified` | number | Timestamp (ms) of last modification |

#### Notes on Encryption

When `isLocked === true`:
- `body` and `notes` are encrypted using AES-GCM
- Stored as: `{ ct: string, iv: string, salt: string }`
- `passwordCheck` is also encrypted (contains String(id))

When `isLocked === false`:
- `body` and `notes` are plain text strings
- `passwordCheck` is null

#### Indexes

**None explicitly defined**. Queries use:
- Full table scans via `getAll()` for listing
- Direct key lookup via `get(id)` for detail views
- In-memory filtering for search, folders, tags, favorites

### 2. `folders` (keyPath: `id`)

Container for organizing prompts with optional encryption.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique timestamp-based identifier (Date.now()) |
| `name` | string | Folder name (max ~100 chars) |
| `isLocked` | boolean | Whether folder is encrypted with a password |
| `passwordCheck` | string \| null | Encrypted ID for password validation (if locked) |

#### Notes on Folder Locking

When a folder is locked:
- All prompts within the folder are also encrypted with the same password
- The folder's `passwordCheck` is used to authenticate before accessing prompts
- On decryption, prompts are temporarily stored decrypted in the cache
- Moving prompts out of a locked folder requires password to decrypt first

#### Indexes

**None explicitly defined**.

### 3. `globalTags` (keyPath: `id`)

Global tag registry for autocomplete and management.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Tag name (unique) |

#### Notes

- Stores globally defined tags (created via tag manager)
- Not all tags are stored here—tags from prompts are aggregated dynamically via `flatMap`
- Used primarily for tag management modal and to provide "known tags" list

#### Indexes

**None explicitly defined**.

### 4. `settings` (keyPath: `key`)

Application settings and preferences.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Setting identifier (e.g., "panelWidth") |
| `value` | any | Setting value (serialized JSON) |

#### Known Settings

- `panelWidth`: Width of the left sidebar panel (CSS string, e.g., "42%" or "300px")

#### Indexes

**None explicitly defined**.

## Encryption Implementation

### CryptoService Module

Uses the browser's Web Crypto API (`window.crypto.subtle`).

### Algorithms

- **Encryption**: AES-GCM (256-bit key, 12-byte IV)
- **Key Derivation**: PBKDF2 (100,000 iterations, SHA-256, 16-byte salt)

### Password Flow

1. User enters password
2. Generate random 16-byte salt (fresh per encryption)
3. Generate random 12-byte IV (fresh per encryption)
4. Derive key: `PBKDF2(password, salt, 100000, SHA-256)`
5. Encrypt: `AES-GCM.encrypt(data, key, iv)`
6. Store: `{ ct: base64(ciphertext), iv: base64(iv), salt: base64(salt) }`

### Password Validation (passwordCheck)

To verify a password without revealing stored data:
1. On lock: encrypt `String(id)` with the password → store as `passwordCheck`
2. On unlock: user provides password → decrypt `passwordCheck`
3. If decrypted value equals `String(id)`, password is correct

### Caching Strategy

- **SessionPasswords**: In-memory map `{ 'prompt-123': 'pass', 'folder-456': 'pass' }`
  - Only populated if user chooses "Don't ask again for this session"
  - Not persisted across page reloads
- **DecryptedCache**: In-memory map `{ 12345: { body, notes } }`
  - Used to store decrypted prompt content when a folder is unlocked
  - Avoids repeated decryption for each prompt in the folder
  - Cleared when prompt details view closes

## Relationships

```
Folder (1) ---< (n) Prompts
   |                  |
   +-- isLocked ----- +-- isLocked (independent flag)
   |                  |
   +-- passwordCheck -+-- passwordCheck (if individually locked)
```

- A prompt belongs to zero or one folder (`folderId` nullable)
- When the folder is locked, prompts inherit encryption (same password)
- Prompts can be individually locked independent of folder
- If folder is locked, individual lock control is disabled in UI (folder controls access)

Tags:
- Many-to-many between prompts and tag strings
- No join table; tags stored as array in each prompt
- `globalTags` store acts as a global registry, not a strict normalization

## Migration History

### Version 1 → Version 2

No schema changes detected in current code (DB_VERSION = 2 but upgrade handler only creates stores if absent).

Migration path preserved for future use.

## Data Access Patterns

### Read Operations

| Operation | Implementation | Notes |
|-----------|----------------|-------|
| Get all prompts | `DB.getAll(DB.STORES.PROMPTS)` | Loads full dataset into memory (client-side only) |
| Get single prompt | `DB.get(DB.STORES.PROMPTS, id)` | Fast key lookup |
| Get all folders | `DB.getAll(DB.STORES.FOLDERS)` | |
| Get single folder | `DB.get(DB.STORES.FOLDERS, id)` | |
| Get all tags | `DB.getAll(DB.STORES.TAGS)` | Returns array of `{ id }` objects |
| Get setting | `DB.get(DB.STORES.SETTINGS, key)` | |
| Get storage usage | `DB.getStorageUsage()` | Manual serialization of all store data |

### Write Operations

| Operation | Implementation | Notes |
|-----------|----------------|-------|
| Create/update prompt | `DB.put(DB.STORES.PROMPTS, prompt)` | Overwrites by id |
| Bulk update prompts | `DB.bulkPut(DB.STORES.PROMPTS, prompts[])` | Same transaction |
| Delete prompt | `DB.remove(DB.STORES.PROMPTS, id)` | |
| Bulk delete prompts | `DB.bulkRemove(DB.STORES.PROMPTS, ids[])` | Same transaction |
| Create/update folder | `DB.put(DB.STORES.FOLDERS, folder)` | |
| Delete folder | `DB.remove(DB.STORES.FOLDERS, id)` | |
| Create tag | `DB.put(DB.STORES.TAGS, { id: tagName })` | |
| Delete tag | `DB.remove(DB.STORES.TAGS, tagName)` | |
| Set setting | `DB.put(DB.STORES.SETTINGS, { key, value })` | |
| Clear all data | `DB.clear(store)` per store | Used by reset operation |

### Transactions

- All operations use implicit readwrite or readonly transactions via IndexedDB's `transaction()`
- `bulkPut` and `bulkRemove` use single transaction for all items (atomicity per store)

## Search Strategy

### No Native Indexes

Search is implemented in-memory:

1. Load all prompts into `state.prompts`
2. Filter by current view (folder, tag, favorites, locked)
3. Apply search query across multiple fields:
   - `title` (direct match)
   - `body` (text search, but decrypted first if locked and cached)
   - `notes` (text search, same as body)
   - `tags` (array inclusion)
4. For search results, compute `matchContext` snippet from `body` or `notes` for highlighting

### Performance Considerations

- Full dataset is expected to be small (≤ thousands of prompts)
- No pagination; all operations on the complete array
- Locking adds decryption overhead only when password is available

## Security Considerations

### Encryption Boundaries

**Encrypted fields** (when lock is enabled):
- `prompts.body`
- `prompts.notes`
- `prompts.passwordCheck`
- `folders.passwordCheck`

**Plaintext fields** (always unencrypted):
- `prompts.title` (visible in list)
- `prompts.tags`
- `prompts.isFavorite`
- `prompts.dateCreated`, `prompts.dateModified`
- `prompts.folderId`
- `folders.name`
- `folders.isLocked`
- `settings.*`

**Implication**: The title is never encrypted, so it should not contain sensitive data.

### Password Handling

- Passwords are never stored persistently
- Session passwords kept in memory only (optional via "Don't ask again")
- No password recovery mechanism (by design)
- Incorrect password returns silently to decryption functions (null)

### Crypto Implementation Notes

- Uses standard Web Crypto API (no third-party dependencies)
- Salt and IV are randomly generated per encryption operation
- GCM provides authenticated encryption (integrity check)
- Decryption failure throws exception; caught and returns null

## API Reference (DB Interface)

Located inside `DB` IIFE in `promptcat.html`:

### Public Methods

```javascript
DB.open()                        // Initialize connection, returns Promise<IDBDatabase>
DB.getAll(storeName)             // Return all records as array
DB.get(storeName, key)           // Return single record by primary key
DB.put(storeName, item)          // Insert or update (full overwrite)
DB.bulkPut(storeName, items[])   // Batch insert/update (single transaction)
DB.remove(storeName, key)        // Delete by primary key
DB.bulkRemove(storeName, keys[]) // Batch delete (single transaction)
DB.clear(storeName)              // Delete all records from store
DB.getStorageUsage()             // Estimate total bytes used (UTF-8)
DB.STORES                        // Constants: PROMPTS, FOLDERS, TAGS, SETTINGS
```

All methods return Promises that reject with error strings on failure.

## Known Limitations

1. **No indexes**: Performance degrades with very large datasets (>10k prompts)
2. **Single database file per origin**: No sharding or multi-file support
3. **No schema validation**: Application code is responsible for field types
4. **No migrations**: Store definitions are static; any schema changes require version bump and upgrade logic
5. **Plaintext titles**: User must avoid sensitive data in titles if using locking
6. **Client-side only**: No server-side backup/sync (export/import are manual)
7. **No full-text search**: Simple substring matching only; no stemming, stop words, or relevance scoring

## Export Format

When exporting full data (settings → Export), the JSON structure is:

```json
{
  "prompts": [
    { "id": 123, "title": "...", "body": "...", "notes": "...", ... }
  ],
  "folders": [
    { "id": 456, "name": "...", "isLocked": false, ... }
  ],
  "globalTags": ["tag1", "tag2", ...]
}
```

Partial export (bulk export or folder export) may omit `folders` or `globalTags`.

## Appendix: Code References

- IndexedDB module: `DB` IIFE starting around line 750
- CryptoService: `CryptoService` object around line 680
- Schema creation: `request.onupgradeneeded` handler
- Encryption calls: `CryptoService.encrypt/decrypt` used in `handleSavePrompt`, `handlePromptLockToggle`, `handleToggleFolderLock`, etc.
- Password validation: `CryptoService.decrypt(passwordCheck, password) === String(id)`

---

*Document generated from source code analysis of `/root/.openclaw/workspace/promptcat/promptcat.html`*