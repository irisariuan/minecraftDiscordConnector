import {
	SlashCommandSubcommandGroupBuilder,
	type ChatInputCommandInteraction,
	type AutocompleteInteraction,
} from "discord.js";
import {
	getAllRawTicketTypes,
	getRawTicketTypeById,
	createRawTicketType,
	updateRawTicketType,
	deleteRawTicketTypeById,
} from "../../lib/db";
import { sendPaginationMessage } from "../../lib/pagination";
import {
	TicketEffectTypeNames,
	type DbTicketType,
	type TicketEffectType,
} from "../../lib/ticket";
import {
	comparePermission,
	PermissionFlags,
	readPermission,
} from "../../lib/permission";
import type { TicketUpdateInput } from "../../generated/prisma/models";
import {
	createTicketTypeUpdateEmbed,
	createTicketUpdateEmbed,
} from "../../lib/embed/ticket";

export function initTicketTypeGroup(group: SlashCommandSubcommandGroupBuilder) {
	return group
		.setName("type")
		.setDescription("Manage ticket types")
		.addSubcommand((subcommand) =>
			subcommand.setName("list").setDescription("List all ticket types"),
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
						.setAutocomplete(true),
				)
				.addNumberOption((option) =>
					option
						.setName("value")
						.setDescription("Value of the ticket effect, always fill in a value unless specified"),
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
						.setDescription("Description of the ticket type")
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("update")
				.setDescription("Update a ticket type")
				.addStringOption((option) =>
					option
						.setName("tickettypeid")
						.setDescription("ID of the ticket type to update")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addStringOption((option) =>
					option
						.setName("name")
						.setDescription("New name for the ticket type")
						.setRequired(false),
				)
				.addStringOption((option) =>
					option
						.setName("description")
						.setDescription(
							"New description for the ticket type (empty to clear)",
						)
						.setRequired(false),
				)
				.addStringOption((option) =>
					option
						.setName("effect")
						.setDescription("New effect type for the ticket")
						.setRequired(false)
						.setAutocomplete(true),
				)
				.addNumberOption((option) =>
					option
						.setName("value")
						.setDescription("New value for the ticket effect")
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
						.setDescription("ID of the ticket type to delete")
						.setRequired(true)
						.setAutocomplete(true),
				),
		);
}

export async function handleTicketTypeAutocomplete(
	interaction: AutocompleteInteraction,
) {
	const focusedOption = interaction.options.getFocused(true);

	if (focusedOption.name === "tickettypeid") {
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
			console.error("Error in ticket type autocomplete:", error);
			await interaction.respond([]);
			return;
		}
	}

	if (focusedOption.name === "effect") {
		try {
			const effectTypes = Object.entries(TicketEffectTypeNames);
			const filtered = effectTypes
				.filter(
					([value, name]) =>
						name
							.toLowerCase()
							.includes(focusedOption.value.toLowerCase()) ||
						value
							.toLowerCase()
							.includes(focusedOption.value.toLowerCase()),
				)
				.slice(0, 25); // Discord limit

			const choices = filtered.map(([value, name]) => ({
				name,
				value,
			}));

			await interaction.respond(choices);
			return;
		} catch (error) {
			console.error("Error in effect autocomplete:", error);
			await interaction.respond([]);
			return;
		}
	}

	await interaction.respond([]);
}

export async function ticketTypeHandler(
	interaction: ChatInputCommandInteraction,
) {
	if (
		!comparePermission(
			await readPermission(interaction.user),
			PermissionFlags.editTicket,
		)
	) {
		return await interaction.editReply({
			content: "You do not have permission to manage ticket types.",
		});
	}

	const subcommand = interaction.options.getSubcommand(true);

	switch (subcommand) {
		case "list": {
			await sendPaginationMessage({
				interaction,
				getResult: async () => {
					try {
						return await getAllRawTicketTypes();
					} catch (error) {
						console.error("Failed to fetch ticket types:", error);
						return [];
					}
				},
				formatter: (ticketType: DbTicketType) => ({
					name: `${ticketType.name} (${ticketType.id})`,
					value: `Effect: ${TicketEffectTypeNames[ticketType.effect as TicketEffectType] ?? "Unknown effect"} (${ticketType.value})\n${ticketType.description || "No description"}`,
				}),
				filterFunc: (filter?: string) => (ticketType: DbTicketType) => {
					if (!filter) return true;
					const searchText = filter.toLowerCase();
					return (
						ticketType.name.toLowerCase().includes(searchText) ||
						ticketType.id.toLowerCase().includes(searchText) ||
						(ticketType.description
							?.toLowerCase()
							.includes(searchText) ??
							false)
					);
				},
				options: {
					title: "All Ticket Types",
					mainColor: "Blue",
					notFoundMessage: "No ticket types found.",
				},
				interactionFilter: (i) => i.user.id === interaction.user.id,
			});
			return;
		}
		case "create": {
			const id = interaction.options.getString("id", true);
			const effect = interaction.options.getString(
				"effect",
				true,
			) as TicketEffectType;
			const value = interaction.options.getNumber("value");
			const name = interaction.options.getString("name", true);
			const description = interaction.options.getString("description");

			// Check if ticket type already exists
			const existingTicketType = await getRawTicketTypeById(id);
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

				return await interaction.editReply({
					embeds: [createTicketTypeUpdateEmbed(newTicketType)],
				});
			} catch (error) {
				return await interaction.editReply({
					content: `Failed to create ticket type: ${error}`,
				});
			}
		}
		case "update": {
			const ticketTypeId = interaction.options.getString(
				"tickettypeid",
				true,
			);
			const newName = interaction.options.getString("name");
			const newDescription = interaction.options.getString("description");
			const newEffect = interaction.options.getString(
				"effect",
			) as TicketEffectType | null;
			const newValue = interaction.options.getNumber("value");

			// Check if ticket type exists
			const existingTicketType = await getRawTicketTypeById(ticketTypeId);
			if (!existingTicketType) {
				return await interaction.editReply({
					content: `Ticket type \`${ticketTypeId}\` not found.`,
				});
			}

			// Prepare update data
			const updateData: TicketUpdateInput = {};
			if (newName !== null) {
				updateData.name = newName;
			}
			if (newDescription !== null) {
				updateData.description =
					newDescription.length > 0 ? newDescription : null;
			}
			if (newEffect !== null) {
				updateData.effect = newEffect;
			}
			if (newValue !== null) {
				updateData.value = newValue;
			}

			// Check if there's anything to update
			if (Object.keys(updateData).length === 0) {
				return await interaction.editReply({
					content:
						"No updates specified. Please provide at least one field to update.",
				});
			}

			try {
				await updateRawTicketType({
					where: { id: ticketTypeId },
					data: updateData,
				});

				// Build update summary
				const updates: string[] = [];
				if (newName !== null) {
					updates.push(`Name: ${newName}`);
				}
				if (newDescription !== null) {
					updates.push(
						`Description: ${newDescription || "No description"}`,
					);
				}
				if (newEffect !== null) {
					updates.push(
						`Effect: ${TicketEffectTypeNames[newEffect] ?? "Unknown effect"}`,
					);
				}
				if (newValue !== null) {
					updates.push(`Value: ${newValue}`);
				}

				return await interaction.editReply({
					embeds: [
						createTicketUpdateEmbed(
							"Ticket Type Updated",
							ticketTypeId,
							updates,
						),
					],
				});
			} catch (error) {
				console.error("Error updating ticket type:", error);
				return await interaction.editReply({
					content: `Failed to update ticket type: ${error}`,
				});
			}
		}
		case "delete": {
			const ticketTypeId = interaction.options.getString(
				"tickettypeid",
				true,
			);

			// Check if ticket type exists
			const ticketType = await getRawTicketTypeById(ticketTypeId);
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
