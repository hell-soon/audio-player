/** Свой профиль (страница /profile) */
export default defineEventHandler(async event => myProfile(await requireUserId(event)))
