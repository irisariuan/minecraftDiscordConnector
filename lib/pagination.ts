import { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, time, ComponentType, type Message, type ChatInputCommandInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, type ModalActionRowComponentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type Client } from "discord.js"
import type { LogLine } from "./request"

export enum PageAction {
    PREVIOUS = 'prev',
    NEXT = 'next',
    REFRESH = 'refresh',
    FIRST = 'first',
    LAST = 'last',
    SET_PAGE = 'setpage'
}

export enum ModalAction {
    MODAL_ID = 'setpage',
    INPUT = 'page',
}

function calculateMaxPage(resultLength: number) {
    return Math.ceil(resultLength / pageSize) - 1
}

export function createModal() {
    const modal = new ModalBuilder()
        .setCustomId(ModalAction.MODAL_ID)
        .setTitle('Set Page')
    const pageInput = new TextInputBuilder()
        .setCustomId(ModalAction.INPUT)
        .setLabel('Page')
        .setPlaceholder('Enter page number')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
    const firstRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(pageInput)
    modal.addComponents(firstRow)
    return modal
}

export function createButtons(page: number, contentLength: number, maxPage: number = calculateMaxPage(contentLength)) {
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
    const modalBtn = new ButtonBuilder()
        .setCustomId(PageAction.SET_PAGE)
        .setLabel('Set Page')
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
    secondRow.addComponents(refreshBtn, modalBtn)
    if (maxPage > 1) {
        secondRow.addComponents(firstBtn, lastBtn)
    }
    return [firstRow, secondRow]
}

export function getPage(page: number, maxPage: number, pageAction: PageAction) {
    return Math.max(Math.min(pageAction === PageAction.PREVIOUS ? page - 1 : pageAction === PageAction.NEXT ? page + 1 : pageAction === PageAction.FIRST ? 0 : pageAction === PageAction.LAST ? maxPage : page, maxPage), 0)
}

export function createEmbed(result: LogLine[], page: number) {
    return new EmbedBuilder()
        .setTitle('Logs')
        .setTimestamp(Date.now())
        .setColor('Green')
        .addFields(...result
            .map(
                v => ({
                    name: v.type,
                    value: [
                        time(new Date(v.timestamp)),
                        v.message
                    ].join('\n')
                })
            )
            .slice(
                page * pageSize, (page + 1) * pageSize
            )
        )
        .setFooter({ text: `Showing logs ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, result.length)} of ${result.length}` })
}

export const pageSize = 20

export async function sendPaginationMessage(getResult: () => Promise<LogLine[] | undefined>, interaction: ChatInputCommandInteraction, filter?: string) {
    const result = (await getResult())?.filter(v => filter ? v.type === filter : true)
    let interactionResponse: Message
    let page = 0
    if (!result || result.length <= 0) {
        interactionResponse = await interaction.editReply({
            content: 'No log found',
            embeds: [],
            components: createButtons(0, 0)
        })
    } else {
        interactionResponse = await editInteraction(result, interaction, page, filter)
    }

    interactionResponse.createMessageComponentCollector({ componentType: ComponentType.Button }).on('collect', async i => {
        if (i.customId === PageAction.SET_PAGE && !i.deferred) {
            const modal = createModal()
            await i.showModal(modal).catch(() => { })
            const reply = await i.awaitModalSubmit({ time: 1000 * 60 * 5, filter: (i) => i.customId === ModalAction.MODAL_ID })
            await reply.deferUpdate()
            const oldPage = page
            page = (Number(reply.fields.getTextInputValue(ModalAction.INPUT)) || page + 1) - 1
            if (oldPage === page) return
            const maxPage = calculateMaxPage(result?.length || 0)
            return editInteraction(result || [], interaction, Math.max(Math.min(page, maxPage), 0), filter)
        }

        i.deferUpdate()

        const reloadResult = i.customId === PageAction.REFRESH ? await getResult() : result

        if (!reloadResult || reloadResult.length <= 0) return interaction.editReply({
            content: 'No log found',
            embeds: [],
            components: createButtons(0, 0)
        })

        const maxPage = calculateMaxPage(reloadResult.length)
        page = getPage(page, maxPage, i.customId as PageAction)

        if (!reloadResult) return await interaction.editReply({
            content: 'No log found',
            embeds: [],
            components: createButtons(0, 0)
        })

        editInteraction(reloadResult, interaction, page, filter)
    })
}

async function editInteraction(result: LogLine[], interaction: ChatInputCommandInteraction, page: number, filter?: string) {
    const filteredResult = result.filter(v => filter ? v.type === filter : true)
    const embed = createEmbed(filteredResult, page)
    const buttonRow = createButtons(page, filteredResult.length)
    return await interaction.editReply({ embeds: [embed], components: buttonRow, content: `Page ${page + 1}/${Math.ceil(filteredResult.length / pageSize)}`.trim() })
}