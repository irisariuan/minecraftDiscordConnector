import {
	ComponentType,
	MessageComponentInteraction,
	StringSelectMenuInteraction,
	type ChatInputCommandInteraction,
	type ColorResolvable,
} from "discord.js";
import { CacheItem } from "./cache";
import { clamp } from "./utils";
import {
	createEmbed,
	PageAction,
	createPageModal,
	ModalAction,
	createFilterModal,
	createButtons,
	type SelectMenuOption,
	createSelectMenu,
} from "./embed";

interface GetPageProps {
	page: number;
	maxPage: number;
	pageAction: PageAction;
}

export function getPage({ page, maxPage, pageAction }: GetPageProps) {
	let target: number;
	switch (pageAction) {
		case PageAction.PREVIOUS:
			target = page - 1;
			break;
		case PageAction.NEXT:
			target = page + 1;
			break;
		case PageAction.FIRST:
			target = 0;
			break;
		case PageAction.LAST:
			target = maxPage;
			break;
		default:
			// If new enum members are added later, we intentionally fall back to current page.
			target = page;
	}
	return clamp(target, 0, maxPage);
}

export function calculateMaxPage(resultLength: number) {
	return Math.ceil(resultLength / pageSize) - 1;
}

export const pageSize = 20;

export interface PaginationOptions {
	filter?: string;
	notFoundMessage?: string;
	title?: string;
	mainColor?: ColorResolvable;
	unfixablePageNumber?: boolean;
	selectMenuPlaceholder?: string;
}

interface SendPaginationMessageProps<T> extends BasePaginationProps<T> {
	getResult: (
		pageNumber: number,
		filter?: string,
		force?: boolean,
	) => Promise<T[] | undefined> | T[] | undefined;
	/**
	 * @returns {boolean} If we should continue to listen to the select menu
	 */
	onItemSelected?: (
		interaction: StringSelectMenuInteraction,
		currentResult: CacheItem<T[]>,
	) => Promise<boolean> | boolean;
}

export async function sendPaginationMessage<T>({
	getResult,
	interaction,
	options,
	filterFunc,
	formatter,
	onItemSelected,
	selectMenuTransform,
}: SendPaginationMessageProps<T>) {
	let page = 0;
	const result = new CacheItem<T[]>(null, {
		updateMethod: async () =>
			(filterFunc
				? (await getResult(page, options?.filter, true))?.filter(
						filterFunc(options?.filter),
					)
				: await getResult(page, options?.filter, true)) || [],
		interval: 1000 * 60 * 5,
		ttl: 1000 * 60 * 3,
	});
	let showSelectMenu = selectMenuTransform !== undefined;

	const interactionResponse = await editInteraction({
		result,
		interaction,
		page,
		options,
		filterFunc,
		formatter,
		selectMenuTransform,
		showSelectMenu,
	});

	interactionResponse
		.createMessageComponentCollector({
			componentType: ComponentType.Button,
		})
		.on("collect", async (i) => {
			if (i.customId === PageAction.SET_PAGE && !i.deferred) {
				const modal = createPageModal();
				await i.showModal(modal).catch(() => {});
				const reply = await i.awaitModalSubmit({
					time: 1000 * 60 * 5,
					filter: (i) => i.customId === ModalAction.MODAL_PAGE_ID,
				});
				await reply.deferUpdate();
				const oldPage = page;
				page =
					(Number(
						reply.fields.getTextInputValue(ModalAction.PAGE_INPUT),
					) || page + 1) - 1;
				if (oldPage === page) return;
				const maxPage = calculateMaxPage(
					(await result.getData())?.length || 0,
				);
				return editInteraction({
					result,
					interaction,
					page: clamp(page, 0, maxPage),
					options,
					filterFunc,
					formatter,
					showSelectMenu,
					selectMenuTransform,
				});
			}

			if (i.customId === PageAction.SET_FILTER && !i.deferred) {
				const modal = createFilterModal();
				await i.showModal(modal).catch(() => {});
				const reply = await i.awaitModalSubmit({
					time: 1000 * 60 * 5,
					filter: (i) => i.customId === ModalAction.MODAL_FILTER_ID,
				});
				await reply.deferUpdate();
				const filter = reply.fields.getTextInputValue(
					ModalAction.FILTER_INPUT,
				);
				result.setUpdateMethod(
					async () =>
						(filterFunc
							? (
									await getResult(page, options?.filter, true)
								)?.filter(filterFunc(filter))
							: await getResult(page, options?.filter, true)) ||
						[],
				);
				await result.update();
				const maxPage = calculateMaxPage(
					(await result.getData())?.length || 0,
				);
				page = getPage({
					page,
					maxPage,
					pageAction: PageAction.SET_FILTER,
				});
				return editInteraction({
					result,
					interaction,
					page: clamp(page, 0, maxPage),
					options,
					filterFunc,
					formatter,
					selectMenuTransform,
					showSelectMenu,
				});
			}

			i.deferUpdate();
			if (i.customId === PageAction.REFRESH) {
				await result.update();
			}
			const data = await result.getData();
			if (!data || data.length <= 0)
				return interaction.editReply({
					content: options?.notFoundMessage || "No results",
					embeds: [],
					components: createButtons({
						page: 0,
						contentLength: 0,
						unfixablePageNumber: options?.unfixablePageNumber,
						haveFilter: !!filterFunc,
					}),
				});

			const maxPage = calculateMaxPage(data.length);
			page = getPage({
				page,
				maxPage,
				pageAction: i.customId as PageAction,
			});
			await editInteraction({
				result,
				interaction,
				page,
				options,
				filterFunc,
				formatter,
				showSelectMenu,
				selectMenuTransform,
			});
		});

	const collector = interactionResponse.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
	});

	collector.on("collect", async (item) => {
		if (await onItemSelected?.(item, result)) {
			collector.stop();
			showSelectMenu = false;
		}
	});
}

interface BasePaginationProps<T> {
	interaction: ChatInputCommandInteraction | MessageComponentInteraction;
	filterFunc?: (filter?: string) => (v: T) => boolean;
	selectMenuTransform?: (v: T) => SelectMenuOption;
	formatter: (v: T, i: number) => { name: string; value: string };
	options?: PaginationOptions;
}

interface EditInteractionProps<T> extends BasePaginationProps<T> {
	result: CacheItem<T[]>;
	page: number;
	showSelectMenu: boolean;
}

async function editInteraction<T>({
	result,
	interaction,
	page,
	options,
	filterFunc,
	formatter,
	selectMenuTransform,
	showSelectMenu,
}: EditInteractionProps<T>) {
	const data = await result.getData();
	if (!data || data.length <= 0) {
		return await interaction.editReply({
			content: options?.notFoundMessage || "No results",
			embeds: [],
			components: createButtons({
				page: 0,
				contentLength: 0,
				unfixablePageNumber: options?.unfixablePageNumber,
				haveFilter: !!filterFunc,
			}),
		});
	}
	const filteredResult = filterFunc
		? data.filter(filterFunc(options?.filter))
		: data;
	const embed = createEmbed({
		result: filteredResult,
		page,
		options,
		formatter,
	});
	const maxPage = calculateMaxPage(filteredResult.length);
	const buttonRow = createButtons({
		page,
		contentLength: filteredResult.length,
		unfixablePageNumber: options?.unfixablePageNumber,
		haveFilter: !!filterFunc,
	});
	const selectMenuRow =
		selectMenuTransform && showSelectMenu && filteredResult.length > 0
			? createSelectMenu(
					filteredResult.map(selectMenuTransform),
					page,
					options?.selectMenuPlaceholder,
				)
			: [];
	return await interaction.editReply({
		embeds: [embed],
		components: [...buttonRow, ...selectMenuRow],
		content: `Page ${page + 1}/${maxPage + 1}`.trim(),
	});
}
