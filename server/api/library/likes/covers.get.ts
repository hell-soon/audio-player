/** Обложки последних любимых треков (до 8, без повторов) — для обложки «Любимые треки» */
export default defineEventHandler(async event => likedCovers(await requireUserId(event)))
