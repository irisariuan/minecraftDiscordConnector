# Upload Server Endpoints

This directory contains the modular endpoint handlers for the upload server.

## Structure

- `utils.ts` - Shared utilities, types, and schemas
- `verifyEndpoint.ts` - Token verification endpoint
- `fileEndpoint.ts` - File download endpoint
- `uploadEndpoint.ts` - File upload endpoint
- `editEndpoint.ts` - File editing endpoint
- `deleteTokenEndpoint.ts` - Token deletion endpoint

## Endpoints

### GET `/api/verify/:id`

Verifies if a token is valid and checks its status.

**Response:**
```json
{
  "valid": true,
  "uploaded": false,
  "edited": false
}
```

### GET `/api/file/:id`

Downloads a file associated with a token.

**Response:** Binary file with appropriate headers

### POST `/api/upload/:id`

Uploads a file using a file token.

**Request:** Multipart form data with `upload` field

**Response:**
```json
"File uploaded successfully"
```

### POST `/api/edit/:id`

Handles file editing operations with multiple actions.

**Request Body:**
```json
{
  "action": "metadata" | "fetch" | "edit" | "rename" | "delete",
  "editedContent": "...", // for "edit" action
  "newFilename": "..." // for "rename" action
}
```

**Actions:**
- `metadata` - Get file information
- `fetch` - Retrieve file content
- `edit` - Submit edited content
- `rename` - Rename the file
- `delete` - Mark file as deleted

### DELETE `/api/token/:id`

Deletes or deactivates a token.

**Query Parameters:**
- `dispose` (optional, boolean) - If true, fully disposes the token and frees all associated resources

**Request Body (alternative):**
```json
{
  "dispose": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token disposed successfully",
  "wasActive": true
}
```

**Behavior:**
- Without `dispose=true`: Deactivates the token but keeps resources (diffs, sessions) in memory
- With `dispose=true`: Fully disposes the token and frees all associated resources (diffs, sessions, file data)

**Example Usage:**
```bash
# Just deactivate
DELETE /api/token/abc123

# Fully dispose
DELETE /api/token/abc123?dispose=true
```

## Token Types

- `FileToken` - For file uploads
- `EditToken` - For file editing (requires approval)
- `EditForceToken` - For file editing (no approval needed)
- `EditDiffToken` - For viewing diffs between original and edited content