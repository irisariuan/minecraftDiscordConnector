import { userMention } from "discord.js";

export function createUserMentions(ids: string[]) {
	const counter: Record<string, number> = {};
	for (const id of ids) {
		if (counter[id]) {
			counter[id]++;
		} else {
			counter[id] = 1;
		}
	}
	const mentions = [];
	for (const [id, val] of Object.entries(counter)) {
		if (val > 1) {
			mentions.push(`${userMention(id)} x${val}`);
		} else {
			mentions.push(userMention(id));
		}
	}
	return mentions.join(", ");
}
