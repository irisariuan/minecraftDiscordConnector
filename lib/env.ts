import "dotenv/config";

// Required
if (
	!process.env.CLIENT_ID ||
	!process.env.TOKEN ||
	!process.env.UPLOAD_URL ||
	!process.env.DATABASE_URL
)
	throw new Error("Missing CLIENT_ID or TOKEN in environment variables");
export const CLIENT_ID = process.env.CLIENT_ID;
export const TOKEN = process.env.TOKEN;
export const UPLOAD_URL = process.env.UPLOAD_URL;
export const DATABASE_URL = process.env.DATABASE_URL;

// Optional
export const APPROVAL_TIMEOUT = process.env.APPROVAL_TIMEOUT;
export const UPDATE_URL = process.env.UPDATE_URL;
export const CF_KEY = process.env.CF_KEY;
export const CORS_ORIGIN = process.env.CORS_ORIGIN;
