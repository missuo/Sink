<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const realtimeStore = useDashboardRealtimeStore()

function handleTimeChange(timeRange: [number, number], timeName?: string) {
  realtimeStore.updateTimeRange(timeRange, timeName)
}

function handleFilterChange(type: string, value: string) {
  realtimeStore.updateFilter(type, value)
}
</script>

<template>
  <main
    class="
      w-full
      md:h-full md:overflow-hidden
    "
  >
    <Teleport to="#dashboard-header-actions" defer>
      <div
        class="
          flex-1
          sm:hidden
        "
      />
      <DashboardTimePicker @update:time-range="handleTimeChange" />
      <DashboardFilters @change="handleFilterChange" />
    </Teleport>

    <LazyDashboardRealtime />
  </main>
</template>
