<script setup lang="ts">
import type { DateRange, DateValue } from 'reka-ui'
import { getLocalTimeZone, now, startOfMonth, startOfWeek } from '@internationalized/date'
import { useUrlSearchParams } from '@vueuse/core'
import { safeDestr } from 'destr'

const emit = defineEmits<{
  'update:dateRange': [value: [number, number]]
}>()

const analysisStore = useDashboardAnalysisStore()

const dateRange = ref<string | null>('last-7d')
const openCustomDateRange = ref(false)
const customDate = ref<DateValue | undefined>()
const customDateRange = ref<DateRange | undefined>()

const locale = getLocale()
const tz = getLocalTimeZone()

function updateCustomDate(customDateValue: DateValue) {
  emit('update:dateRange', [date2unix(customDateValue, 'start'), date2unix(customDateValue, 'end')])
  openCustomDateRange.value = false
  customDate.value = undefined
}

function updateCustomDateRange(customDateRangeValue: DateRange) {
  if (customDateRangeValue.start && customDateRangeValue.end) {
    emit('update:dateRange', [date2unix(customDateRangeValue.start, 'start'), date2unix(customDateRangeValue.end, 'end')])
    openCustomDateRange.value = false
    customDateRange.value = undefined
  }
}

function isDateDisabled(dateValue: DateValue) {
  return dateValue.toDate(tz) > new Date()
}

watch(dateRange, (newValue) => {
  if (!newValue)
    return

  const currentTime = now(tz)

  if (newValue === 'custom') {
    openCustomDateRange.value = true
    dateRange.value = null
    return
  }

  const presets: Record<string, () => [number, number]> = {
    'today': () => [date2unix(currentTime, 'start'), date2unix(currentTime)],
    'last-24h': () => [date2unix(currentTime.subtract({ hours: 24 })), date2unix(currentTime)],
    'this-week': () => [date2unix(startOfWeek(currentTime, locale), 'start'), date2unix(currentTime)],
    'last-7d': () => [date2unix(currentTime.subtract({ days: 7 })), date2unix(currentTime)],
    'this-month': () => [date2unix(startOfMonth(currentTime), 'start'), date2unix(currentTime)],
    'last-30d': () => [date2unix(currentTime.subtract({ days: 30 })), date2unix(currentTime)],
    'last-90d': () => [date2unix(currentTime.subtract({ days: 90 })), date2unix(currentTime)],
  }

  const getRange = presets[newValue]
  if (getRange) {
    emit('update:dateRange', getRange())
  }
})

function restoreDateRange() {
  try {
    const searchParams = useUrlSearchParams('history')
    if (searchParams.time) {
      const time = safeDestr<{ startAt: number, endAt: number }>(searchParams.time as string)
      emit('update:dateRange', [time.startAt, time.endAt])
      dateRange.value = null
    }
  }
  catch (error) {
    console.error('restore searchParams error', error)
  }
}

onBeforeMount(() => {
  restoreDateRange()
})
</script>

<template>
  <Select v-model="dateRange">
    <SelectTrigger>
      <SelectValue v-if="dateRange" />
      <div v-else>
        {{ shortDate(analysisStore.dateRange.startAt) }} - {{ shortDate(analysisStore.dateRange.endAt) }}
      </div>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="today">
        {{ $t('dashboard.date_picker.today') }}
      </SelectItem>
      <SelectItem value="last-24h">
        {{ $t('dashboard.date_picker.last_24h') }}
      </SelectItem>
      <SelectSeparator />
      <SelectItem value="this-week">
        {{ $t('dashboard.date_picker.this_week') }}
      </SelectItem>
      <SelectItem value="last-7d">
        {{ $t('dashboard.date_picker.last_7d') }}
      </SelectItem>
      <SelectSeparator />
      <SelectItem value="this-month">
        {{ $t('dashboard.date_picker.this_month') }}
      </SelectItem>
      <SelectItem value="last-30d">
        {{ $t('dashboard.date_picker.last_30d') }}
      </SelectItem>
      <SelectSeparator />
      <SelectItem value="last-90d">
        {{ $t('dashboard.date_picker.last_90d') }}
      </SelectItem>
      <SelectSeparator />
      <SelectItem value="custom">
        {{ $t('dashboard.date_picker.custom') }}
      </SelectItem>
    </SelectContent>
  </Select>

  <ResponsiveModal
    v-model:open="openCustomDateRange"
    :title="$t('dashboard.date_picker.custom_title')"
    content-class="w-auto md:max-w-(--breakpoint-md)"
  >
    <Tabs
      default-value="range"
    >
      <div class="flex justify-center">
        <TabsList>
          <TabsTrigger value="date">
            {{ $t('dashboard.date_picker.single_date') }}
          </TabsTrigger>
          <TabsTrigger value="range">
            {{ $t('dashboard.date_picker.date_range') }}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent
        value="date"
        class="h-80 overflow-y-auto"
      >
        <Calendar
          :model-value="customDate"
          weekday-format="short"
          :is-date-disabled="isDateDisabled"
          @update:model-value="(date) => date && updateCustomDate(date)"
        />
      </TabsContent>
      <TabsContent
        value="range"
        class="h-80 overflow-y-auto"
      >
        <RangeCalendar
          :model-value="customDateRange"
          initial-focus
          weekday-format="short"
          :number-of-months="2"
          :is-date-disabled="isDateDisabled"
          @update:model-value="updateCustomDateRange"
        />
      </TabsContent>
    </Tabs>
  </ResponsiveModal>
</template>
