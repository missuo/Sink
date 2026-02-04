<script setup lang="ts">
import type { GlobeInstance } from 'globe.gl'
import type { ColoData, CurrentLocation, GeoJSONData, LocationData } from '@/types'
import type { TrafficEventParams } from '@/utils/events'
import { useDebounceFn, useElementSize, watchDeep } from '@vueuse/core'
import { scaleSequentialSqrt } from 'd3-scale'
import { interpolateYlOrRd } from 'd3-scale-chromatic'
import Globe from 'globe.gl'
import { MeshPhongMaterial } from 'three'

const realtimeStore = useDashboardRealtimeStore()

const countries = shallowRef<GeoJSONData>({ features: [] })
const locations = shallowRef<LocationData[]>([])
const colos = shallowRef<Record<string, ColoData>>({})
const currentLocation = ref<CurrentLocation>({})

const el = useTemplateRef('globeEl')
const { width, height } = useElementSize(el)
const size = computed(() => ({
  width: width.value,
  height: height.value || width.value,
}))

const globeEl = ref()
const hexAltitude = ref(0.001)
const highest = computed(() => {
  return locations.value.reduce((acc, curr) => Math.max(acc, curr.count), 0) || 1
})

let globe: GlobeInstance | null = null
const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>()

function safeTimeout(fn: () => void, delay: number) {
  const id = setTimeout(() => {
    pendingTimeouts.delete(id)
    fn()
  }, delay)
  pendingTimeouts.add(id)
}

function clearAllTimeouts() {
  pendingTimeouts.forEach(id => clearTimeout(id))
  pendingTimeouts.clear()
}

async function getGlobeJSON() {
  const data = await $fetch('/countries.geojson')
  countries.value = data as GeoJSONData
}

async function getColosJSON() {
  const data = await $fetch('/colos.json')
  colos.value = data as Record<string, ColoData>
}

async function getCurrentLocation() {
  const data = await useAPI<CurrentLocation>('/api/location')
  currentLocation.value = data
}

interface RawLocationData {
  latitude: number
  longitude: number
  count: string | number
}

async function getLiveLocations() {
  const result = await useAPI<{ data: RawLocationData[] }>('/api/logs/locations', {
    query: {
      startAt: realtimeStore.timeRange.startAt,
      endAt: realtimeStore.timeRange.endAt,
      ...realtimeStore.filters,
    },
  })

  locations.value = result.data?.map(e => ({
    lat: e.latitude,
    lng: e.longitude,
    count: +e.count,
  })) || []
}

function trafficEvent({ props }: TrafficEventParams, { delay = 0 }: { delay?: number } = {}) {
  if (!globe)
    return

  const { item } = props
  if (item.latitude == null || item.longitude == null || !item.COLO) {
    console.warn('Missing location data for traffic event', item)
    return
  }

  const arc = {
    startLat: item.latitude,
    startLng: item.longitude,
    endLat: colos.value[item.COLO]?.lat,
    endLng: colos.value[item.COLO]?.lon,
    color: 'darkOrange',
    arcAltitude: 0.2,
  }

  if (arc.endLat === undefined || arc.endLng === undefined) {
    console.warn(`Missing COLO coordinates for ${item.COLO}`)
    return
  }

  console.info(`from ${item.city}(${arc.startLat}, ${arc.startLng}) to ${item.COLO}(${arc.endLat}, ${arc.endLng})`)
  const isNear = Math.abs(arc.endLat - arc.startLat) < 5 && Math.abs(arc.endLng - arc.startLng) < 5
  if (isNear) {
    console.info(`from ${item.city} to ${item.COLO} is near, skip`)
    return
  }
  const random = Math.random()
  globe.arcsData([arc])
    .arcColor('color')
    .arcDashLength(() => random)
    .arcDashGap(() => 1 - random)
    .arcDashAnimateTime(delay * 2)
    .ringRepeatPeriod(delay * 2)

  const srcRing = { lat: arc.startLat, lng: arc.startLng }
  globe.ringsData([...(globe.ringsData() as object[]), srcRing])
  safeTimeout(() => {
    if (globe) {
      globe.ringsData((globe.ringsData() as object[]).filter(r => r !== srcRing))
    }
  }, delay * 2)

  safeTimeout(() => {
    if (!globe)
      return
    const targetRing = { lat: arc.endLat, lng: arc.endLng }
    globe.ringsData([...(globe.ringsData() as object[]), targetRing])
    safeTimeout(() => {
      if (globe) {
        globe.ringsData((globe.ringsData() as object[]).filter(r => r !== targetRing))
      }
    }, delay * 2)
  }, delay * 2)

  safeTimeout(() => {
    if (globe) {
      globe.arcsData([])
    }
  }, delay * 2)
}

function createWeightColor() {
  const domainMax = highest.value * 3
  return scaleSequentialSqrt(interpolateYlOrRd).domain([0, domainMax])
}

const debouncedControlsEnd = useDebounceFn(() => {
  if (!globe)
    return
  const distance = Math.round(globe.controls().getDistance())
  let nextAlt = 0.005
  if (distance <= 300)
    nextAlt = 0.001
  else if (distance >= 600)
    nextAlt = 0.02
  if (nextAlt !== hexAltitude.value)
    hexAltitude.value = nextAlt
}, 200)

function initGlobe() {
  const weightColor = createWeightColor()

  globe = new Globe(globeEl.value)
    .width(size.value.width)
    .height(size.value.height)
    // .globeOffset([width.value > 768 ? -100 : 0, width.value > 768 ? 0 : 100])
    .atmosphereColor('rgb(170, 170, 200)')
    .globeMaterial(new MeshPhongMaterial({
      color: 'rgb(228, 228, 231)',
      transparent: false,
      opacity: 1,
    }) as any)
    .backgroundColor('rgba(0,0,0,0)')
    .hexPolygonsData(countries.value.features as object[])
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.2)
    .hexBinResolution(3)
    .hexBinPointsData(locations.value)
    .hexPolygonAltitude(() => hexAltitude.value)
    .hexBinMerge(true)
    .hexBinPointWeight('count')
    .hexPolygonColor(() => `rgba(54, 211, 153, ${Math.random() / 1.5 + 0.5})`)
    .hexTopColor((d: { sumWeight: number }) => weightColor(d.sumWeight))
    .hexSideColor((d: { sumWeight: number }) => weightColor(d.sumWeight))
    .ringColor(() => (t: number) => `rgba(255,100,50,${1 - t})`)
    .ringMaxRadius(3)
    .ringPropagationSpeed(3)
    .onGlobeReady(() => {
      if (!globe)
        return
      globe.pointOfView({ lat: currentLocation.value.latitude, lng: currentLocation.value.longitude, altitude: width.value > 768 ? 2 : 3 })
      globe.controls().autoRotate = true
      globe.controls().autoRotateSpeed = 0.3
    })

  globe.controls().addEventListener('end', debouncedControlsEnd)

  globalTrafficEvent.on(trafficEvent)
}

function stopRotation() {
  if (globe) {
    globe.controls().autoRotate = false
  }
}

watchDeep([() => realtimeStore.timeRange, () => realtimeStore.filters], getLiveLocations)

watch([width, height], () => {
  if (globe) {
    globe.width(size.value.width)
    globe.height(size.value.height)
  }
})

watch(locations, () => {
  if (globe) {
    const weightColor = createWeightColor()
    globe.hexBinPointsData(locations.value)
    globe.hexTopColor((d: { sumWeight: number }) => weightColor(d.sumWeight))
    globe.hexSideColor((d: { sumWeight: number }) => weightColor(d.sumWeight))
  }
})

onMounted(async () => {
  await Promise.all([
    getLiveLocations(),
    getCurrentLocation(),
    getGlobeJSON(),
    getColosJSON(),
  ])
  initGlobe()
})

onBeforeUnmount(() => {
  clearAllTimeouts()
  globalTrafficEvent.off(trafficEvent)
  if (globe) {
    globe.controls().removeEventListener('end', debouncedControlsEnd)
    globe._destructor?.()
    globe = null
  }
})
</script>

<template>
  <div ref="globeEl" class="h-full w-full" @mousedown="stopRotation" />
</template>
