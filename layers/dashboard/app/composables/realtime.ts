import { defineStore } from '#imports'
import { getLocalTimeZone, now } from '@internationalized/date'
import { useUrlSearchParams } from '@vueuse/core'
import { safeDestr } from 'destr'
import { ref } from 'vue'
import { date2unix } from '@/utils/time'

export const useDashboardRealtimeStore = defineStore('dashboard-realtime', () => {
  const searchParams = useUrlSearchParams('history')

  const timeRange = ref({
    startAt: 0,
    endAt: 0,
  })
  const filters = ref<Record<string, string>>({})
  const timeName = ref('last-1h')

  function updateTimeRange(range: [number, number], name?: string) {
    timeRange.value.startAt = range[0]
    timeRange.value.endAt = range[1]
    if (name) {
      timeName.value = name
      searchParams.time = name
    }
  }

  function updateFilter(type: string, value: string) {
    filters.value[type] = value
    searchParams.filters = JSON.stringify(filters.value)
  }

  function clearFilters() {
    filters.value = {}
    searchParams.filters = ''
  }

  function restoreFromUrl() {
    if (searchParams.time && typeof searchParams.time === 'string') {
      timeName.value = searchParams.time
    }

    if (searchParams.filters && typeof searchParams.filters === 'string') {
      const restored = safeDestr<Record<string, string>>(searchParams.filters)
      if (restored) {
        Object.assign(filters.value, restored)
      }
    }
  }

  function initDefaultTimeRange() {
    if (timeRange.value.startAt === 0) {
      const tz = getLocalTimeZone()
      const range = computeTimeRangeFromName(timeName.value, tz)
      timeRange.value.startAt = range[0]
      timeRange.value.endAt = range[1]
    }
  }

  return {
    timeRange,
    timeName,
    filters,
    updateTimeRange,
    updateFilter,
    clearFilters,
    restoreFromUrl,
    initDefaultTimeRange,
  }
})

const TIME_RANGE_PRESETS: Record<string, { minutes?: number, hours?: number } | 'today'> = {
  'today': 'today',
  'last-5m': { minutes: 5 },
  'last-10m': { minutes: 10 },
  'last-30m': { minutes: 30 },
  'last-1h': { hours: 1 },
  'last-6h': { hours: 6 },
  'last-12h': { hours: 12 },
  'last-24h': { hours: 24 },
}

function computeTimeRangeFromName(name: string, tz: string): [number, number] {
  const currentTime = now(tz)
  const preset = TIME_RANGE_PRESETS[name] ?? { hours: 1 }

  if (preset === 'today') {
    return [date2unix(currentTime, 'start'), date2unix(currentTime)]
  }

  return [date2unix(currentTime.subtract(preset)), date2unix(currentTime)]
}
