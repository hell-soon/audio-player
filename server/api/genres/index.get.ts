/** Каталог станций Яндекса для плейлистов по жанрам: «Жанры дня» и все группы. */
export default defineEventHandler(async (event): Promise<GenreCatalog> => {
  return genreCatalog(event, await requireUserId(event))
})
