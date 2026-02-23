import {
	ActionRowBuilder,
	ComponentType,
	MessageComponentInteraction,
	MessageFlags,
	StringSelectMenuInteraction,
	type ChatInputCommandInteraction,
	type ColorResolvable,
	type MessageActionRowComponentBuilder,
} from "discord.js";
import { CacheItem } from "./cache";
import {
	createButtons,
	createEmbed,
	createFilterModal,
	createPageModal,
	createSelectMenu,
	ModalAction,
	PageAction,
	type SelectMenuOption,
} from "./component/pagination";
import { clamp, resolve, type Resolvable, type ResolvableSync } from "./utils";

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
	title?: ResolvableSync<string>;
	mainColor?: ColorResolvable;
	unfixablePageNumber?: boolean;
	selectMenuPlaceholder?: string;
}

interface SendPaginationMessageProps<
	ResultType,
> extends BasePaginationProps<ResultType> {
	getResult: (props: {
		pageNumber: number;
		filter?: string;
		force?: boolean;
	}) => Promise<ResultType[] | undefined> | ResultType[] | undefined;
	/**
	 * @returns {boolean} Whether we should stop to listen to the select menu
	 */
	onItemSelected?: (
		interaction: StringSelectMenuInteraction,
		currentResult: CacheItem<ResultType[]>,
		refreshDisplay: () => Promise<void>,
	) => Promise<boolean> | boolean;
	/**
	 * @returns {boolean} Whether we should stop to listen to the component rows
	 */
	onComponentRowsReacted?: (
		interaction: MessageComponentInteraction,
		currentResult: CacheItem<ResultType[]>,
		refreshDisplay: () => Promise<void>,
	) => Promise<boolean> | boolean;
}

export interface CreateSelectMenuOptions {
	minSelect?: Resolvable<number, SelectMenuOption[]>;
	maxSelect?: Resolvable<number, SelectMenuOption[]>;
	placeholder?: string;
	showSelectMenu?: Resolvable<boolean>;
}

interface BasePaginationProps<T> {
	interaction: ChatInputCommandInteraction | MessageComponentInteraction;
	filterFunc?: (filter?: string) => (v: T) => boolean;
	selectMenuOptions?: CreateSelectMenuOptions;
	selectMenuTransform?: (v: T, index: number) => SelectMenuOption;
	customComponentRows?: Resolvable<
		ActionRowBuilder<MessageActionRowComponentBuilder>[]
	>;
	interactionFilter?: (interaction: MessageComponentInteraction) => boolean;
	formatter: (v: T, i: number) => { name: string; value: string };
	options?: PaginationOptions;
}

interface EditInteractionProps<T> extends BasePaginationProps<T> {
	result: CacheItem<T[]>;
	page: number;
	showSelectMenu: boolean;
}

export async function sendPaginationMessage<ResultType>(
	props: SendPaginationMessageProps<ResultType>,
) {
	const {
		getResult,
		interaction,
		options,
		filterFunc,
		onItemSelected,
		interactionFilter,
		onComponentRowsReacted,
		selectMenuOptions,
	} = props;
	let page = 0;
	const result = new CacheItem<ResultType[]>(null, {
		updateMethod: async () =>
			(filterFunc
				? (
						await getResult({
							pageNumber: page,
							filter: options?.filter,
							force: true,
						})
					)?.filter(filterFunc(options?.filter))
				: await getResult({
						pageNumber: page,
						filter: options?.filter,
						force: true,
					})) ?? [],
		interval: 1000 * 60 * 5,
		ttl: 1000 * 60 * 3,
	});
	let showSelectMenu =
		(await resolve(selectMenuOptions?.showSelectMenu)) ?? false;

	// Helper function to refresh the display
	const refreshDisplay = async (newPage = 0) => {
		page = newPage;
		await result.update();
		await editInteraction({
			...props,
			result,
			page,
			showSelectMenu,
		});
	};

	const interactionResponse = await editInteraction({
		...props,
		result,
		page,
		showSelectMenu,
	});

	const paginationCollector = interactionResponse
		.createMessageComponentCollector({
			componentType: ComponentType.Button,
			filter: interactionFilter,
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
					) ?? page + 1) - 1;
				if (oldPage === page) return;
				const maxPage = calculateMaxPage(
					(await result.getData())?.length ?? 0,
				);
				return editInteraction({
					...props,
					result,
					page: clamp(page, 0, maxPage),
					showSelectMenu,
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
									await getResult({
										pageNumber: page,
										filter: options?.filter,
										force: true,
									})
								)?.filter(filterFunc(filter))
							: await getResult({
									pageNumber: page,
									filter: options?.filter,
									force: true,
								})) ?? [],
				);
				await result.update();
				const maxPage = calculateMaxPage(
					(await result.getData())?.length ?? 0,
				);
				page = getPage({
					page,
					maxPage,
					pageAction: PageAction.SET_FILTER,
				});
				return editInteraction({
					...props,
					result,
					page: clamp(page, 0, maxPage),
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
					content: options?.notFoundMessage ?? "No results",
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
				...props,
				result,
				page,
				showSelectMenu,
			});
		});

	const collector = interactionResponse.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		filter: interactionFilter,
	});

	collector.on("collect", async (item) => {
		if (await onItemSelected?.(item, result, refreshDisplay)) {
			collector.stop();
			showSelectMenu = false;
		}
	});

	const customCollector =
		interactionResponse.createMessageComponentCollector();
	customCollector.on("collect", async (reaction) => {
		if (await onComponentRowsReacted?.(reaction, result, refreshDisplay)) {
			customCollector.stop();
		}
	});
	return paginationCollector;
}

async function editInteraction<T>(props: EditInteractionProps<T>) {
	const {
		result,
		interaction,
		page,
		options,
		filterFunc,
		formatter,
		selectMenuTransform,
		showSelectMenu,
		customComponentRows,
		selectMenuOptions,
	} = props;
	const data = await result.getData();
	if (!interaction.deferred && !interaction.replied) {
		console.warn(
			"Interaction is not deferred or replied when editing pagination message. Deferring now.",
		);
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	}

	if (!data || data.length <= 0) {
		return await interaction.editReply({
			content: options?.notFoundMessage ?? "No results",
			embeds: [],
			components: [
				...createButtons({
					page: 0,
					contentLength: 0,
					unfixablePageNumber: options?.unfixablePageNumber,
					haveFilter: !!filterFunc,
				}),
				...((await resolve(customComponentRows)) ?? []),
			],
		});
	}
	const filteredResult = filterFunc
		? data.filter(filterFunc(options?.filter))
		: data;
	const embed = createEmbed({
		result: filteredResult,
		page,
		options: {
			...options,
			title: await resolve(options?.title),
		},
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
			? await createSelectMenu(
					filteredResult.map((item, index) =>
						selectMenuTransform(item, page * pageSize + index),
					),
					page,
					selectMenuOptions,
				)
			: [];
	return await interaction.editReply({
		embeds: [embed],
		components: [
			...buttonRow,
			...selectMenuRow,
			...((await resolve(customComponentRows)) ?? []),
		],
		content: `Page ${page + 1}/${maxPage + 1}`.trim(),
	});
}
