---
name: SIDMS Auth
description: Authentication details for the SIDMS app — password hashing, token storage, seeded credentials.
---

# SIDMS Auth

## Password Hashing
`sha256(password + "fib_salt_2026")` — implemented in `artifacts/api-server/src/routes/auth.ts`.

## Token Storage
Token stored in `sessionStorage` under key `sidms_token`. Officer data stored in `sessionStorage` under `sidms_officer`.

## Seeded Credentials
Officers D-1001 through D-1010 all have password "1234".
- D-1001: Kenny Chamber (Division Chief)

## API Hook Usage
```ts
const loginMutation = useLogin();
await loginMutation.mutateAsync({ data: { dienstnummer, passwort } });
// Returns: { officer: OfficerData, token: string }
```

## Query Key Functions
Each parameterized hook has a matching query key function:
- `getGetCaseQueryKey(id)`, `getGetCasePersonsQueryKey(id)`, etc.
- Must be imported from `@workspace/api-client-react` and passed as `queryKey` in query options.
