import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ModalActionRowComponentBuilder,
} from "discord.js";
import {
	calculateMaxPage,
	pageSize,
	type PaginationOptions,
} from "../pagination";

interface CreateEmbedProps<T> {
	result: T[];
	page: number;
	formatter: (v: T, i: number) => { name: string; value: string };
	options?: Pick<
		PaginationOptions,
		"title" | "mainColor" | "unfixablePageNumber"
	>;
}

export function createEmbed<T>({
	result,
	page,
	options,
	formatter,
}: CreateEmbedProps<T>) {
	return new EmbedBuilder()
		.setTitle(options?.title || "Logs")
		.setTimestamp(Date.now())
		.setColor(options?.mainColor || "Green")
		.addFields(
			...result
				.map(formatter)
				.slice(page * pageSize, (page + 1) * pageSize),
		)
		.setFooter({
			text: `Showing results ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, result.length)}${options?.unfixablePageNumber ? "" : ` of ${result.length}`}`,
		});
}

export enum SelectAction {
	SELECT_MENU_ID = "selectmenu",
}

export enum PageAction {
	PREVIOUS = "prev",
	NEXT = "next",
	REFRESH = "refresh",
	FIRST = "first",
	LAST = "last",
	SET_PAGE = "setpage",
	SET_FILTER = "setfilter",
}

export enum ModalAction {
	MODAL_PAGE_ID = "setpage",
	PAGE_INPUT = "page",
	MODAL_FILTER_ID = "filterpage",
	FILTER_INPUT = "filterinput",
}

export function createPageModal() {
	const modal = new ModalBuilder()
		.setCustomId(ModalAction.MODAL_PAGE_ID)
		.setTitle("Set Page");
	const pageInput = new TextInputBuilder()
		.setCustomId(ModalAction.PAGE_INPUT)
		.setLabel("Page")
		.setPlaceholder("Enter page number")
		.setRequired(true)
		.setStyle(TextInputStyle.Short);
	const firstRow =
		new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
			pageInput,
		);
	modal.addComponents(firstRow);
	return modal;
}

export function createFilterModal() {
	const modal = new ModalBuilder()
		.setCustomId(ModalAction.MODAL_FILTER_ID)
		.setTitle("Filter");
	const filterInput = new TextInputBuilder()
		.setCustomId(ModalAction.FILTER_INPUT)
		.setLabel("Filter")
		.setPlaceholder("Enter filter keyword")
		.setRequired(false)
		.setStyle(TextInputStyle.Short);
	const firstRow =
		new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
			filterInput,
		);
	modal.addComponents(firstRow);
	return modal;
}

interface CreateButtonsProps {
	page: number;
	contentLength: number;
	maxPage?: number;
	unfixablePageNumber?: boolean;
	haveFilter: boolean;
}
export function createButtons({
	page,
	contentLength,
	maxPage = calculateMaxPage(contentLength),
	unfixablePageNumber = false,
	haveFilter,
}: CreateButtonsProps) {
	const prevBtn = new ButtonBuilder()
		.setCustomId(PageAction.PREVIOUS)
		.setLabel("Previous Page")
		.setStyle(ButtonStyle.Primary);
	const nextBtn = new ButtonBuilder()
		.setCustomId(PageAction.NEXT)
		.setLabel("Next Page")
		.setStyle(ButtonStyle.Primary);
	const refreshBtn = new ButtonBuilder()
		.setCustomId(PageAction.REFRESH)
		.setLabel("Refresh")
		.setStyle(ButtonStyle.Secondary);
	const firstBtn = new ButtonBuilder()
		.setCustomId(PageAction.FIRST)
		.setLabel("First Page")
		.setStyle(ButtonStyle.Secondary);
	const lastBtn = new ButtonBuilder()
		.setCustomId(PageAction.LAST)
		.setLabel("Last Page")
		.setStyle(ButtonStyle.Secondary);
	const pageModalBtn = new ButtonBuilder()
		.setCustomId(PageAction.SET_PAGE)
		.setLabel("Set Page")
		.setStyle(ButtonStyle.Secondary);
	const filterModalBtn = new ButtonBuilder()
		.setCustomId(PageAction.SET_FILTER)
		.setLabel("Set Filter")
		.setStyle(ButtonStyle.Secondary);

	const firstRow = new ActionRowBuilder<ButtonBuilder>();
	const secondRow = new ActionRowBuilder<ButtonBuilder>();

	if (page <= 0 && !unfixablePageNumber) {
		prevBtn.setDisabled(true);
		firstBtn.setDisabled(true);
	}
	if (contentLength - (page + 1) * pageSize <= 0 && !unfixablePageNumber) {
		nextBtn.setDisabled(true);
		lastBtn.setDisabled(true);
	}
	firstRow.addComponents(prevBtn, nextBtn);
	secondRow.addComponents(refreshBtn, pageModalBtn);
	if (haveFilter) {
		secondRow.addComponents(filterModalBtn);
	}
	if (maxPage > 1 && !unfixablePageNumber) {
		secondRow.addComponents(firstBtn, lastBtn);
	}
	return [firstRow, secondRow];
}

export interface SelectMenuOption {
	label: string;
	value: string;
	description?: string;
}

export function createSelectMenu(
	options: SelectMenuOption[],
	page: number,
	placeholder = "Select an option",
) {
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(SelectAction.SELECT_MENU_ID)
		.setPlaceholder(placeholder)
		.addOptions(options.slice(page * pageSize, (page + 1) * pageSize));
	return [
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			selectMenu,
		),
	];
}
