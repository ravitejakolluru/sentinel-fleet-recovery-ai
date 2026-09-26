import { useSyncExternalStore } from 'react'
import { getSimulationDataSnapshot, subscribeSimulationData } from '../services/simulation-state.js'

export default function useSimulationData() {
  return useSyncExternalStore(subscribeSimulationData, getSimulationDataSnapshot, getSimulationDataSnapshot)
}