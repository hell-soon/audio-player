const TYPES = ['play-queue', 'handoff', 'yield', 'enqueue', 'pause', 'resume', 'next', 'previous', 'seek', 'volume', 'signal']

/** Отправить команду другому своему устройству. */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const { target, command } = await readBody<{ target?: string, command?: DeviceCommand }>(event)
  if (!target || !command || !TYPES.includes(command.type)) throw createError({ statusCode: 400, message: 'Неверная команда' })
  // Очередь ограничиваем, чтобы запрос не разрастался.
  if (command.type === 'play-queue') command.queue = command.queue.slice(0, 300)
  if (command.type === 'signal' && (typeof command.data?.sdp !== 'string' || command.data.sdp.length > 20_000)) {
    throw createError({ statusCode: 400, message: 'Неверный сигнал' })
  }
  await sendDeviceCommand(userId, target, command)
  return { ok: true }
})
