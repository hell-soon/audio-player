/** «Любимые треки»: своя обложка и описание */
export default defineEventHandler(async event => likedMeta(await requireUserId(event)))
