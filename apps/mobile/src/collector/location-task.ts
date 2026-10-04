import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import type { LocationObject } from 'expo-location';
import { LOCATION_TASK } from './constants';
import { reconfigure } from './task-registration';
import { readBatteryPct } from './battery-probe';
import { getDb } from '../data/db/db';
import * as collectorMeta from '../data/db/collector-meta-repo';
import { enqueueFixes } from '../data/db/pending-fixes-repo';
import {
  mapToWireFix,
  type LocationProvider,
  type LocationSample,
  type MapContext,
} from '../domain/location-fix';
import {
  classifyMotion,
  debounceMotion,
  isMovingForState,
  activityOf,
} from '../domain/motion-state';
import { speedFromDisplacement } from '../domain/geo';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Defined at module top level: OS runs this in a bare JS context (no React tree), registered during cold start.

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logDebug('collector:task-error', error.message);
    return;
  }
  const locations = (data as { locations?: LocationObject[] } | undefined)?.locations;
  if (!locations || locations.length === 0) return;

  try {
    const db = await getDb();

    // discard fixes while paused (matches server)
    if (await collectorMeta.isPausedCached(db)) return;

    const batteryPct = await readBatteryPct();
    const provider: LocationProvider = Platform.OS === 'ios' ? 'gps' : 'fused';

    const prev = await collectorMeta.getLastFix(db);
    const last = locations[locations.length - 1]!;

    // prefer GPS-measured speed, else derive from displacement
    const measured = typeof last.coords.speed === 'number' && last.coords.speed >= 0;
    let speedMps: number | null = measured ? last.coords.speed : null;
    if (!measured && prev) {
      speedMps = speedFromDisplacement(prev, {
        lat: last.coords.latitude,
        lon: last.coords.longitude,
        tsMs: last.timestamp,
      });
    }

    const reading = classifyMotion({ speedMps, speedMeasured: measured, stepsPerMin: null });

    // debounce so one noisy sample doesn't flap the sampling profile
    const prevDebounce = await collectorMeta.getMotionDebounce(db);
    const { next: nextDebounce, changed } = debounceMotion(prevDebounce, reading.state);
    const committed = nextDebounce.state;

    const nowMs = Date.now();
    const ctx: MapContext = {
      batteryPct,
      provider,
      activity: activityOf(committed),
      activityConf: reading.conf,
      isMoving: isMovingForState(committed),
      nowMs,
    };

    const fixes = locations.map((l) => mapToWireFix(toSample(l), ctx));
    await enqueueFixes(db, fixes, nowMs);
    await collectorMeta.setMotionDebounce(db, nextDebounce);
    await collectorMeta.setLastFix(db, { lat: last.coords.latitude, lon: last.coords.longitude, tsMs: last.timestamp });

    // reconfigure only on a real (debounced) change, so we don't churn the task every batch
    if (changed) {
      logDebug('collector:motion-change', committed);
      try {
        await reconfigure(committed);
      } catch (e) {
        logDebug('collector:reconfigure-error', e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e) {
    logDebug('collector:task-exception', e instanceof Error ? e.message : String(e));
  }
});

function toSample(l: LocationObject): LocationSample {
  return {
    coords: {
      latitude: l.coords.latitude,
      longitude: l.coords.longitude,
      accuracy: l.coords.accuracy,
      altitude: l.coords.altitude,
      altitudeAccuracy: l.coords.altitudeAccuracy,
      heading: l.coords.heading,
      speed: l.coords.speed,
    },
    timestamp: l.timestamp,
    mocked: (l as { mocked?: boolean }).mocked,
  };
}
