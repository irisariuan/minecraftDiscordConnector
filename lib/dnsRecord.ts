export const apiHeader = {
	Authorization: `Bearer ${process.env.CF_KEY}`,
};

export type UpdateResult = "ok" | "noChange" | "error";

export async function updateDnsRecord(): Promise<UpdateResult> {
	if (!process.env.UPDATE_URL || !process.env.CF_KEY) {
		console.log("No update URL or authentication details provided");
		return "error";
	}
	const ipReq = await fetch("https://api.ipify.org?format=json");
	const ipData = (await ipReq.json()) as { ip: string };
	const ip = ipData.ip;

	const currentReq = await fetch(process.env.UPDATE_URL, {
		headers: apiHeader,
	});
	if (!currentReq.ok) {
		console.error("Failed to fetch current IP:", await currentReq.text());
		return "error";
	}
	const currentData = (await currentReq.json()) as {
		success: boolean;
		result?: {
			content: string;
		};
	};
	if (currentData.success && currentData.result) {
		console.log("Current content:", currentData.result.content);
	}
	if (currentData.success && currentData.result?.content === ip) {
		console.log("IP address has not changed, skipping update");
		return "noChange";
	}
	console.log("IP address has changed, updating...");
	const updateRes = await fetch(process.env.UPDATE_URL, {
		method: "PATCH",
		headers: {
			...apiHeader,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			comment: `Updated by Discord bot, last at ${new Date().toISOString()}`,
			content: ip,
		}),
	});
	if (!updateRes.ok) {
		console.error("Failed to update:", await updateRes.text());
		return "error";
	}
	console.log("Update successful");
	return "ok";
}
