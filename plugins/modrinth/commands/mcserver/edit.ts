import {
	ActionRowBuilder,
	bold,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	inlineCode,
	italic,
	MessageFlags,
	StringSelectMenuBuilder,
	type ChatInputCommandInteraction,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import {
	data,
	runPhasedInput,
	trimTextWithSuffix,
	type ExecuteParams,
	type PhasedPhase,
	type PhasedValues,
} from "../../../api";
import {
	inferModType,
	KNOWN_LOADERS,
	SERVER_PROPERTIES_FILE,
	validateMinecraftConfig,
	writeServerPort,
	type MinecraftConfig,
} from "../../mc";

/** Forwarding schemes a backend can be told to expect. */
const FORWARDING_MODES = ["none", "bungeecord", "velocity"] as const;

/** Placeholder shown for secrets so they never appear in a Discord embed. */
const SECRET_MASK = "••••••••";

/** Everything this command can change: the record's ports plus its config. */
interface ServerEdit {
	ports: number[];
	config: MinecraftConfig;
}

/**
 * Parse a comma-separated port list. Returns null when the list is empty or any
 * entry is not a port number, so a typo never silently drops a port.
 */
function parsePortList(raw: string): number[] | null {
	const parts = raw
		.split(",")
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	if (parts.length === 0) return null;
	const ports = parts.map((p) => parseInt(p, 10));
	if (ports.some((p) => isNaN(p) || p < 1 || p > 65535)) return null;
	return ports;
}

export function editSubcommandBuilder(sub: SlashCommandSubcommandBuilder) {
	return sub
		.setName("edit")
		.setDescription(
			"Edit a registered Minecraft server's ports, paths & proxy settings",
		);
}

/**
 * Best-effort view of a server's stored Minecraft config.
 *
 * A record written by an older version (or edited by hand) may not satisfy the
 * schema. Rather than refusing to help, seed the wizard from whatever strings
 * are present so the operator can repair the record in place.
 */
function readConfig(raw: unknown): {
	config: MinecraftConfig;
	invalidReason: string | null;
} {
	const validated = validateMinecraftConfig(raw);
	if (validated.ok) return { config: validated.config, invalidReason: null };

	const obj = (raw ?? {}) as Record<string, unknown>;
	const str = (key: string): string =>
		typeof obj[key] === "string" ? (obj[key] as string) : "";
	const proxy = (obj.proxy ?? {}) as Record<string, unknown>;
	const forwarding = FORWARDING_MODES.find((m) => m === proxy.forwarding);

	return {
		config: {
			loaderType: str("loaderType"),
			modType: str("modType"),
			minecraftVersion: str("minecraftVersion"),
			pluginDir: str("pluginDir"),
			ipcSocket:
				typeof obj.ipcSocket === "string" ? obj.ipcSocket : null,
			proxy: {
				enabled:
					typeof proxy.enabled === "boolean" ? proxy.enabled : true,
				host:
					typeof proxy.host === "string" && proxy.host.length > 0
						? proxy.host
						: "127.0.0.1",
				forwarding: forwarding ?? "none",
				forwardingSecret:
					typeof proxy.forwardingSecret === "string"
						? proxy.forwardingSecret
						: null,
			},
		},
		invalidReason: validated.error,
	};
}

/**
 * Ask which Minecraft server to edit. Returns the chosen id, or null when the
 * user never picked one (the reply is updated with the reason in that case).
 */
async function pickServer(
	interaction: ChatInputCommandInteraction,
	options: { id: number; tag: string | null }[],
): Promise<number | null> {
	if (options.length === 1) return options[0]!.id;

	const menu = new StringSelectMenuBuilder()
		.setCustomId("mcserver_edit_server")
		.setPlaceholder("Select a server")
		.addOptions(
			// Discord caps a select menu at 25 options.
			options.slice(0, 25).map((o) => ({
				label: trimTextWithSuffix(o.tag ?? `Server #${o.id}`, 100),
				description: `Server #${o.id}`,
				value: String(o.id),
			})),
		);

	const message = await interaction.editReply({
		content: "Select the Minecraft server to edit:",
		components: [
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
		],
	});

	const selection = await message
		.awaitMessageComponent({
			componentType: ComponentType.StringSelect,
			filter: (i) => i.user.id === interaction.user.id,
			time: 1000 * 60 * 5,
		})
		.catch(() => null);

	if (!selection) {
		await interaction.editReply({
			content: "⏱️ Selection timed out.",
			components: [],
		});
		return null;
	}

	await selection.deferUpdate();
	const id = parseInt(selection.values[0] ?? "");
	if (isNaN(id)) {
		await interaction.editReply({
			content: "❌ No server selected.",
			components: [],
		});
		return null;
	}
	return id;
}

/** The wizard steps, pre-filled from the server's current configuration. */
function buildPhases(current: ServerEdit): PhasedPhase[] {
	const config = current.config;

	/** Forwarding scheme after this phase's (optional) pick is applied. */
	const resolveForwarding = (values: PhasedValues) =>
		values.forwarding || config.proxy.forwarding;

	return [
		{
			label: "Paths & Ports",
			description:
				"Where mods/plugins live, which IPC socket the in-JVM connector attaches to, and the port(s) the server listens on.",
			fields: [
				{
					id: "pluginDir",
					label: "Plugin/Mods Directory",
					description: "Absolute path to the plugins/mods folder",
					required: true,
					defaultValue: config.pluginDir,
				},
				{
					id: "ipcSocket",
					label: "IPC Socket Override",
					description:
						"Absolute or server-relative path; blank uses connector.sock",
					required: false,
					defaultValue: config.ipcSocket ?? "",
				},
				{
					id: "port",
					label: "Port(s)",
					description:
						"Comma-separated integers between 1–65535; the proxy dials the first one",
					placeholder: "25565",
					required: true,
					defaultValue: current.ports.join(", "),
				},
			],
			validate: (values) =>
				parsePortList(values.port ?? "")
					? null
					: "Invalid port value(s). Provide comma-separated integers between 1 and 65535.",
		},
		{
			label: "Loader",
			description: [
				`Server software. Leave the menu untouched to keep ${inlineCode(config.loaderType || "unset")}.`,
				"Changing it only updates the record — use `/mcserver upgrade` to swap the actual server JAR.",
			].join("\n"),
			fields: [
				{
					id: "loaderType",
					label: "Server Type",
					type: "select" as const,
					placeholder: `Current: ${config.loaderType || "unset"} — leave to keep`,
					selectOptions: KNOWN_LOADERS.map((l) => ({
						label: l,
						value: l,
						description:
							l === config.loaderType ? "current" : undefined,
					})),
					required: false,
				},
			],
		},
		{
			label: "Proxy",
			description:
				"How the Minecraft proxy reaches this backend. Forwarding other than `none` requires an offline-mode backend that only the proxy can reach.",
			fields: [
				{
					id: "enabled",
					label: "Proxied",
					type: "select" as const,
					placeholder: `Current: ${config.proxy.enabled ? "enabled" : "disabled"} — leave to keep`,
					selectOptions: [
						{
							label: "Enabled",
							value: "true",
							description: "The proxy fronts this server",
						},
						{
							label: "Disabled",
							value: "false",
							description: "Invisible to the proxy",
						},
					],
					required: false,
				},
				{
					id: "forwarding",
					label: "Player-info Forwarding",
					type: "select" as const,
					placeholder: `Current: ${config.proxy.forwarding} — leave to keep`,
					selectOptions: FORWARDING_MODES.map((m) => ({
						label: m,
						value: m,
						description:
							m === config.proxy.forwarding
								? "current"
								: undefined,
					})),
					required: false,
				},
				{
					id: "host",
					label: "Backend Host",
					description: "Address the proxy dials to reach the server",
					required: true,
					defaultValue: config.proxy.host,
				},
				{
					id: "forwardingSecret",
					label: "Velocity Forwarding Secret",
					description:
						"Only used with velocity forwarding; blank clears it",
					required: false,
					defaultValue: config.proxy.forwardingSecret ?? "",
				},
			],
			validate: (values) => {
				if (!values.host?.trim()) return "Backend host cannot be empty.";
				if (
					resolveForwarding(values) === "velocity" &&
					!values.forwardingSecret?.trim()
				) {
					return "Velocity forwarding requires a forwarding secret.";
				}
				return null;
			},
		},
	];
}

/**
 * `field: old → new` lines for every value the edit actually changes.
 *
 * Values are compared raw but rendered through each row's formatter, so the
 * forwarding secret can be masked in the embed without its change going
 * unnoticed.
 */
function diffLines(before: ServerEdit, after: ServerEdit): string[] {
	const show = (value: string | null) =>
		value ? inlineCode(value) : italic("none");
	const mask = (value: string | null) =>
		value ? inlineCode(SECRET_MASK) : italic("none");

	type Row = [
		name: string,
		before: string | null,
		after: string | null,
		render: (value: string | null) => string,
	];

	const rows: Row[] = [
		[
			"Port(s)",
			before.ports.join(", "),
			after.ports.join(", "),
			show,
		],
		[
			"Loader type",
			before.config.loaderType,
			after.config.loaderType,
			show,
		],
		["Mod type", before.config.modType, after.config.modType, show],
		[
			"Plugin/mod dir",
			before.config.pluginDir,
			after.config.pluginDir,
			show,
		],
		["IPC socket", before.config.ipcSocket, after.config.ipcSocket, show],
		[
			"Proxied",
			String(before.config.proxy.enabled),
			String(after.config.proxy.enabled),
			show,
		],
		[
			"Proxy host",
			before.config.proxy.host,
			after.config.proxy.host,
			show,
		],
		[
			"Forwarding",
			before.config.proxy.forwarding,
			after.config.proxy.forwarding,
			show,
		],
		[
			"Forwarding secret",
			before.config.proxy.forwardingSecret,
			after.config.proxy.forwardingSecret,
			mask,
		],
	];

	return rows
		.filter(([, oldValue, newValue]) => oldValue !== newValue)
		.map(
			([name, oldValue, newValue, render]) =>
				`${bold(name)}: ${render(oldValue)} → ${render(newValue)}`,
		);
}

export async function editHandler(
	params: ExecuteParams<ChatInputCommandInteraction>,
) {
	const { interaction, serverManager } = params;
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	// ── Pick the server ─────────────────────────────────────────────────────
	const mcServers = serverManager
		.getAllTagPairs()
		.filter((p) => p.pluginId === "minecraft");

	if (mcServers.length === 0) {
		return interaction.editReply({
			content:
				"❌ No Minecraft servers are registered. Use `/mcserver create` first.",
		});
	}

	const serverId = await pickServer(interaction, mcServers);
	if (serverId === null) return;

	const dbServer = await data.request("db:getServerById", { id: serverId });
	if (!dbServer) {
		return interaction.editReply({
			content: `❌ Server with ID ${inlineCode(String(serverId))} not found.`,
			components: [],
		});
	}

	const serverTag = dbServer.tag ?? `Server #${dbServer.id}`;
	const { config: currentConfig, invalidReason } = readConfig(dbServer.config);
	const current: ServerEdit = {
		ports: dbServer.port,
		config: currentConfig,
	};

	// ── Collect the edits ───────────────────────────────────────────────────
	const phaseValues = await runPhasedInput({
		interaction,
		title: `Edit ${serverTag}`,
		phases: buildPhases(current),
	});
	if (!phaseValues) return; // cancelled or timed out

	const pluginDir = phaseValues[0]!.pluginDir!.trim();
	const ipcSocket = phaseValues[0]!.ipcSocket?.trim() || null;
	// The phase validator already rejected an unparseable list.
	const ports = parsePortList(phaseValues[0]!.port ?? "") ?? current.ports;
	const loaderType = phaseValues[1]!.loaderType || currentConfig.loaderType;
	const enabledPick = phaseValues[2]!.enabled;
	const forwarding = (phaseValues[2]!.forwarding ||
		currentConfig.proxy
			.forwarding) as MinecraftConfig["proxy"]["forwarding"];
	const host = phaseValues[2]!.host?.trim() || currentConfig.proxy.host;
	const forwardingSecret =
		phaseValues[2]!.forwardingSecret?.trim() || null;

	const updated: MinecraftConfig = {
		...currentConfig,
		loaderType,
		// The mod type follows the loader, so keep it in step when that changes.
		modType:
			loaderType === currentConfig.loaderType
				? currentConfig.modType
				: inferModType(loaderType),
		pluginDir,
		ipcSocket,
		proxy: {
			enabled: enabledPick
				? enabledPick === "true"
				: currentConfig.proxy.enabled,
			host,
			forwarding,
			forwardingSecret,
		},
	};

	const validated = validateMinecraftConfig(updated);
	if (!validated.ok) {
		return interaction.editReply({
			content: [
				`❌ The resulting configuration is invalid: ${validated.error}`,
				"Fields this command does not edit — the Minecraft version in particular — are set by `/mcserver create` and `/mcserver upgrade`.",
			].join("\n"),
			embeds: [],
			components: [],
		});
	}

	const edited: ServerEdit = { ports, config: validated.config };
	const changes = diffLines(current, edited);
	const portsChanged =
		current.ports.join(", ") !== ports.join(", ");
	if (changes.length === 0 && !invalidReason) {
		return interaction.editReply({
			content: "ℹ️ Nothing changed — the configuration is unmodified.",
			embeds: [],
			components: [],
		});
	}

	// ── Confirm ─────────────────────────────────────────────────────────────
	const isOnline =
		(await serverManager
			.getServer(serverId)
			?.isOnline.getData(true)
			.catch(() => false)) ?? false;

	// Ports are not unique in the schema, so a clash is only reported — two
	// servers sharing a port simply cannot be online at the same time.
	const clashes = portsChanged
		? (await data.request("db:getAllServers").catch(() => []))
				.filter((other) => other.id !== serverId)
				.flatMap((other) =>
					other.port
						.filter((port) => ports.includes(port))
						.map(
							(port) =>
								`${inlineCode(String(port))} — ${other.tag ?? `Server #${other.id}`}`,
						),
				)
		: [];

	const reviewEmbed = new EmbedBuilder()
		.setTitle(`✏️ Edit ${serverTag}`)
		.setColor(0x3498db)
		.setDescription(
			changes.length > 0
				? changes.join("\n")
				: "No field changes — the stored config will be rewritten in its validated form.",
		)
		.setTimestamp();

	if (invalidReason) {
		reviewEmbed.addFields({
			name: "⚠️ Stored config was invalid",
			value: `${inlineCode(invalidReason)}\nSaving replaces it with the values above.`,
		});
	}

	if (updated.proxy.forwarding !== "none" && updated.proxy.enabled) {
		reviewEmbed.addFields({
			name: "⚠️ Forwarding requires a shielded backend",
			value: "Run the backend in offline mode, bound to loopback or a private interface, and firewall its port so only the proxy can reach it.",
		});
	}

	if (portsChanged) {
		reviewEmbed.addFields({
			name: `ℹ️ ${SERVER_PROPERTIES_FILE} will follow`,
			value: `${inlineCode(`server-port=${ports[0]}`)} is written to the server's ${inlineCode(SERVER_PROPERTIES_FILE)} so the server binds the port this record claims. Nothing else in the file is touched.`,
		});
	}

	if (clashes.length > 0) {
		reviewEmbed.addFields({
			name: "⚠️ Port already claimed by another server",
			value: `${clashes.join("\n")}\nThey will not be able to run at the same time.`,
		});
	}

	if (isOnline) {
		reviewEmbed.setFooter({
			text: portsChanged
				? "Server is online: the proxy dials the new port at once, but the process keeps its old one until restarted — and a running server can rewrite server.properties from memory."
				: "Server is online: proxy settings apply immediately, path changes on the next start.",
		});
	}

	const confirmMsg = await interaction.editReply({
		content: "",
		embeds: [reviewEmbed],
		components: [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId("mcserver_edit_confirm")
					.setLabel("✅ Save")
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId("mcserver_edit_cancel")
					.setLabel("❌ Cancel")
					.setStyle(ButtonStyle.Secondary),
			),
		],
	});

	const buttonResponse = await confirmMsg
		.awaitMessageComponent({
			componentType: ComponentType.Button,
			filter: (i) => i.user.id === interaction.user.id,
			time: 1000 * 60 * 5,
		})
		.catch(() => null);

	if (!buttonResponse) {
		return interaction.editReply({
			content: "⏱️ Edit timed out.",
			embeds: [],
			components: [],
		});
	}

	await buttonResponse.deferUpdate();

	if (buttonResponse.customId === "mcserver_edit_cancel") {
		return interaction.editReply({
			content: "❌ Edit cancelled.",
			embeds: [],
			components: [],
		});
	}

	// ── Persist ─────────────────────────────────────────────────────────────
	let saved;
	try {
		saved = await data.request("db:updateServer", {
			id: serverId,
			// Spread into plain objects so the config satisfies the JSON
			// column's structural type.
			data: {
				port: ports,
				config: {
					...validated.config,
					proxy: { ...validated.config.proxy },
				},
			},
		});
	} catch (err) {
		return interaction.editReply({
			content: `❌ Failed to update the server record: ${String(err)}`,
			embeds: [],
			components: [],
		});
	}

	// Nothing in the launch path passes the port to the JVM — the server binds
	// whatever server.properties says — so the file has to follow the record.
	const portWrite = portsChanged
		? await writeServerPort(saved.path, ports[0]!)
		: null;

	const reload = await serverManager.addOrReloadServer(saved);

	const summaryEmbed = new EmbedBuilder()
		.setTitle("✅ Server Configuration Updated")
		.setColor(0x2ecc71)
		.setDescription(
			changes.length > 0
				? changes.join("\n")
				: `${bold(serverTag)} configuration was rewritten in its validated form.`,
		)
		.addFields(
			{
				name: "Server ID",
				value: inlineCode(String(serverId)),
				inline: true,
			},
			{
				name: "Loader / mod type",
				value: inlineCode(
					`${validated.config.loaderType} · ${validated.config.modType}`,
				),
				inline: true,
			},
			{
				name: "Port(s)",
				value: inlineCode(ports.join(", ")),
				inline: true,
			},
		)
		.setTimestamp();

	if (portWrite) {
		summaryEmbed.addFields(
			portWrite.ok
				? {
						name: SERVER_PROPERTIES_FILE,
						value:
							portWrite.action === "created"
								? `Created with ${inlineCode(`server-port=${ports[0]}`)} — Minecraft fills in the rest on its next start.`
								: portWrite.action === "updated"
									? `Set to ${inlineCode(`server-port=${ports[0]}`)}.`
									: `Already at ${inlineCode(`server-port=${ports[0]}`)}.`,
					}
				: {
						name: `⚠️ Could not update ${SERVER_PROPERTIES_FILE}`,
						value: `${inlineCode(portWrite.error)}\nThe record now says ${inlineCode(ports.join(", "))}, so set ${inlineCode(`server-port=${ports[0]}`)} by hand or the server will keep binding its old port.`,
					},
		);
	}

	if (reload === "partial") {
		summaryEmbed.setFooter({
			text: portsChanged
				? "The server is running: restart it to bind the new port, and re-check server.properties afterwards — a running server can rewrite it from memory."
				: "The server is running: proxy settings are live, but path changes take effect after the next start.",
		});
	}

	return interaction.editReply({
		content: "",
		embeds: [summaryEmbed],
		components: [],
	});
}
