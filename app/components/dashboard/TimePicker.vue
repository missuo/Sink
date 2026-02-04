<script setup lang="ts">
import { getLocalTimeZone, now } from '@internationalized/date'

const emit = defineEmits<{
  'update:timeRange': [value: [number, number], key: string]
}>()

const realtimeStore = useDashboardRealtimeStore()
const timeRange = ref(realtimeStore.timeName || 'last-1h')
const tz = getLocalTimeZone()

const TIME_PRESETS: Record<string, { minutes?: number, hours?: number } | 'today'> = {
  'today': 'today',
  'last-5m': { minutes: 5 },
  'last-10m': { minutes: 10 },
  'last-30m': { minutes: 30 },
  'last-1h': { hours: 1 },
  'last-6h': { hours: 6 },
  'last-12h': { hours: 12 },
  'last-24h': { hours: 24 },
}

watch(() => realtimeStore.timeName, (newName) => {
  if (newName && newName !== timeRange.value) {
    timeRange.value = newName
  }
})

watch(timeRange, (newValue) => {
  const preset = TIME_PRESETS[newValue]
  if (!preset)
    return

  const currentTime = now(tz)
  if (preset === 'today') {
    emit('update:timeRange', [date2unix(currentTime, 'start'), date2unix(currentTime)], newValue)
  }
  else {
    emit('update:timeRange', [date2unix(currentTime.subtract(preset)), date2unix(currentTime)], newValue)
  }
})
</script>

<template>
  <Select v-model="timeRange">
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="last-5m">
        {{ $t('dashboard.time_picker.last_5m') }}
      </SelectItem>
      <SelectItem value="last-10m">
        {{ $t('dashboard.time_picker.last_10m') }}
      </SelectItem>
      <SelectItem value="last-30m">
        {{ $t('dashboard.time_picker.last_30m') }}
      </SelectItem>
      <SelectItem value="last-1h">
        {{ $t('dashboard.time_picker.last_1h') }}
      </SelectItem>
      <SelectItem value="last-6h">
        {{ $t('dashboard.time_picker.last_6h') }}
      </SelectItem>
      <SelectItem value="last-12h">
        {{ $t('dashboard.time_picker.last_12h') }}
      </SelectItem>
      <SelectItem value="last-24h">
        {{ $t('dashboard.time_picker.last_24h') }}
      </SelectItem>
      <SelectSeparator />
      <SelectItem value="today">
        {{ $t('dashboard.time_picker.today') }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
