interface Time {
	hour: number;
	minute: number;
}

export function getNextTimestamp(time: Time) {
	const now = new Date();
	const next = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		time.hour,
		time.minute,
	);
	if (next < now) {
		next.setDate(next.getDate() + 1);
	}
	return next;
}