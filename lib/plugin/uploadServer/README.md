# Upload Server

This directory contains the modular upload server implementation with separated concerns.

## Architecture

The upload server is split into two main components:

1. **UploadServer** - Handles HTTP server, routing, and file operations
2. **TokenManager** - Manages all token lifecycle, validation, and state

## Structure

- `utils.ts` - Shared utilities, types, and schemas
- `TokenManager.ts` - Token lifecycle management and validation
- `verifyEndpoint.ts` - Token verification endpoint
- `fileEndpoint.ts` - File download endpoint
- `uploadEndpoint.ts` - File upload endpoint
- `editEndpoint.ts` - File editing endpoint
- `deleteTokenEndpoint.ts` - Token deletion endpoint
- `README.md` - This documentation

## TokenManager

The `TokenManager` class handles all token-related operations:

### Features

- **Token Creation**: Generate unique tokens for different operations
- **Token Validation**: Check token existence and activity status
- **Token Lifecycle**: Use, await, deactivate, and dispose tokens
- **Diff Management**: Store and retrieve file diffs for approval workflows
- **Event Emission**: Notify listeners of token state changes

### Token Types

- `FileToken` - For file uploads
- `EditToken` - For file editing (requires approval)
- `EditForceToken` - For file editing (no approval needed)
- `EditDiffToken` - For viewing diffs between original and edited content

### Methods

#### Creation
- `createFileToken()` - Create a token for file upload
- `createEditToken(params)` - Create a token for file editing

#### Validation
- `hasActiveToken(token, type)` - Check if token is active and matches type
- `hasToken(token)` - Check if token exists (active or inactive)
- `getTokenType(token)` - Get the type of a token

#### Usage
- `useFileToken(token, file, timeout)` - Consume a file token and store the file
- `useEditToken(token)` - Consume an edit token
- `awaitFileToken(token, timeout)` - Wait for a file token to be used
- `awaitEditToken(token, timeout)` - Wait for an edit token to be used

#### Disposal
- `deactivateToken(token)` - Deactivate a token (keeps resources)
- `disposeToken(token)` - Dispose token and free all resources

#### Diff Management
- `newDiff(sessionId, content)` - Create a new diff for a session
- `getDiff(sessionId)` - Retrieve a diff by session ID
- `deleteDiff(sessionId)` - Delete a diff

#### Statistics
- `getActiveTokenCount()` - Number of active tokens
- `getFileTokenCount()` - Number of stored files
- `getAllTokenCount()` - Total number of tokens created

### Events

The TokenManager emits the following events:

- `tokenCreated` - When a new token is created
- `tokenUsed` - When a token is consumed
- `tokenDeleted` - When a token is deleted/deactivated
- `fileExpired` - When a stored file expires

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

## Integration

The `UploadServer` class delegates all token operations to the `TokenManager`:

```typescript
const uploadServer = new UploadServer();

// Create tokens
const fileToken = uploadServer.tokenManager.createFileToken();
const editResult = uploadServer.tokenManager.createEditToken({
  file: { filename: "config.yml", containingFolderPath: "/server" },
  type: TokenType.EditToken,
});

// Check tokens
if (uploadServer.tokenManager.hasActiveToken(token, TokenType.FileToken)) {
  // Token is valid and active
}

// Dispose tokens
uploadServer.tokenManager.disposeToken(token);
```

The server automatically starts when tokens are created and stops when all tokens are consumed or expired.