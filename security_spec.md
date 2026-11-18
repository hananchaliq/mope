# MoneyScope — Security TDD Specification (`security_spec.md`)

## 1. Data Invariants (Row-Level Isolation & Integrity Laws)

1. **Strict Tenant Isolation (RLS Equivalent)**: Every document under `/users/{userId}/...` can only be read, listed, created, updated, or deleted when `request.auth != null`, `request.auth.token.email_verified == true`, `request.auth.uid == userId`, and `incoming().userId == request.auth.uid`.
2. **Master Gate Relational Sync**: Every subcollection (`/accounts`, `/categories`, `/transactions`, `/budgets`, `/foodLogs`, `/reportPreferences`) requires the parent `/users/{userId}` profile document to exist (`exists(/databases/$(database)/documents/users/$(userId))`).
3. **Positive Integer Money Invariant**: Every `Transaction.amount` must be an integer strictly greater than `0` (`data.amount is int && data.amount > 0`). Every `Budget.limitAmount` must be `is int && data.limitAmount > 0`.
4. **Atomic Transfer Integrity**: A `transfer` transaction cannot transfer to the same account (`data.type != 'transfer' || data.toAccountId != data.accountId`).
5. **Strict Key Allowlisting (Anti-Shadow-Field)**: Every `create` operation enforces `data.keys().hasAll(...) && data.keys().hasOnly(...)`, and every `update` operation enforces `isValid[Entity](incoming())` + `incoming().diff(existing()).affectedKeys().hasOnly(...)`.
6. **Temporal & Identity Immutability**: `createdAt` must equal `request.time` on `create` and remain immutable on `update`; `updatedAt` must equal `request.time` on both `create` and `update`; `userId` is strictly immutable.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 01 (Cross-Tenant Read/Write — User B accesses User A's transactions)**:
   - Auth: `uid = "user_B"`, Path: `/users/user_A/transactions/tx_1` -> **MUST DENY**.
2. **Payload 02 (Unverified Email Spoofing)**:
   - Auth: `uid = "user_A", email_verified = false`, Path: `/users/user_A` -> **MUST DENY**.
3. **Payload 03 (Identity Field Mismatch in Body)**:
   - Auth: `uid = "user_A"`, Path: `/users/user_A/transactions/tx_1`, Body: `{ userId: "user_B", ... }` -> **MUST DENY**.
4. **Payload 04 (Shadow / Ghost Field Injection)**:
   - Auth: `uid = "user_A"`, Path: `/users/user_A/accounts/acc_1`, Body includes `{ ..., isAdmin: true }` -> **MUST DENY**.
5. **Payload 05 (Zero or Negative Transaction Amount)**:
   - Auth: `uid = "user_A"`, Path: `/users/user_A/transactions/tx_1`, Body: `{ amount: -50000, ... }` -> **MUST DENY**.
6. **Payload 06 (Self-Transfer to Identical Account)**:
   - Auth: `uid = "user_A"`, Path: `/users/user_A/transactions/tx_1`, Body: `{ type: "transfer", accountId: "acc_1", toAccountId: "acc_1", ... }` -> **MUST DENY**.
7. **Payload 07 (Orphaned Subcollection Write Without Parent User Profile)**:
   - Auth: `uid = "user_orphan"`, Path: `/users/user_orphan/accounts/acc_1` (when `/users/user_orphan` does not exist) -> **MUST DENY**.
8. **Payload 08 (ID Poisoning / Oversized Document ID)**:
   - Auth: `uid = "user_A"`, Path: `/users/user_A/transactions/invalid$id!with@spaces` -> **MUST DENY**.
9. **Payload 09 (Denial-of-Wallet Oversized String Field)**:
   - Auth: `uid = "user_A"`, Path: `/users/user_A/transactions/tx_1`, Body: `{ notes: "<10,000 char string>" }` -> **MUST DENY**.
10. **Payload 10 (Unbounded Array Injection on Budget Thresholds)**:
    - Auth: `uid = "user_A"`, Path: `/users/user_A/budgets/b_1`, Body: `{ alertThresholds: [10,20,30,40,50,60,70,80,90,100,110] }` (> 5 items) -> **MUST DENY**.
11. **Payload 11 (Immutable `createdAt` or `userId` Mutation on Update)**:
    - Auth: `uid = "user_A"`, Update `/users/user_A/accounts/acc_1` changing `createdAt` -> **MUST DENY**.
12. **Payload 12 (Client-Forged Timestamp Skew)**:
    - Auth: `uid = "user_A"`, Create `/users/user_A/accounts/acc_1` with `createdAt != request.time` -> **MUST DENY**.

---

## 3. Red Team Audit Report (Phase 5)

| Collection | Identity Spoofing | Shadow Update | Value Poisoning | Query Trust (`list`) | Master Gate | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/users/{userId}` | Blocked (`userId == request.auth.uid`) | Blocked (`hasOnly`) | Blocked (`isValidUserProfile`) | `allow list: if false` | Root owner check | **PASS** |
| `/users/{userId}/accounts/{accountId}` | Blocked | Blocked | Blocked (`isValidAccount`) | `resource.data.userId == request.auth.uid` | `hasParentUser(userId)` | **PASS** |
| `/users/{userId}/categories/{categoryId}` | Blocked | Blocked | Blocked (`isValidCategory`) | `resource.data.userId == request.auth.uid` | `hasParentUser(userId)` | **PASS** |
| `/users/{userId}/transactions/{transactionId}` | Blocked | Blocked | Blocked (`isValidTransaction`) | `resource.data.userId == request.auth.uid` | `hasParentUser(userId)` | **PASS** |
| `/users/{userId}/budgets/{budgetId}` | Blocked | Blocked | Blocked (`isValidBudget`) | `resource.data.userId == request.auth.uid` | `hasParentUser(userId)` | **PASS** |
| `/users/{userId}/foodLogs/{foodLogId}` | Blocked | Blocked | Blocked (`isValidFoodLog`) | `resource.data.userId == request.auth.uid` | `hasParentUser(userId)` | **PASS** |
| `/users/{userId}/reportPreferences/{prefId}` | Blocked | Blocked | Blocked (`isValidReportPreference`) | `resource.data.userId == request.auth.uid` | `hasParentUser(userId)` | **PASS** |
