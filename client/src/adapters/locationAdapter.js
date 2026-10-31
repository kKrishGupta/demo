/**
 * LocationAdapter
 * Pluggable adapter for resolving authorized site and facility locations.
 */

import { escapeRegExp } from '../utils/security';

export const SAMPLE_LOCATIONS = [
  'Kitchen',
  'Pantry',
  'Site Office',
  'Assembly Line 1',
  'Warehouse Block B',
  'Warehouse Bay 4',
  'Pit 4',
  'Main Shaft',
  'Conference Room A',
  'Ward 4',
  'Store Front',
  'Server Room',
  'Temple Sanctum',
  'Greenhouse 2'
];

export class LocationAdapter {
  constructor(locations = SAMPLE_LOCATIONS) {
    this._locations = [...locations];
  }

  getLocations() {
    return this._locations;
  }

  resolveLocation(text) {
    if (!text || typeof text !== 'string') return null;

    for (const loc of this._locations) {
      const reg = new RegExp(`\\b${escapeRegExp(loc)}\\b`, 'i');
      if (reg.test(text)) {
        return {
          canonical: loc,
          confidence: 0.95
        };
      }
    }

    return null;
  }
}

export const defaultLocationAdapter = new LocationAdapter();
