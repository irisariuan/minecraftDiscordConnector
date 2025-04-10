import { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, time, ComponentType, type Message, type ChatInputCommandInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, type ModalActionRowComponentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type Client, type ColorResolvable } from "discord.js"
import { CacheItem } from "./cache"

export enum PageAction {
    PREVIOUS = 'prev',
    NEXT = 'next',
    REFRESH = 'refresh',
    FIRST = 'first',
    LAST = 'last',
    SET_PAGE = 'setpage',
    SET_FILTER = 'setfilter',
}

export enum ModalAction {
    MODAL_PAGE_ID = 'setpage',
    PAGE_INPUT = 'page',
    MODAL_FILTER_ID = 'filterpage',
    FILTER_INPUT = 'filterinput',
}

function calculateMaxPage(resultLength: number) {
    return Math.ceil(resultLength / pageSize) - 1
}

export function createPageModal() {
    const modal = new ModalBuilder()
        .setCustomId(ModalAction.MODAL_PAGE_ID)
        .setTitle('Set Page')
    const pageInput = new TextInputBuilder()
        .setCustomId(ModalAction.PAGE_INPUT)
        .setLabel('Page')
        .setPlaceholder('Enter page number')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
    const firstRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(pageInput)
    modal.addComponents(firstRow)
    return modal
}

export function createFilterModal() {
    const modal = new ModalBuilder()
        .setCustomId(ModalAction.MODAL_FILTER_ID)
        .setTitle('Filter');
    const filterInput = new TextInputBuilder()
        .setCustomId(ModalAction.FILTER_INPUT)
        .setLabel('Filter')
        .setPlaceholder('Enter filter keyword')
        .setRequired(false)
        .setStyle(TextInputStyle.Short);
    const firstRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(filterInput);
    modal.addComponents(firstRow);
    return modal;
}

interface CreateButtonsProps {
    page: number,
    contentLength: number,
    maxPage?: number,
    unfixablePageNumber?: boolean
}
export function createButtons({ page, contentLength, maxPage = calculateMaxPage(contentLength), unfixablePageNumber = false }: CreateButtonsProps) {
    const prevBtn = new ButtonBuilder()
        .setCustomId(PageAction.PREVIOUS)
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Primary)
    const nextBtn = new ButtonBuilder()
        .setCustomId(PageAction.NEXT)
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Primary)
    const refreshBtn = new ButtonBuilder()
        .setCustomId(PageAction.REFRESH)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
    const firstBtn = new ButtonBuilder()
        .setCustomId(PageAction.FIRST)
        .setLabel('First Page')
        .setStyle(ButtonStyle.Secondary)
    const lastBtn = new ButtonBuilder()
        .setCustomId(PageAction.LAST)
        .setLabel('Last Page')
        .setStyle(ButtonStyle.Secondary)
    const pageModalBtn = new ButtonBuilder()
        .setCustomId(PageAction.SET_PAGE)
        .setLabel('Set Page')
        .setStyle(ButtonStyle.Secondary)
    const filterModalBtn = new ButtonBuilder()
        .setCustomId(PageAction.SET_FILTER)
        .setLabel('Set Filter')
        .setStyle(ButtonStyle.Secondary)

    const firstRow = new ActionRowBuilder<ButtonBuilder>()
    const secondRow = new ActionRowBuilder<ButtonBuilder>()

    if (page <= 0) {
        prevBtn.setDisabled(true)
        firstBtn.setDisabled(true)
    }
    if (contentLength - (page + 1) * pageSize <= 0) {
        nextBtn.setDisabled(true)
        lastBtn.setDisabled(true)
    }
    firstRow.addComponents(prevBtn, nextBtn)
    secondRow.addComponents(refreshBtn, pageModalBtn, filterModalBtn)
    if (maxPage > 1 && !unfixablePageNumber) {
        secondRow.addComponents(firstBtn, lastBtn)
    }
    return [firstRow, secondRow]
}

interface GetPageProps {
    page: number,
    maxPage: number,
    pageAction: PageAction
}
export function getPage({ page, maxPage, pageAction }: GetPageProps) {
    return Math.max(Math.min(pageAction === PageAction.PREVIOUS ? page - 1 : pageAction === PageAction.NEXT ? page + 1 : pageAction === PageAction.FIRST ? 0 : pageAction === PageAction.LAST ? maxPage : page, maxPage), 0)
}

interface CreateEmbedProps<T> {
    result: T[],
    page: number,
    formatter: (v: T, i: number) => { name: string, value: string },
    options?: Pick<PaginationOptions, 'title' | 'mainColor' | 'unfixablePageNumber'>
}

export function createEmbed<T>({ result, page, options, formatter }: CreateEmbedProps<T>) {
    return new EmbedBuilder()
        .setTitle(options?.title || 'Logs')
        .setTimestamp(Date.now())
        .setColor(options?.mainColor || 'Green')
        .addFields(...result
            .map(formatter)
            .slice(
                page * pageSize, (page + 1) * pageSize
            )
        )
        .setFooter({ text: `Showing results ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, result.length)}${options?.unfixablePageNumber ? '' : ` of ${result.length}`}` })
}

export const pageSize = 20

interface PaginationOptions {
    filter?: string,
    notFoundMessage?: string,
    title?: string,
    mainColor?: ColorResolvable,
    unfixablePageNumber?: boolean
}

interface SendPaginationMessageProps<T> extends BasePaginationProps<T> {
    getResult: (pageNumber: number, force?: boolean) => Promise<T[] | undefined>
}

export async function sendPaginationMessage<T>({ getResult, interaction, options, filterFunc, formatter }: SendPaginationMessageProps<T>) {
    let page = 0
    const result = new CacheItem<T[]>(null, {
        updateMethod: async () => (await getResult(page, true))?.filter(filterFunc(options?.filter)) || [],
        interval: 1000 * 60 * 5,
        ttl: 1000 * 60 * 3,
    })

    const interactionResponse = await editInteraction({ result, interaction, page, options, filterFunc, formatter })

    interactionResponse.createMessageComponentCollector({ componentType: ComponentType.Button }).on('collect', async i => {
        if (i.customId === PageAction.SET_PAGE && !i.deferred) {
            const modal = createPageModal()
            await i.showModal(modal).catch(() => { })
            const reply = await i.awaitModalSubmit({ time: 1000 * 60 * 5, filter: (i) => i.customId === ModalAction.MODAL_PAGE_ID })
            await reply.deferUpdate()
            const oldPage = page
            page = (Number(reply.fields.getTextInputValue(ModalAction.PAGE_INPUT)) || page + 1) - 1
            if (oldPage === page) return
            const maxPage = calculateMaxPage((await result.getData())?.length || 0)
            return editInteraction({ result, interaction, page: Math.max(Math.min(page, maxPage), 0), options, filterFunc, formatter })
        }

        if (i.customId === PageAction.SET_FILTER && !i.deferred) {
            const modal = createFilterModal()
            await i.showModal(modal).catch(() => { })
            const reply = await i.awaitModalSubmit({ time: 1000 * 60 * 5, filter: (i) => i.customId === ModalAction.MODAL_FILTER_ID })
            await reply.deferUpdate()
            const filter = reply.fields.getTextInputValue(ModalAction.FILTER_INPUT)
            result.setUpdateMethod(async () => (await getResult(page, true))?.filter(filterFunc(filter)) || [])
            const maxPage = calculateMaxPage((await result.getData())?.length || 0)
            page = getPage({ page, maxPage, pageAction: PageAction.SET_FILTER })
            return editInteraction({ result, interaction, page: Math.max(Math.min(page, maxPage), 0), options, filterFunc, formatter })
        }

        i.deferUpdate()
        if (i.customId === PageAction.REFRESH) {
            await result.update()
        }
        const data = await result.getData()
        if (!data || data.length <= 0) return interaction.editReply({
            content: options?.notFoundMessage || 'No results',
            embeds: [],
            components: createButtons({ page: 0, contentLength: 0, unfixablePageNumber: options?.unfixablePageNumber })
        })

        const maxPage = calculateMaxPage(data.length)
        page = getPage({ page, maxPage, pageAction: i.customId as PageAction })
        await editInteraction({ result, interaction, page, options, filterFunc, formatter })
    })
}

interface BasePaginationProps<T> {
    interaction: ChatInputCommandInteraction,
    filterFunc: (filter?: string) => ((v: T) => boolean),
    formatter: (v: T, i: number) => { name: string, value: string },
    options?: PaginationOptions,
}

interface EditInteractionProps<T> extends BasePaginationProps<T> {
    result: CacheItem<T[]>,
    page: number,
}

async function editInteraction<T>({ result, interaction, page, options, filterFunc, formatter }: EditInteractionProps<T>) {
    const data = await result.getData()
    if (!data || data.length <= 0) {
        return await interaction.editReply({
            content: options?.notFoundMessage || 'No results',
            embeds: [],
            components: createButtons({ page: 0, contentLength: 0, unfixablePageNumber: options?.unfixablePageNumber })
        })
    }
    const filteredResult = data.filter(filterFunc(options?.filter))
    const embed = createEmbed({ result: filteredResult, page, options, formatter })
    const maxPage = calculateMaxPage(filteredResult.length)
    const buttonRow = createButtons({ page, contentLength: filteredResult.length, unfixablePageNumber: options?.unfixablePageNumber })
    return await interaction.editReply({ embeds: [embed], components: buttonRow, content: `Page ${page + 1}/${maxPage + 1}`.trim() })
}