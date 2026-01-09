import { updateDnsRecord } from "./lib";
export default function run() {
	setInterval(updateDnsRecord, 24 * 60 * 60 * 1000);
	updateDnsRecord();
}
