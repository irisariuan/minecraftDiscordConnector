import {
	ChatInputCommandInteraction,
	MessageComponentInteraction,
} from "discord.js";
import type { Server } from "../../../lib/server";
import { trimTextWithSuffix } from "../../../lib/utils";
import { downloadPluginFile, type ResolvedDependency } from "../lib";
import { sendSelectableActionMessage } from "../selectable";

export interface OfferDependencyInstallOptions {
	/**
	 * Override the selection panel title.
	 * Receives the count of installable dependencies.
	 * Defaults to: `🔗 N Dependency/Dependencies Found`
	 */
	selectionTitle?: (count: number) => string;
	/**
	 * Override the first line of the selection panel description.
	 * Defaults to: `"Dependencies were found for the installed content."`
	 */
	descriptionHeader?: string;
}

/**
 * Given a list of resolved dependencies, filters to those with a resolvable
 * version and presents an interactive selectable UI for the user to choose
 * which ones to install. No-ops silently if there are no installable deps.
 */
export async function offerDependencyInstall(
	interaction: MessageComponentInteraction | ChatInputCommandInteraction,
	server: Server,
	deps: ResolvedDependency[],
	options?: OfferDependencyInstallOptions,
): Promise<void> {
	const installableDeps = deps.filter((d) => d.versionId !== null);
	if (installableDeps.length === 0) return;

	const n = installableDeps.length;
	const title =
		options?.selectionTitle?.(n) ??
		`🔗 ${n} Dependenc${n === 1 ? "y" : "ies"} Found`;
	const descriptionHeader =
		options?.descriptionHeader ??
		"Dependencies were found for the installed content.";

	type DepAction = "install" | "skip";
	await sendSelectableActionMessage<ResolvedDependency, DepAction>({
		interaction,
		items: installableDeps,
		getItemId: (d) => d.projectId,
		actions: {
			install: { icon: "⬇️", label: "Install", isActive: true },
			skip: { icon: "⏭️", label: "Skip", isActive: false },
		},
		initialAction: (d) =>
			d.dependencyType === "required" ? "install" : "skip",
		cycleAction: (_d, current) =>
			current === "install" ? "skip" : "install",
		selectionTitle: title,
		selectionDescription: (counts) =>
			[
				descriptionHeader,
				"",
				`⬇️ Install: **${counts.install}** · ⏭️ Skip: **${counts.skip}**`,
			].join("\n"),
		formatField: (d, action) => ({
			name: `${action === "install" ? "⬇️" : "⏭️"} ${d.projectName}`,
			value: [
				d.versionNumber
					? `Version: \`${d.versionNumber}\``
					: "Version: *unknown*",
				`Type: **${d.dependencyType}**`,
				`Required by: ${d.requiredBy.join(", ")}`,
			].join("\n"),
		}),
		formatOption: (d, action) => ({
			label: `${action === "install" ? "⬇️" : "⏭️"} ${trimTextWithSuffix(d.projectName, 80)}`,
			description: trimTextWithSuffix(
				`${d.dependencyType} · ${d.versionNumber ?? "unknown version"}`,
				100,
			),
		}),
		applyLabel: (counts) =>
			counts.install > 0 ? `Install (${counts.install})` : "Nothing to Install",
		process: async (d) => {
			if (d.versionId === null) {
				console.warn(
					`No compatible version found for dependency ${d.projectId}, skipping.`,
				);
				return false;
			}
			const { newDownload } = await downloadPluginFile(server, d.versionId);
			return newDownload;
		},
		formatProgressValue: (d) =>
			`⬇️ Installing \`${d.versionNumber ?? d.projectId}\``,
		formatResultEntry: (d) =>
			`**${d.projectName}** ${d.versionNumber ? `\`${d.versionNumber}\`` : ""}`,
		resultFooter: (succeeded) =>
			(succeeded.get("install")?.length ?? 0) > 0
				? "🔄 Restart the server for changes to take effect."
				: null,
		progressTitle: "⬇️ Installing Dependencies",
	});
}
