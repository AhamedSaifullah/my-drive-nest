# My Drive: backend diagrams

Dashed items in the architecture diagram and sequence 2c are planned, not built yet.

## 1. Architecture diagram

```mermaid
flowchart LR
  subgraph Client["Client"]
    FA["Flutter app"]
    SB["System browser"]
  end

  subgraph Backend["NestJS API"]
    AUTH["AuthModule<br/>register, login, edit-user, logout<br/>JWT guard"]
    CLOUD["CloudModule<br/>link, callback, list, unlink<br/>signed state, AES-256-GCM"]
    FILES["FilesModule<br/>GET /files, /files/summary"]
    SYNC["Sync workers<br/>classify by MIME type"]
  end

  subgraph Data["Data stores"]
    MDB[("MongoDB<br/>users, sessions, oauth_states,<br/>cloud_accounts, sync_jobs, files")]
    REDIS[("Redis<br/>BullMQ job queue")]
  end

  subgraph Providers["Cloud providers"]
    GOOG["Google OAuth + Drive API"]
    DBX["Dropbox API"]
    JIO["Jio Cloud<br/>access unconfirmed"]
  end

  FA -->|"REST + JWT"| AUTH
  FA -->|"REST + JWT"| CLOUD
  FA -.->|"REST + JWT"| FILES
  FA -->|"opens auth URL"| SB
  SB -->|"user consent"| GOOG
  GOOG -->|"redirect with code + state"| CLOUD
  CLOUD -->|"deep link mydrive://linked"| FA

  AUTH --> MDB
  CLOUD --> MDB
  CLOUD -->|"exchange code, refresh tokens"| GOOG
  FILES -.-> MDB
  CLOUD -.->|"enqueue sync"| REDIS
  REDIS -.-> SYNC
  SYNC -.->|"list files, Changes API"| GOOG
  SYNC -.-> DBX
  SYNC -.-> JIO
  SYNC -.->|"upsert files, sync_jobs"| MDB

  classDef planned stroke-dasharray: 5 5,stroke:#888,color:#555;
  class FILES,SYNC,REDIS,DBX,JIO planned;
```

## 2. Sequence diagrams

## 2a. Register, login, protected call, logout

```mermaid
sequenceDiagram
  autonumber
  participant App as Flutter app
  participant API as NestJS AuthModule
  participant DB as MongoDB

  App->>API: POST register (name, email, password)
  API->>DB: insert user (hashed password)
  API-->>App: 201 + JWT

  App->>API: POST login (email, password)
  API->>DB: find user, verify password
  API-->>App: 200 + JWT

  App->>API: GET protected route (Bearer JWT)
  alt valid token
    API-->>App: 200 data
  else expired or invalid token
    API-->>App: 401 Unauthorized
    App->>App: clear token, go to login screen
  end

  App->>API: POST logout (Bearer JWT)
  API->>DB: revoke session or refresh token
  API-->>App: 200
  App->>App: clear stored tokens
```

## 2b. Link Google Drive

```mermaid
sequenceDiagram
  autonumber
  participant App as Flutter app
  participant API as NestJS CloudModule
  participant Br as System browser
  participant G as Google OAuth + Drive
  participant DB as MongoDB

  App->>API: POST /cloud/google/link (Bearer JWT)
  API->>DB: save nonce in oauth_states (TTL)
  API->>API: create signed state (userId, nonce, expiry)
  API-->>App: authUrl
  App->>Br: open authUrl
  Br->>G: show consent screen
  alt user approves
    G-->>Br: redirect to GOOGLE_REDIRECT_URI with code and state
    Br->>API: GET /cloud/google/callback
    API->>API: verify signature and expiry
    API->>DB: consume nonce (single use)
    API->>G: exchange code for access + refresh tokens
    G-->>API: tokens
    API->>API: encrypt tokens (AES-256-GCM)
    API->>DB: upsert cloud_accounts for userId
    API-->>Br: redirect mydrive://linked
    Br-->>App: deep link opens app
    App->>API: GET linked accounts (Bearer JWT)
    API->>DB: find cloud_accounts by userId
    API-->>App: accounts list
  else user denies consent
    G-->>Br: redirect with error=access_denied
    Br->>API: GET /cloud/google/callback with error
    API-->>Br: redirect mydrive://linked?error=denied
    Br-->>App: deep link, show message
  else state invalid, expired, or replayed
    Br->>API: GET /cloud/google/callback
    API-->>Br: reject, redirect with error
    Br-->>App: deep link, show message
  end
```

## 2c. Sync and classification (planned)

```mermaid
sequenceDiagram
  autonumber
  participant API as NestJS CloudModule
  participant Q as BullMQ + Redis
  participant W as Sync worker
  participant DB as MongoDB
  participant G as Google Drive API
  participant App as Flutter app

  API->>Q: enqueue initial sync (cloudAccountId)
  Q->>W: deliver job
  W->>DB: create sync_jobs record (running)
  W->>DB: load and decrypt tokens
  loop each page of files
    W->>G: files.list (pageToken)
    G-->>W: file metadata
    W->>W: classify by mimeType into category
    W->>DB: bulk upsert files
  end
  W->>DB: save Changes API cursor on cloud_accounts
  W->>DB: mark sync_jobs done

  App->>API: GET /files/summary
  API->>DB: aggregate count by category
  API-->>App: images, videos, audios, documents
  App->>API: GET /files?category=image&page=1
  API->>DB: query files by userId and category
  API-->>App: paginated files
```

## 3. ER diagram (MongoDB collections)

```mermaid
erDiagram
  USER ||--o{ SESSION : "has"
  USER ||--o{ OAUTH_STATE : "starts"
  USER ||--o{ CLOUD_ACCOUNT : "links"
  USER ||--o{ FILE : "owns"
  CLOUD_ACCOUNT ||--o{ FILE : "contains"
  CLOUD_ACCOUNT ||--o{ SYNC_JOB : "runs"

  USER {
    ObjectId _id PK
    string name
    string email UK "lowercase"
    string passwordHash "argon2 or bcrypt"
    string status "active, disabled"
    date lastLoginAt
    date createdAt
    date updatedAt
  }

  SESSION {
    ObjectId _id PK
    ObjectId userId FK
    string refreshTokenHash "never store raw token"
    string deviceName
    string ip
    date expiresAt "TTL index"
    date revokedAt
    date createdAt
  }

  OAUTH_STATE {
    ObjectId _id PK
    string nonce UK
    ObjectId userId FK
    string provider
    date expiresAt "TTL index"
    date usedAt
  }

  CLOUD_ACCOUNT {
    ObjectId _id PK
    ObjectId userId FK
    string provider "google, dropbox, jio"
    string providerAccountId "provider user id"
    string email
    string displayName
    array scopes
    object accessTokenEnc "iv, tag, data, keyVersion"
    object refreshTokenEnc "iv, tag, data, keyVersion"
    date tokenExpiresAt
    string status "active, needs_reauth, unlinked"
    string lastError
    object sync "status, lastSyncedAt, cursor"
    object quota "used, total"
    date linkedAt
    date unlinkedAt
  }

  SYNC_JOB {
    ObjectId _id PK
    ObjectId cloudAccountId FK
    string type "full, incremental"
    string status "queued, running, done, failed"
    number filesProcessed
    string error
    date startedAt
    date finishedAt
  }

  FILE {
    ObjectId _id PK
    ObjectId userId FK "denormalized for fast dashboard"
    ObjectId cloudAccountId FK
    string provider
    string providerFileId
    string name
    string mimeType
    string extension
    string category "image, video, audio, document, other"
    boolean isFolder
    number size
    string checksum
    array parentIds
    string webViewLink
    boolean hasThumbnail
    date createdTime
    date modifiedAt
    boolean trashed
    date syncedAt
  }
```

## 4. MongoDB schema notes

### Collections

| Collection | Purpose | Status |
|---|---|---|
| `users` | Accounts for My Drive | Built |
| `sessions` | Refresh tokens per device, enables real logout and "log out everywhere" | Recommended |
| `oauth_states` | Single-use nonces for the OAuth state, auto-deleted by TTL; replaces the in-memory store and works across multiple instances | Recommended |
| `cloud_accounts` | One linked provider account per record, with encrypted tokens and sync cursor | Built |
| `sync_jobs` | History and status of each sync run, for debugging and showing progress | Planned |
| `files` | One document per provider file or folder, with a normalized category | Planned |

### Indexes

```js
// users
{ email: 1 }                                   // unique, store lowercase

// sessions
{ userId: 1 }
{ refreshTokenHash: 1 }                        // unique
{ expiresAt: 1 }, { expireAfterSeconds: 0 }    // TTL

// oauth_states
{ nonce: 1 }                                   // unique
{ expiresAt: 1 }, { expireAfterSeconds: 0 }    // TTL

// cloud_accounts
{ userId: 1, provider: 1, providerAccountId: 1 }  // unique: no duplicate links
{ userId: 1, status: 1 }

// sync_jobs
{ cloudAccountId: 1, startedAt: -1 }

// files
{ cloudAccountId: 1, providerFileId: 1 }          // unique: safe upserts
{ userId: 1, category: 1, modifiedAt: -1 }        // dashboard by category
{ userId: 1, cloudAccountId: 1, parentIds: 1 }    // folder browsing
{ userId: 1, name: "text" }                       // or Atlas Search for better results
```

### Design decisions

1. **Store `userId` on every file** (denormalized). The dashboard asks "all images for this user across clouds", and this avoids a join through `cloud_accounts`. On unlink, delete by `cloudAccountId`.
2. **Encrypt tokens as sub-documents**: `{ v, keyVersion, iv, tag, data }`. `keyVersion` lets you rotate `CLOUD_TOKEN_ENCRYPTION_KEY` without forcing everyone to re-link.
3. **Never expose** `accessTokenEnc` or `refreshTokenEnc` in API responses. Use `select: false` in Mongoose.
4. **Normalize category once at sync time** (`image | video | audio | document | other`) using MIME type for Google and file extension for Dropbox. Keep the original `mimeType` too.
5. **`parentIds` is an array** because a Google Drive file can have more than one parent, while Dropbox is path-based.
6. **Do not persist Google `thumbnailLink`** as a long-lived URL (it expires). Store `hasThumbnail` and fetch a fresh link or proxy it on demand.
7. **Use bulk upserts** (`bulkWrite`) in sync jobs, keyed on `(cloudAccountId, providerFileId)`.
8. **Unlink flow**: revoke the token at the provider, set `status: "unlinked"`, delete the account's `files`, and delete or anonymize its `sync_jobs`.
9. **Account deletion**: delete `sessions`, `cloud_accounts`, `files`, `sync_jobs`, and `oauth_states` for that user before removing the `users` record.
