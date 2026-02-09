<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

provide(LINK_ID_KEY, computed(() => undefined))

const analysisStore = useDashboardAnalysisStore()

function handleDateChange(dateRange: [number, number]) {
  analysisStore.updateDateRange(dateRange)
}

function handleFilterChange(type: string, value: string) {
  analysisStore.updateFilter(type, value)
}
</script>

<template>
  <main class="space-y-6">
    <Teleport to="#dashboard-header-actions" defer>
      <div
        class="
          flex-1
          sm:hidden
        "
      />
      <DashboardDatePicker @update:date-range="handleDateChange" />
      <DashboardFilters @change="handleFilterChange" />
    </Teleport>

    <DashboardAnalysis />
  </main>
</template>
