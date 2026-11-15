import type { InjectionKey, Ref } from 'vue'

/**
 * «Выбрать все треки» с панели коллекции: CollectionView (provide) увеличивает счётчик,
 * TrackList внутри неё (inject) включает выбор всех строк. Виджеты не импортируют друг друга (FSD) —
 * связь через ключ из shared.
 */
export const SELECT_ALL_TRACKS: InjectionKey<Ref<number>> = Symbol('select-all-tracks')
