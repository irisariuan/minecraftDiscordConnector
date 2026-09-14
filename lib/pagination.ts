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
	/** Current zero-based page index. */
	page: number;
	/** Maximum valid zero-based page index (inclusive). */
	maxPage: number;
	/** The navigation action requested by the user. */
	pageAction: PageAction;
}

/**
 * Calculates the target page index for a given navigation action.
 *
 * The result is always clamped to `[0, maxPage]`, so callers never need to
 * guard against out-of-range values.
 */
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

/**
 * Returns the zero-based index of the last page for a result set of the given
 * length.  Returns `-1` when `resultLength` is 0 (no pages).
 */
export function calculateMaxPage(resultLength: number) {
	return Math.ceil(resultLength / pageSize) - 1;
}

/** Number of items displayed per page across all paginated views. */
export const pageSize = 20;

/** Display / behaviour options shared by all paginated message helpers. */
export interface PaginationOptions {
	/** Pre-applied filter string passed to `filterFunc` on the initial render. */
	filter?: string;
	/** Message shown in place of the embed when the result set is empty. */
	notFoundMessage?: string;
	/**
	 * Embed title.  Accepts a plain string or a zero-argument function so the
	 * title can be computed lazily (e.g. to embed live counts).
	 */
	title?: ResolvableSync<string>;
	/** Accent colour of the embed. Accepts any value supported by discord.js. */
	mainColor?: ColorResolvable;
	/**
	 * When `true` the "jump to page" button is hidden.
	 * Useful for result sets whose length is unknown in advance.
	 */
	unfixablePageNumber?: boolean;
	/** Placeholder text shown in the select-menu when nothing is selected. */
	selectMenuPlaceholder?: string;
}

/** Full props accepted by {@link sendPaginationMessage}. */
interface SendPaginationMessageProps<
	ResultType,
> extends BasePaginationProps<ResultType> {
	/**
	 * Fetches (or returns from cache) the full result array.
	 *
	 * @param props.pageNumber - Current page index (informational; most
	 *   implementations ignore it and return the full array).
	 * @param props.filter     - Active filter string, if any.
	 * @param props.force      - When `true` the cache should be bypassed and
	 *   fresh data fetched.
	 */
	getResult: (props: {
		pageNumber: number;
		filter?: string;
		force?: boolean;
	}) => Promise<ResultType[] | undefined> | ResultType[] | undefined;
	/**
	 * Called when the user selects one or more items from the string select
	 * menu.
	 *
	 * @returns `true` to stop listening to the select menu, `false` to keep it
	 *   alive.
	 */
	onItemSelected?: (
		interaction: StringSelectMenuInteraction,
		currentResult: CacheItem<ResultType[]>,
		refreshDisplay: () => Promise<void>,
	) => Promise<boolean> | boolean;
	/**
	 * Called when the user interacts with any component added via
	 * `customComponentRows`.
	 *
	 * @returns `true` to stop listening to custom component rows, `false` to
	 *   keep the collector alive.
	 */
	onComponentRowsReacted?: (
		interaction: MessageComponentInteraction,
		currentResult: CacheItem<ResultType[]>,
		refreshDisplay: () => Promise<void>,
	) => Promise<boolean> | boolean;
}

/** Options that control the optional string select menu rendered below the embed. */
export interface CreateSelectMenuOptions {
	/** Minimum number of options the user must select. Defaults to `1`. */
	minSelect?: Resolvable<number, SelectMenuOption[]>;
	/**
	 * Maximum number of options the user may select at once.
	 * Accepts a plain number or a function receiving the current options array.
	 */
	maxSelect?: Resolvable<number, SelectMenuOption[]>;
	/** Placeholder text displayed when no option is selected. */
	placeholder?: string;
	/**
	 * Controls whether the select menu is rendered at all.
	 * Accepts a plain boolean or a zero-argument async function.
	 */
	showSelectMenu?: Resolvable<boolean>;
}

/** Shared base props used by both the public message sender and the internal edit helper. */
interface BasePaginationProps<T> {
	/** The slash-command or component interaction that triggered this view. */
	interaction: ChatInputCommandInteraction | MessageComponentInteraction;
	/**
	 * Optional curried filter predicate.
	 * Called with the current filter string; must return a predicate that
	 * accepts a single item and returns `true` to include it.
	 */
	filterFunc?: (filter?: string) => (v: T) => boolean;
	/** Options forwarded to the string select menu builder. */
	selectMenuOptions?: CreateSelectMenuOptions;
	/**
	 * Converts a result item into a `SelectMenuOption`.
	 * `index` is the *global* index across all pages (i.e. `page * pageSize + localIndex`).
	 * When omitted the select menu is never shown.
	 */
	selectMenuTransform?: (v: T, index: number) => SelectMenuOption;
	/**
	 * Extra action rows appended below the navigation buttons and select menu.
	 * Accepts a plain array or a zero-argument function returning one.
	 */
	customComponentRows?: Resolvable<
		ActionRowBuilder<MessageActionRowComponentBuilder>[]
	>;
	/**
	 * Predicate applied to every component interaction before the pagination
	 * collector processes it.  Use this to restrict interactions to the
	 * invoking user or to exclude custom button IDs.
	 */
	interactionFilter?: (interaction: MessageComponentInteraction) => boolean;
	/**
	 * Converts a result item into an embed field.
	 * `i` is the zero-based index within the current page.
	 */
	formatter: (v: T, i: number) => { name: string; value: string };
	/** Display options for the embed and surrounding UI. */
	options?: PaginationOptions;
}

/** Internal props passed from {@link sendPaginationMessage} down to {@link editInteraction}. */
interface EditInteractionProps<T> extends BasePaginationProps<T> {
	/** Live cache item holding the full (pre-pagination) result array. */
	result: CacheItem<T[]>;
	/** Current zero-based page index. */
	page: number;
	/** Whether to render the string select menu on this render. */
	showSelectMenu: boolean;
}

/**
 * Sends (or edits) a paginated embed message and attaches the collectors that
 * handle all user interactions for the lifetime of the view.
 *
 * **Lifecycle**
 * 1. Calls `getResult` to populate the cache and renders the first page via
 *    `editInteraction`.
 * 2. Attaches three collectors:
 *    - **Button collector** — handles page navigation (`PREVIOUS`, `NEXT`,
 *      `FIRST`, `LAST`, `REFRESH`) and modal-backed actions (`SET_PAGE`,
 *      `SET_FILTER`).
 *    - **Select collector** — forwards string-select interactions to
 *      `onItemSelected`; stops when that callback returns `true`.
 *    - **Custom collector** — forwards all other component interactions to
 *      `onComponentRowsReacted`; stops when that callback returns `true`.
 *
 * The function returns the button `MessageCollector` so callers can attach
 * additional `.on("end")` listeners if needed.
 */
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

/**
 * Renders the current page into the interaction reply.
 *
 * Builds the embed, navigation buttons, optional select menu, and any custom
 * component rows, then calls `interaction.editReply`.  If the interaction has
 * not yet been deferred or replied to it is deferred ephemerally first.
 *
 * @returns The `InteractionResponse` / `Message` returned by `editReply`.
 */
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
