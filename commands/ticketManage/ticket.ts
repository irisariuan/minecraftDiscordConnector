import {
	EmbedBuilder,
	GuildMember,
	Role,
	roleMention,
	SlashCommandSubcommandGroupBuilder,
	User,
	userMention,
	type ChatInputCommandInteraction,
	type AutocompleteInteraction,
	time,
} from "discord.js";
import {
	getRawTicketTypeById,
	createRawUserTicket,
	getRawUserTicket,
	deleteRawUserTicket,
	updateRawUserTicket,
	getAllRawTicketTypes,
} from "../../lib/db";
import { sendPaginationMessage } from "../../lib/pagination";
import {
	getUserTicketsByUserId,
	type Ticket,
	TicketEffectTypeNames,
} from "../../lib/ticket";
import {
	comparePermission,
	readPermission,
	PermissionFlags,
} from "../../lib/permission";
import { spendCredit } from "../../lib/credit";
import { settings } from "../../lib/settings";
import { parseTimeString, formatTimeDuration } from "../../lib/utils";
import type { UserTicketUpdateInput } from "../../generated/prisma/models";

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
					content: `You do not have enough credits to check tickets for other users!`,
				});
			}

			await sendPaginationMessage({
				interaction,
				getResult: async () => {
					const tickets = await getUserTicketsByUserId(
						user.id,
						undefined,
						false,
					);
					return tickets ?? [];
				},
				formatter: (ticket: Ticket) => {
					const useCount = ticket.histories?.length ?? 0;
					const exceedMaxUseCount =
						ticket.maxUse !== null && ticket.maxUse > 0
							? useCount < ticket.maxUse
							: true;
					const maxUseText = ticket.maxUse !== null && ticket.maxUse > 0
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
							? `Expired at ${time(expireDate)}`
							: `Expires at ${time(expireDate)}`;
					}

					return {
						name: `${ticket.name} (${ticket.ticketTypeId})`,
						value: `ID: \`${ticket.ticketId}\`\nEffect: ${
							TicketEffectTypeNames[ticket.effect.effect] ??
							"Unknown effect"
						} (${ticket.effect.value})\n${
							ticket.description || "No description"
						}\nAvailability: ${
							isExpired || exceedMaxUseCount
								? "❌ Not usable"
								: "✅ Usable"
						}${maxUseText}\n${expireText}`,
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
			});
			return;
		}
		case "add": {
			const users = interaction.options.getMentionable("user", true);
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

			const addTicketToUser = async (userId: string) => {
				for (let i = 0; i < quantity; i++) {
					await createRawUserTicket({
						data: {
							userId,
							ticketId: ticketType.id,
							maxUse,
							expiresAt,
							reason: `Added by ${interaction.user.username}`,
						},
					});
				}
			};

			if (users instanceof User || users instanceof GuildMember) {
				await addTicketToUser(users.id);
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
					await addTicketToUser(member.user.id);
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

			const removeTicketFromUser = async (userId: string) => {
				const ticket = await getRawUserTicket({
					where: { id: ticketId, userId },
				});

				if (!ticket) {
					return false;
				}

				try {
					await deleteRawUserTicket({
						where: { id: ticketId },
					});
					return true;
				} catch (error) {
					console.error("Error deleting ticket:", error);
					return false;
				}
			};

			if (users instanceof User || users instanceof GuildMember) {
				const removed = await removeTicketFromUser(users.id);
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
					const removed = await removeTicketFromUser(member.user.id);
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

			// Check if ticket exists
			const existingTicket = await getRawUserTicket({
				where: { id: ticketId },
			});

			if (!existingTicket) {
				return await interaction.editReply({
					content: `Ticket \`${ticketId}\` not found.`,
				});
			}

			// Parse expire input
			let newExpiresAt: Date | null = existingTicket.expiresAt;
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

			// Prepare update data
			const updateData: UserTicketUpdateInput = {};
			if (newMaxUse !== null) {
				updateData.maxUse = newMaxUse;
			}
			if (expireInput) {
				updateData.expiresAt = newExpiresAt;
			}
			if (newReason !== null) {
				updateData.reason = newReason.length > 0 ? newReason : null;
			}

			// Check if there's anything to update
			if (Object.keys(updateData).length === 0) {
				return await interaction.editReply({
					content:
						"No updates specified. Please provide at least one field to update.",
				});
			}

			try {
				await updateRawUserTicket({
					where: { id: ticketId },
					data: updateData,
				});

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

				const embed = new EmbedBuilder()
					.setTitle("Ticket Updated")
					.setColor("Orange")
					.addFields(
						{
							name: "Ticket ID",
							value: ticketId,
							inline: true,
						},
						{
							name: "Updates",
							value: updates.join("\n"),
							inline: false,
						},
					);

				return await interaction.editReply({
					embeds: [embed],
				});
			} catch (error) {
				console.error("Error updating ticket:", error);
				return await interaction.editReply({
					content: `Failed to update ticket: ${error}`,
				});
			}
		}
	}
	return await interaction.editReply({
		content: "Unknown subcommand",
	});
}
