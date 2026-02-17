import {
	type AutocompleteInteraction,
	type ChatInputCommandInteraction,
	GuildMember,
	MessageFlags,
	Role,
	roleMention,
	SlashCommandSubcommandGroupBuilder,
	time,
	User,
	userMention,
} from "discord.js";
import { spendCredit } from "../../lib/credit";
import {
	getAllRawTicketTypes,
	getRawTicketTypeById,
	getRawUserTicketByTicketId,
} from "../../lib/db";
import {
	createTicketEmbed,
	createTicketUpdateEmbed,
} from "../../lib/embed/ticket";
import { sendPaginationMessage } from "../../lib/pagination";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../../lib/permission";
import { settings } from "../../lib/settings";
import {
	addTicketToUser,
	getUserTicketsByUserId,
	isTicketAvailable,
	removeTicketFromUser,
	type Ticket,
	TicketEffectTypeNames,
	updateUserTicket,
} from "../../lib/ticket";
import {
	extractUser,
	parseTimeString,
	trimTextWithSuffix,
} from "../../lib/utils";

export function initTicketGroup(group: SlashCommandSubcommandGroupBuilder) {
	return group
		.setName("ticket")
		.setDescription("Manage tickets")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("list")
				.setDescription("List all tickets")
				.addUserOption((option) =>
					option
						.setName("user")
						.setDescription("User to list tickets for")
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("add")
				.setDescription("Add a ticket to user(s)")
				.addMentionableOption((option) =>
					option
						.setName("user")
						.setDescription("User to add ticket to")
						.setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName("tickettype")
						.setDescription("Type of ticket to add")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addIntegerOption((option) =>
					option
						.setName("quantity")
						.setDescription("Number of tickets to add")
						.setRequired(true),
				)
				.addIntegerOption((option) =>
					option
						.setName("maxuse")
						.setDescription("Maximum uses for the ticket")
						.setRequired(false)
						.setMinValue(1),
				)
				.addStringOption((option) =>
					option
						.setName("expire")
						.setDescription(
							"Expiration time (DD:HH:MM:SS, HH:MM:SS, MM:SS, or Ns)",
						)
						.setRequired(false),
				)
				.addBooleanOption((option) =>
					option
						.setName("silent")
						.setDescription(
							"Whether to update the ticket silently without sending user(s) a notification",
						)
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("remove")
				.setDescription("Remove a ticket from user(s)")
				.addMentionableOption((option) =>
					option
						.setName("user")
						.setDescription("User to remove ticket from")
						.setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName("ticketid")
						.setDescription("ID of the ticket to remove")
						.setRequired(true),
				)
				.addBooleanOption((option) =>
					option
						.setName("silent")
						.setDescription(
							"Whether to update the ticket silently without sending user(s) a notification",
						)
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("update")
				.setDescription("Update a ticket's properties")
				.addStringOption((option) =>
					option
						.setName("ticketid")
						.setDescription("ID of the ticket to update")
						.setRequired(true),
				)
				.addIntegerOption((option) =>
					option
						.setName("maxuse")
						.setDescription(
							"New maximum uses for the ticket (0 for unlimited)",
						)
						.setRequired(false)
						.setMinValue(0),
				)
				.addStringOption((option) =>
					option
						.setName("expire")
						.setDescription(
							"New expiration time (DD:HH:MM:SS, HH:MM:SS, MM:SS, Ns, or 'remove' to clear)",
						)
						.setRequired(false),
				)
				.addStringOption((option) =>
					option
						.setName("reason")
						.setDescription(
							"New reason for the ticket (empty to clear)",
						)
						.setRequired(false),
				)
				.addBooleanOption((option) =>
					option
						.setName("silent")
						.setDescription(
							"Whether to update the ticket silently without sending user(s) a notification",
						)
						.setRequired(false),
				),
		);
}

export async function handleTicketAutocomplete(
	interaction: AutocompleteInteraction,
) {
	const focusedOption = interaction.options.getFocused(true);

	if (focusedOption.name === "tickettype") {
		try {
			const allTicketTypes = await getAllRawTicketTypes();
			const filtered = allTicketTypes
				.filter(
					(type) =>
						type.id
							.toLowerCase()
							.includes(focusedOption.value.toLowerCase()) ||
						type.name
							.toLowerCase()
							.includes(focusedOption.value.toLowerCase()),
				)
				.slice(0, 25); // Discord limit

			const choices = filtered.map((type) => ({
				name: `${type.name} (${type.id})`,
				value: type.id,
			}));

			await interaction.respond(choices);
			return;
		} catch (error) {
			console.error("Error in ticket autocomplete:", error);
			await interaction.respond([]);
			return;
		}
	}

	await interaction.respond([]);
}

export async function ticketHandler(interaction: ChatInputCommandInteraction) {
	const subcommand = interaction.options.getSubcommand(true);
	if (
		subcommand !== "list" &&
		!comparePermission(
			await readPermission(interaction.user),
			PermissionFlags.editTicket,
		)
	) {
		return await interaction.editReply({
			content: "You do not have permission to manage ticket types.",
		});
	}

	switch (subcommand) {
		case "list": {
			const user =
				interaction.options.getUser("user") ?? interaction.user;
			if (
				user.id !== interaction.user.id &&
				!(await spendCredit(interaction, {
					cost: settings.checkUserTicketFee,
					userId: interaction.user.id,
					reason: `Checking tickets for user ${user.username}`,
				}))
			) {
				return await interaction.editReply({
					content: `Failed to check tickets for other users!`,
				});
			}

			await sendPaginationMessage({
				interaction,
				getResult: async () => {
					const tickets = await getUserTicketsByUserId({
						userId: user.id,
						usableOnly: false,
					});
					return (
						tickets?.toSorted((a, b) => {
							// sort by availability, then by expiration date (soonest first), then by use count
							return (
								Number(isTicketAvailable(b)) -
									Number(isTicketAvailable(a)) ||
								(a.expiresAt?.getTime() ?? Infinity) -
									(b.expiresAt?.getTime() ?? Infinity) ||
								(a.histories?.length ?? 0) -
									(b.histories?.length ?? 0)
							);
						}) ?? []
					);
				},
				formatter: (ticket: Ticket) => {
					const useCount = ticket.histories?.length ?? 0;
					const maxUseText =
						ticket.maxUse !== null && ticket.maxUse > 0
							? ` (${useCount}/${ticket.maxUse} uses)`
							: ` (Used ${useCount} times)`;

					// Add expiration info if ticket has an expiration date
					let expireText = "No expiration date";
					let isExpired = false;
					if (ticket.expiresAt) {
						const expireDate = new Date(ticket.expiresAt);
						const now = new Date();
						isExpired = expireDate <= now;
						expireText = isExpired
							? `**Expired** at ${time(expireDate)}`
							: `Expires at ${time(expireDate)}`;
					}

					return {
						name: `${ticket.name}`,
						value: `Ticket ID: \`${ticket.ticketId}\`\nTicket Type ID: \`${ticket.ticketTypeId}\`\nEffect: ${
							TicketEffectTypeNames[ticket.effect.effect] ??
							"Unknown effect"
						} (${ticket.effect.value})\n${
							ticket.description || "No description"
						}\n${expireText}\nAvailability: ${
							isTicketAvailable(ticket)
								? "✅ Usable"
								: "❌ Not usable"
						}${maxUseText}`,
					};
				},
				filterFunc: (filter?: string) => (ticket: Ticket) => {
					if (!filter) return true;
					const searchText = filter.toLowerCase();
					return (
						ticket.name.toLowerCase().includes(searchText) ||
						ticket.ticketTypeId
							.toLowerCase()
							.includes(searchText) ||
						ticket.ticketId.toLowerCase().includes(searchText) ||
						(ticket.description
							?.toLowerCase()
							.includes(searchText) ??
							false)
					);
				},
				options: {
					title: `Tickets for ${user.username}`,
					mainColor: "Blue",
					notFoundMessage: `${user.id === interaction.user.id ? "You have" : `${userMention(user.id)} has`} no tickets.`,
				},
				interactionFilter: (i) => i.user.id === interaction.user.id,
				selectMenuTransform: (ticket: Ticket, index: number) => ({
					label: trimTextWithSuffix(ticket.name, 100),
					value: ticket.ticketId,
					description: ticket.description
						? `${trimTextWithSuffix(ticket.description, 50)}, ID: ${ticket.ticketId}`
						: `No description, ID: ${ticket.ticketId}`,
				}),
				onItemSelected: async (menuInteraction, result) => {
					await menuInteraction.deferReply({
						flags: MessageFlags.Ephemeral,
					});
					const tickets = await result.getData();
					const ticket = tickets?.find(
						(t) => t.ticketId === menuInteraction.values[0],
					);
					if (!ticket) return false;
					await menuInteraction.editReply({
						embeds: [
							createTicketEmbed(
								ticket,
								user.username,
								interaction.user.username,
							),
						],
					});
					return false;
				},
			});
			return;
		}
		case "add": {
			const users = interaction.options.getMentionable("user", true);
			const silent = interaction.options.getBoolean("silent") ?? false;
			const ticketTypeId = interaction.options.getString(
				"tickettype",
				true,
			);
			const quantity = interaction.options.getInteger("quantity", true);
			const maxUse = interaction.options.getInteger("maxuse");
			const expireInput = interaction.options.getString("expire");

			// Parse expire input using utility function or use default from ticket type
			let expiresAt: Date | null = null;
			if (expireInput) {
				const expireMs = parseTimeString(expireInput);
				if (expireMs === null) {
					return await interaction.editReply({
						content:
							"Invalid expire format. Supported formats: DD:HH:MM:SS, HH:MM:SS, MM:SS, or Ns (e.g., 102s)",
					});
				}
				expiresAt = new Date(Date.now() + expireMs);
			}

			// Check if ticket type exists
			const ticketType = await getRawTicketTypeById(ticketTypeId);
			if (!ticketType) {
				return await interaction.editReply({
					content: `Ticket type \`${ticketTypeId}\` not found.`,
				});
			}

			if (users instanceof User || users instanceof GuildMember) {
				await addTicketToUser({
					user: extractUser(users),
					ticketTypeId: ticketType.id,
					quantity,
					reason: `Added by ${interaction.user.username}`,
					maxUse,
					expiresAt,
					silent
				});
				let expireText = "";
				if (expireInput) {
					expireText = ` (expires at ${expiresAt ? time(expiresAt) : "unknown time"})`;
				}
				return await interaction.editReply({
					content: `Added ${quantity} \`${ticketType.name}\` ticket(s) to ${userMention(users.id)}${expireText}.`,
				});
			}

			if (users instanceof Role) {
				let userCount = 0;
				for (const [_, member] of users.members) {
					await addTicketToUser({
						user: member.user,
						ticketTypeId: ticketType.id,
						quantity,
						reason: `Added by ${interaction.user.username} to role ${users.name}`,
						maxUse,
						expiresAt,
						silent
					});
					userCount++;
				}
				let expireText = "";
				if (expireInput) {
					expireText = ` (expires at ${expiresAt ? time(expiresAt) : "unknown time"})`;
				}
				return await interaction.editReply({
					content: `Added ${quantity} \`${ticketType.name}\` ticket(s) to ${userCount} users in role ${roleMention(users.id)}${expireText}.`,
				});
			}

			return await interaction.editReply({
				content: "Invalid user/role specified.",
			});
		}
		case "remove": {
			const users = interaction.options.getMentionable("user", true);
			const ticketId = interaction.options.getString("ticketid", true);
			const silent = interaction.options.getBoolean("silent") ?? false;

			if (users instanceof User || users instanceof GuildMember) {
				const removed = await removeTicketFromUser({
					ticketId,
					user: extractUser(users),
				});
				if (!removed) {
					return await interaction.editReply({
						content: `Ticket \`${ticketId}\` not found for user ${userMention(users.id)}.`,
					});
				}
				return await interaction.editReply({
					content: `Removed ticket \`${ticketId}\` from ${userMention(users.id)}.`,
				});
			}

			if (users instanceof Role) {
				let removedCount = 0;
				for (const [_, member] of users.members) {
					const removed = await removeTicketFromUser({
						ticketId,
						user: member.user,
						silent
					});
					if (removed) removedCount++;
				}
				return await interaction.editReply({
					content: `Removed ticket \`${ticketId}\` from ${removedCount} users in role ${roleMention(users.id)}.`,
				});
			}

			return await interaction.editReply({
				content: "Invalid user/role specified.",
			});
		}
		case "update": {
			const ticketId = interaction.options.getString("ticketid", true);
			const newMaxUse = interaction.options.getInteger("maxuse");
			const expireInput = interaction.options.getString("expire");
			const newReason = interaction.options.getString("reason");
			const silent = interaction.options.getBoolean("silent") ?? false;

			// Parse expire input
			let newExpiresAt: Date | null | undefined = undefined;
			if (expireInput) {
				if (expireInput.toLowerCase() === "remove") {
					newExpiresAt = null;
				} else {
					const expireMs = parseTimeString(expireInput);
					if (expireMs === null) {
						return await interaction.editReply({
							content:
								"Invalid expire format. Use DD:HH:MM:SS, HH:MM:SS, MM:SS, Ns, or 'remove' to clear expiration.",
						});
					}
					newExpiresAt = new Date(Date.now() + expireMs);
				}
			}

			// Check if there's anything to update
			if (newMaxUse === null && !expireInput && newReason === null) {
				return await interaction.editReply({
					content:
						"No updates specified. Please provide at least one field to update.",
				});
			}

			const rawTicket = await getRawUserTicketByTicketId(ticketId);
			if (!rawTicket) {
				return await interaction.editReply({
					content: `Ticket \`${ticketId}\` not found.`,
				});
			}

			const success = await updateUserTicket({
				ticketId,
				maxUse: newMaxUse,
				expiresAt: newExpiresAt,
				reason:
					newReason !== null && newReason.length > 0
						? newReason
						: newReason === null
							? null
							: undefined,
				user: await interaction.client.users
					.fetch(rawTicket.userId)
					.catch(() => null),
				silent
			});

			if (!success) {
				return await interaction.editReply({
					content: `Ticket \`${ticketId}\` not found or no changes were made.`,
				});
			}

			// Build update summary
			const updates: string[] = [];
			if (newMaxUse !== null) {
				updates.push(`Max uses: ${newMaxUse}`);
			}
			if (expireInput) {
				if (newExpiresAt) {
					updates.push(`Expires: ${time(newExpiresAt)}`);
				} else {
					updates.push("Expiration: removed");
				}
			}
			if (newReason !== null) {
				updates.push(`Reason: ${newReason}`);
			}

			return await interaction.editReply({
				embeds: [
					createTicketUpdateEmbed(
						"Ticket Updated",
						ticketId,
						updates,
					),
				],
			});
		}
	}
	return await interaction.editReply({
		content: "Unknown subcommand",
	});
}
