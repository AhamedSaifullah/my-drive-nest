# Journey Matrix

Test coverage is marked `unknown` because no test execution or coverage report was provided.

| ID | Journey | Endpoints | Collections touched | Status | Test coverage |
|---|---|---|---|---|---|
| J01 | Register | `POST /user/create-user` | `users` write | IMPLEMENTED | unknown |
| J02 | Login | `POST /user/login-user` | `users` read | IMPLEMENTED | unknown |
| J03 | Invalid/expired JWT | Any protected route | None on rejection; in-memory blacklist | IMPLEMENTED | unknown |
| J04 | Edit profile | `PATCH /user/update-user` | `users` read/write | IMPLEMENTED | unknown |
| J05 | Logout | `POST /user/logout` | In-memory token blacklist | IMPLEMENTED, limited | unknown |
| J06 | Refresh access token | `POST /auth/refresh` | `refresh_sessions` read/write; `users` read | IMPLEMENTED | unknown |
| J07 | Refresh-token reuse detection | `POST /auth/refresh` | `refresh_sessions` family revocation | IMPLEMENTED | unknown |
| J08 | Link Google Drive | `POST /cloud/google/link`; Google callback `GET /cloud/google/callback`; `GET /cloud/google/accounts` | `cloud_accounts` write/read | IMPLEMENTED | unknown |
| J09 | Denial/expired/replayed state | `GET /cloud/google/callback` | `oauth_states` atomically consumed | IMPLEMENTED | unknown |
| J10 | Link same Google account twice | Same as J08 | `cloud_accounts` upsert | IMPLEMENTED, conflict handling partial | unknown |
| J11 | List linked accounts | `GET /cloud/google/accounts` | `cloud_accounts` read | IMPLEMENTED | unknown |
| J12 | Unlink Google account | `DELETE /cloud/accounts/:id` (legacy `POST /cloud/google/unlink`) | `cloud_accounts` update; `files` delete | IMPLEMENTED | unknown |
| J13 | Expired/revoked provider token | Internal `CloudService.getGoogleAccessToken`; future sync/re-link | `cloud_accounts` refresh/status update | PARTIAL | unknown |
| J14 | Initial sync/classification | Queue foundation; future worker | `sync_jobs` schema; `cloud_accounts` read; `files` write | PLANNED | unknown |
| J15 | Browse by category | `GET /files?category=&page=` planned | `files` read | PLANNED | unknown |
| J16 | View/download file | File endpoint planned | `files` read; provider read | PLANNED | unknown |
| J17 | Dropbox/Jio Cloud | Provider endpoints planned | `cloud_accounts`, `files` planned | PLANNED | unknown |
| J18 | Delete account/data | Delete endpoint planned | `users`, `cloud_accounts`, `files` planned delete | PLANNED | unknown |

## Current implemented route summary

| Method | Path | Purpose |
|---|---|---|
| POST | `/user/create-user` | Register |
| POST | `/user/login-user` | Login |
| GET | `/user/details` | Read current user |
| PATCH | `/user/update-user` | Update current user |
| POST | `/user/logout` | Blacklist current JWT in process memory |
| POST | `/auth/refresh` | Rotate a refresh token and issue a new token pair |
| POST | `/cloud/google/link` | Create Google authorization URL |
| GET | `/cloud/google/callback` | Verify state, exchange code, encrypt and save tokens |
| GET | `/cloud/google/accounts` | List linked cloud account metadata |
| DELETE | `/cloud/accounts/:id` | Revoke Google grant and remove local account/files |
