---
name: api-conventions
description: Conventions for the backend API of a 3D web application built with this plugin, covering REST design, versioned routes, validation, the error format, file uploads for 3D assets, configuration and the docs/api.md contract. Use when designing, building or calling backend endpoints.
user-invocable: false
---

# API conventions

## Design

- JSON over HTTPS, REST-style resources
- All routes under `/api/v1/`
- Plural nouns for collections: `GET /api/v1/scenes`, `GET /api/v1/scenes/:id`
- Standard methods: `GET` read, `POST` create, `PATCH` partial update, `DELETE` remove
- camelCase field names in JSON
- ISO 8601 UTC timestamps, such as `2026-10-27T03:15:00Z`

## Status codes

| Code | Use for |
|---|---|
| 200 | Successful read or update |
| 201 | Created; include the new resource |
| 204 | Deleted; no body |
| 400 | Invalid input |
| 401 | Not signed in |
| 403 | Signed in but not allowed |
| 404 | Not found |
| 409 | Conflict, such as a duplicate |
| 413 | Upload too large |
| 429 | Rate limited |
| 500 | Unexpected server error |

## Error format

Every error uses the same shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Colour must be a hex value.",
    "details": [{ "field": "colour", "issue": "invalid_format" }]
  }
}
```

Never include stack traces or internal details in production responses.

## Validation

- Validate every request body, query and path parameter at the boundary with a schema library such as `zod`
- Share request and response types with the frontend where the stack allows it

## Lists

- Paginate every list: `?limit=20&cursor=<opaque>`
- Return `{ "items": [...], "nextCursor": "..." }`

## 3D asset uploads

- Never stream large files through the API server; issue a signed upload URL to object storage instead
- Check file type by content as well as extension, and enforce a size limit
- Run uploaded models through the optimisation pipeline before serving them

## Configuration

- Read all configuration and secrets from environment variables
- List every variable in `server/.env.example` without real values
- Restrict CORS to the app's own origins

## Common mistakes

| Mistake | Do this instead |
|---|---|
| Code and `docs/api.md` drifting apart | Change the document in the same step as the code, and note it in the handoff |
| Trusting an ID from the client | Check the record belongs to the signed-in user on every request |
| Returning a database error or stack trace | Map every failure to the error format |
| A list without a limit | Paginate, with a maximum page size |
| Validating in the handler body | Validate with a schema at the boundary, and derive the types from the schema |
| CORS set to `*` with credentials | List the app's origins |
| Testing only the success path | One test per error code in the contract |

## Contract

Document every endpoint in `docs/api.md` before implementing it; the frontend developer builds against this document in parallel:

```markdown
### POST /api/v1/scenes
Creates a saved scene.

**Auth:** required
**Body:** { "name": string, "config": SceneConfig }
**201:** Scene
**400:** VALIDATION_FAILED
```
