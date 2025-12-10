import {
	EmbedBuilder,
	GuildMember,
	MessageFlags,
	Role,
	roleMention,
	SlashCommandBuilder,
	User,
	userMention,
} from "discord.js";
import type { CommandFile } from "../lib/commandFile";
import {
	createRawTicketType,
	createRawUserTicket,
	deleteRawTicketTypeById,
	deleteRawUserTicket,
	getAllRawTicketTypes,
	getRawTicketTypeById,
	getRawUserTicket,
} from "../lib/db";
import { PermissionFlags } from "../lib/permission";
import {
	getUserTicketsByUserId,
	TicketEffectType,
	TicketEffectTypeNames,
} from "../lib/ticket";

export default {
	command: new SlashCommandBuilder()
		.setName("ticket")
		.setDescription("Manage tickets and ticket types")
		.addSubcommandGroup((group) =>
			group
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
				),
		)
		.addSubcommandGroup((group) =>
			group
				.setName("type")
				.setDescription("Manage ticket types")
				.addSubcommand((subcommand) =>
					subcommand
						.setName("list")
						.setDescription("List all ticket types"),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName("create")
						.setDescription("Create a new ticket type")
						.addStringOption((option) =>
							option
								.setName("id")
								.setDescription("ID of the ticket type")
								.setRequired(true),
						)
						.addStringOption((option) =>
							option
								.setName("effect")
								.setDescription("Effect type of the ticket")
								.setRequired(true)
								.addChoices(
									Object.entries(TicketEffectTypeNames).map(
										([value, name]) => ({
											name,
											value,
										}),
									),
								),
						)
						.addNumberOption((option) =>
							option
								.setName("value")
								.setDescription("Value of the ticket effect")
								.setRequired(true),
						)
						.addStringOption((option) =>
							option
								.setName("name")
								.setDescription("Name of the ticket type")
								.setRequired(true),
						)
						.addStringOption((option) =>
							option
								.setName("description")
								.setDescription(
									"Description of the ticket type",
								)
								.setRequired(false),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName("delete")
						.setDescription("Delete a ticket type")
						.addStringOption((option) =>
							option
								.setName("tickettypeid")
								.setDescription(
									"ID of the ticket type to delete",
								)
								.setRequired(true)
								.setAutocomplete(true),
						),
				),
		),

	async execute({ interaction, serverManager, client }) {
		const group = interaction.options.getSubcommandGroup(true);
		const subcommand = interaction.options.getSubcommand(true);

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		switch (group) {
			case "ticket": {
				switch (subcommand) {
					case "list": {
						const user =
							interaction.options.getUser("user") ??
							interaction.user;
						const allTickets = await getUserTicketsByUserId(
							user.id,
							undefined,
							false,
						);

						if (!allTickets || allTickets.length === 0) {
							return await interaction.editReply({
								content: `${user.id === interaction.user.id ? "You have" : `${userMention(user.id)} has`} no tickets.`,
							});
						}

						const embed = new EmbedBuilder()
							.setTitle(`Tickets for ${user.username}`)
							.setColor("Blue")
							.setTimestamp();

						for (const ticket of allTickets) {
							const useCount = ticket.histories?.length ?? 0;
							const maxUseText = ticket.maxUse
								? ` (${useCount}/${ticket.maxUse} uses)`
								: ` (${useCount} uses)`;

							embed.addFields({
								name: `${ticket.name} (${ticket.ticketTypeId})`,
								value: `ID: \`${ticket.ticketId}\`\nEffect: ${TicketEffectTypeNames[ticket.effect.effect]} (${ticket.effect.value})\n${ticket.description || "No description"}${maxUseText}`,
								inline: true,
							});
						}

						return await interaction.editReply({ embeds: [embed] });
					}
					case "add": {
						const users = interaction.options.getMentionable(
							"user",
							true,
						);
						const ticketTypeId = interaction.options.getString(
							"tickettype",
							true,
						);
						const quantity = interaction.options.getInteger(
							"quantity",
							true,
						);
						const maxUse = interaction.options.getInteger("maxuse");

						// Check if ticket type exists
						const ticketType =
							await getRawTicketTypeById(ticketTypeId);
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
										reason: `Added by ${interaction.user.username}`,
									},
								});
							}
						};

						if (
							users instanceof User ||
							users instanceof GuildMember
						) {
							await addTicketToUser(users.id);
							return await interaction.editReply({
								content: `Added ${quantity} \`${ticketType.name}\` ticket(s) to ${userMention(users.id)}.`,
							});
						}

						if (users instanceof Role) {
							let userCount = 0;
							for (const [_, member] of users.members) {
								await addTicketToUser(member.user.id);
								userCount++;
							}
							return await interaction.editReply({
								content: `Added ${quantity} \`${ticketType.name}\` ticket(s) to ${userCount} users in role ${roleMention(users.id)}.`,
							});
						}

						return await interaction.editReply({
							content: "Invalid user/role specified.",
						});
					}
					case "remove": {
						const users = interaction.options.getMentionable(
							"user",
							true,
						);
						const ticketId = interaction.options.getString(
							"ticketid",
							true,
						);

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

						if (
							users instanceof User ||
							users instanceof GuildMember
						) {
							const removed = await removeTicketFromUser(
								users.id,
							);
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
								const removed = await removeTicketFromUser(
									member.user.id,
								);
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
				}
				return await interaction.editReply({
					content: "Unknown subcommand",
				});
			}
			case "type": {
				switch (subcommand) {
					case "list": {
						try {
							const allTicketTypes = await getAllRawTicketTypes();

							if (allTicketTypes.length === 0) {
								return await interaction.editReply({
									content: "No ticket types found.",
								});
							}

							const embed = new EmbedBuilder()
								.setTitle("All Ticket Types")
								.setColor("Blue")
								.setTimestamp();

							for (const ticketType of allTicketTypes) {
								embed.addFields({
									name: `${ticketType.name} (${ticketType.id})`,
									value: `Effect: ${TicketEffectTypeNames[ticketType.effect as TicketEffectType]} (${ticketType.value})\n${ticketType.description || "No description"}`,
									inline: true,
								});
							}

							return await interaction.editReply({
								embeds: [embed],
							});
						} catch (error) {
							return await interaction.editReply({
								content: `Failed to fetch ticket types: ${error}`,
							});
						}
					}
					case "create": {
						const id = interaction.options.getString("id", true);
						const effect = interaction.options.getString(
							"effect",
							true,
						) as TicketEffectType;
						const value = interaction.options.getNumber(
							"value",
							true,
						);
						const name = interaction.options.getString(
							"name",
							true,
						);
						const description =
							interaction.options.getString("description");

						// Check if ticket type already exists
						const existingTicketType =
							await getRawTicketTypeById(id);
						if (existingTicketType) {
							return await interaction.editReply({
								content: `Ticket type with ID \`${id}\` already exists.`,
							});
						}

						try {
							const newTicketType = await createRawTicketType({
								data: {
									id,
									name,
									description,
									effect,
									value,
								},
							});

							const embed = new EmbedBuilder()
								.setTitle("Ticket Type Created")
								.setColor("Green")
								.addFields(
									{
										name: "ID",
										value: newTicketType.id,
										inline: true,
									},
									{
										name: "Name",
										value: newTicketType.name,
										inline: true,
									},
									{
										name: "Effect",
										value: `${TicketEffectTypeNames[effect]} (${value})`,
										inline: true,
									},
								);

							if (description) {
								embed.addFields({
									name: "Description",
									value: description,
								});
							}

							return await interaction.editReply({
								embeds: [embed],
							});
						} catch (error) {
							return await interaction.editReply({
								content: `Failed to create ticket type: ${error}`,
							});
						}
					}
					case "delete": {
						const ticketTypeId = interaction.options.getString(
							"tickettypeid",
							true,
						);

						// Check if ticket type exists
						const ticketType =
							await getRawTicketTypeById(ticketTypeId);
						if (!ticketType) {
							return await interaction.editReply({
								content: `Ticket type \`${ticketTypeId}\` not found.`,
							});
						}

						try {
							await deleteRawTicketTypeById(ticketTypeId);
							return await interaction.editReply({
								content: `Deleted ticket type \`${ticketType.name}\` (\`${ticketTypeId}\`).`,
							});
						} catch (error) {
							return await interaction.editReply({
								content: `Failed to delete ticket type: ${error}`,
							});
						}
					}
				}
				return await interaction.editReply({
					content: "Unknown subcommand",
				});
			}
			default:
				await interaction.editReply({
					content: "Unknown subcommand group",
				});
				return;
		}
	},
	requireServer: false,
	features: {
		suspendable: false,
	},
	permissions: PermissionFlags.editTicket,
} satisfies CommandFile<false>;
