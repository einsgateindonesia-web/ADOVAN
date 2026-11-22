# Security Specification — Bhumi Swana Farm Firestore Rules

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`read, write: if false`).
2. **Verified Authentication Gate**: All Firestore operations on `batches`, `events`, `inquiries`, and `admins` require `request.auth != null && request.auth.token.email_verified == true`.
3. **Path ID Poisoning Guard**: Every single-document operation (`get`, `create`, `update`, `delete`) validates `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
4. **Strict Schema & Size Bounds (No Ghost Fields)**: Every write passes `isValidBatch()`, `isValidEvent()`, or `isValidInquiry()` checking `hasAll`, `hasOnly`, data types, enum allowlists, numeric ranges, and `.size()` on every string.
5. **Identity Integrity**: `createdByUid` and `updatedByUid` on `batches`, `actorUid` on `events`, and `ownerId` on `inquiries` must equal `request.auth.uid` on write. `createdByUid` and `workspaceId` are immutable after creation.
6. **Temporal Integrity**: `createdAt`, `updatedAt`, and `timestamp` must strictly equal `request.time` (server timestamp). `createdAt` is immutable on update.
7. **Action-Based Updates**: `batches` updates are partitioned into named actions (`isQuickCountUpdate` vs `isDetailUpdate`) using `affectedKeys().hasOnly(...)` wrapped inside `isValidBatch(incoming())`.
8. **Immutable Audit Trail**: `events` and `inquiries` cannot be updated or deleted from client SDKs (`allow update, delete: if false`).
9. **PII Isolation**: `inquiries` (containing `contact` and `name`) restricts `get` and `list` strictly to `existing().ownerId == request.auth.uid || isAdmin()`.
10. **Secure List Queries**: `allow list` on `batches` and `events` explicitly validates `resource.data.workspaceId == 'bhumi-swana-main'`, and `allow list` on `inquiries` validates `resource.data.ownerId == request.auth.uid || isAdmin()`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)

1. **Unauthenticated Write to `/batches/batch-unauth`**
   ```json
   { "auth": null, "op": "create", "path": "/batches/batch-unauth", "data": { "workspaceId": "bhumi-swana-main", "penName": "Test", "count": 10 } }
   ```
2. **Unverified Email Spoofing Admin Write to `/batches/batch-spoof`**
   ```json
   { "auth": { "uid": "u1", "token": { "email": "einsgateindonesia@gmail.com", "email_verified": false } }, "op": "create", "path": "/batches/batch-spoof", "data": { "workspaceId": "bhumi-swana-main", "penName": "Spoof", "count": 5 } }
   ```
3. **Ghost / Shadow Field Injection on Batch Create (`isAdmin: true`)**
   ```json
   { "auth": { "uid": "u1", "token": { "email_verified": true } }, "op": "create", "path": "/batches/batch-ghost", "data": { "workspaceId": "bhumi-swana-main", "penName": "Kandang X", "breed": "Duroc", "phase": "Pembesaran", "count": 10, "avgWeightKg": 40, "healthStatus": "Sehat", "notes": "", "updatedBy": "U1", "updatedByUid": "u1", "createdByUid": "u1", "isAdmin": true } }
   ```
4. **UID Spoofing (`createdByUid` or `updatedByUid` != `request.auth.uid`)**
   ```json
   { "auth": { "uid": "attacker", "token": { "email_verified": true } }, "op": "create", "path": "/batches/batch-uid-spoof", "data": { "workspaceId": "bhumi-swana-main", "penName": "Kandang X", "breed": "Duroc", "phase": "Pembesaran", "count": 10, "avgWeightKg": 40, "healthStatus": "Sehat", "notes": "", "updatedBy": "Victim", "updatedByUid": "victim-uid", "createdByUid": "victim-uid" } }
   ```
5. **Client-Spoofed Timestamp (`updatedAt != request.time`)**
   ```json
   { "auth": { "uid": "u1", "token": { "email_verified": true } }, "op": "create", "path": "/batches/batch-time-spoof", "data": { "workspaceId": "bhumi-swana-main", "penName": "Kandang X", "breed": "Duroc", "phase": "Pembesaran", "count": 10, "avgWeightKg": 40, "healthStatus": "Sehat", "notes": "", "updatedBy": "U1", "updatedByUid": "u1", "createdByUid": "u1", "createdAt": "2020-01-01T00:00:00Z", "updatedAt": "2020-01-01T00:00:00Z" } }
   ```
6. **ID Poisoning (Invalid Characters or >128 Char Document ID)**
   ```json
   { "auth": { "uid": "u1", "token": { "email_verified": true } }, "op": "create", "path": "/batches/invalid$id*poison", "data": { "workspaceId": "bhumi-swana-main", "penName": "Kandang X", "count": 10 } }
   ```
7. **Resource Exhaustion / String Overflow (`notes` > 200 chars or `penName` > 80 chars)**
   ```json
   { "auth": { "uid": "u1", "token": { "email_verified": true } }, "op": "create", "path": "/batches/batch-overflow", "data": { "workspaceId": "bhumi-swana-main", "penName": "A...100chars", "breed": "Duroc", "phase": "Pembesaran", "count": 10, "avgWeightKg": 40, "healthStatus": "Sehat", "notes": "", "updatedBy": "U1", "updatedByUid": "u1", "createdByUid": "u1" } }
   ```
8. **Out-of-Range / Type Poisoning on `count` (`-5` or string `"10"`)**
   ```json
   { "auth": { "uid": "u1", "token": { "email_verified": true } }, "op": "update", "path": "/batches/batch-a1", "data": { "count": -5, "updatedBy": "U1", "updatedByUid": "u1" } }
   ```
9. **Immortal Field Mutation (`createdAt` or `createdByUid` modified on update)**
   ```json
   { "auth": { "uid": "u1", "token": { "email_verified": true } }, "op": "update", "path": "/batches/batch-a1", "data": { "createdByUid": "u1", "count": 50, "updatedBy": "U1", "updatedByUid": "u1" } }
   ```
10. **Audit Log Tampering (Updating or Deleting `/events/{eventId}`)**
    ```json
    { "auth": { "uid": "u1", "token": { "email_verified": true } }, "op": "delete", "path": "/events/evt-1" }
    ```
11. **PII Leak Attempt (Non-owner `get` or `list` on `/inquiries/{inquiryId}`)**
    ```json
    { "auth": { "uid": "other-user", "token": { "email": "other@example.com", "email_verified": true } }, "op": "get", "path": "/inquiries/inq-victim" }
    ```
12. **Privilege Escalation (Client attempting to write `/admins/{uid}`)**
    ```json
    { "auth": { "uid": "attacker", "token": { "email_verified": true } }, "op": "create", "path": "/admins/attacker", "data": { "email": "attacker@example.com" } }
    ```
