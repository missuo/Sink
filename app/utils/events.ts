import { useEventBus } from '@vueuse/core'

export interface TrafficEventParams {
  props: {
    item: {
      latitude?: number
      longitude?: number
      COLO?: string
      city?: string
    }
  }
}

export const globalTrafficEvent = useEventBus<TrafficEventParams>(Symbol('traffic'))
