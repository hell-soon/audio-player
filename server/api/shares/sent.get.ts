/** «Вы отправили»: последние 30 треков, которые вы прислали друзьям (с отметкой «посмотрел»). */
export default defineEventHandler(async (event): Promise<SentShareInfo[]> => sentShares(await requireUserId(event)))
