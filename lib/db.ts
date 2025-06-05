import { postgres } from "bun";

const sql = postgres({
	host: 'localhost',
	port: 5432,
	database: 'mcConnectorDb',
	
})