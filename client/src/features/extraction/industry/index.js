/**
 * Universal Industry Registry & Action Catalog
 * Coordinates configurable vocabularies across all 15 industrial, commercial, and domestic sectors.
 */

import { HOUSEHOLD_ACTIONS } from './household.js';
import { MINING_ACTIONS } from './mining.js';
import { MANUFACTURING_ACTIONS } from './manufacturing.js';
import { CONSTRUCTION_ACTIONS } from './construction.js';
import { HOSPITALITY_ACTIONS } from './hospitality.js';
import { RELIGIOUS_FACILITY_ACTIONS } from './religiousFacilities.js';
import { HEALTHCARE_ACTIONS } from './healthcare.js';
import { RETAIL_ACTIONS } from './retail.js';
import { LOGISTICS_ACTIONS } from './logistics.js';
import { AGRICULTURE_ACTIONS } from './agriculture.js';
import { EDUCATION_ACTIONS } from './education.js';
import { OFFICE_ACTIONS } from './office.js';
import { IT_OPERATIONS_ACTIONS } from './itOperations.js';
import { PROCUREMENT_ACTIONS } from './procurement.js';
import { MAINTENANCE_FACILITIES_ACTIONS } from './maintenanceFacilities.js';
import { evaluateSafetyClassification } from './safetyClassifier.js';
import { escapeRegExp } from '../../../utils/security.js';

export { evaluateSafetyClassification };

export const INDUSTRY_METADATA = [
  { key: 'all', label: 'Universal (All 15 Industries)', icon: 'Globe', description: 'Cross-industry matching across all domains' },
  { key: 'household', label: '1. Household Work', icon: 'Home', description: 'Cleaning, cooking, laundry, utilities, domestic chores' },
  { key: 'mining', label: '2. Mining & Extraction', icon: 'Pickaxe', description: 'Excavation, blasting, shaft inspection, haulage, crusher' },
  { key: 'manufacturing', label: '3. Manufacturing & Plants', icon: 'Factory', description: 'Assembly lines, calibration, batch QA, welding, tooling' },
  { key: 'construction', label: '4. Construction & Sites', icon: 'HardHat', description: 'Formwork, concrete pouring, curing, scaffolding, rebar' },
  { key: 'hospitality', label: '5. Restaurants & Food Service', icon: 'Utensils', description: 'Prep, marination, cold-storage audit, kitchen sanitization' },
  { key: 'religious_facilities', label: '6. Temples & Cultural Facilities', icon: 'Landmark', description: 'Sanctum cleansing, prasad preparation, bhandara, crowd control' },
  { key: 'healthcare', label: '7. Healthcare Administration', icon: 'Cross', description: 'Ward sterilization, OPD scheduling, ICU inventory, triage' },
  { key: 'retail', label: '8. Retail & Commerce', icon: 'Store', description: 'Aisle restocking, POS reconciliation, price tagging, shelf audit' },
  { key: 'logistics', label: '9. Logistics & Supply Chain', icon: 'Truck', description: 'Fleet dispatch, dock loading, manifest verification, challans' },
  { key: 'agriculture', label: '10. Agriculture & Farming', icon: 'Sprout', description: 'Irrigation, sowing, pesticide spraying, harvesting, pump repair' },
  { key: 'education', label: '11. Education & Campuses', icon: 'GraduationCap', description: 'Exam invigilation, syllabus circulation, lab setup, timetable' },
  { key: 'office', label: '12. Office Work', icon: 'Briefcase', description: 'Minutes circulation, compliance filing, client onboarding, decks' },
  { key: 'it_operations', label: '13. IT & Operations', icon: 'Laptop', description: 'Server patching, deployment, backup verification, firewall audits' },
  { key: 'procurement', label: '14. Procurement', icon: 'ShoppingCart', description: 'Vendor RFQ, purchase order approval, three-way invoice match' },
  { key: 'maintenance_facilities', label: '15. Maintenance & Facilities', icon: 'Wrench', description: 'HVAC servicing, generator load test, plumbing, elevator inspection' },
  // Backward compatibility alias for existing test suites
  { key: 'office_it', label: 'Offices & IT (Combined)', icon: 'Laptop', description: 'Combined office and IT operations' }
];

export const ALL_INDUSTRY_ACTIONS = [
  ...HOUSEHOLD_ACTIONS,
  ...MINING_ACTIONS,
  ...MANUFACTURING_ACTIONS,
  ...CONSTRUCTION_ACTIONS,
  ...HOSPITALITY_ACTIONS,
  ...RELIGIOUS_FACILITY_ACTIONS,
  ...HEALTHCARE_ACTIONS,
  ...RETAIL_ACTIONS,
  ...LOGISTICS_ACTIONS,
  ...AGRICULTURE_ACTIONS,
  ...EDUCATION_ACTIONS,
  ...OFFICE_ACTIONS,
  ...IT_OPERATIONS_ACTIONS,
  ...PROCUREMENT_ACTIONS,
  ...MAINTENANCE_FACILITIES_ACTIONS
];

/**
 * Searches the industry dictionary for matching actions based on active industry configuration
 * @param {string} text Normalized transcript text
 * @param {string} [industryKey='all'] Configured industry key
 * @returns {Object|null} Matched action entry with keyword and confidence
 */
export function matchIndustryAction(text, industryKey = 'all') {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Filter actions by chosen industry (or all)
  const candidateActions = ALL_INDUSTRY_ACTIONS.filter((act) => {
    if (!industryKey || industryKey === 'all') return true;
    if (industryKey === 'office_it') {
      return act.industry === 'office' || act.industry === 'it_operations' || act.industry === 'office_it';
    }
    return act.industry === industryKey;
  });

  // Sort candidate actions by keyword length descending (longest match first)
  const sortedCandidates = [];
  candidateActions.forEach((act) => {
    act.keywords.forEach((kw) => {
      sortedCandidates.push({ action: act, keyword: kw, len: kw.length });
    });
  });
  sortedCandidates.sort((a, b) => b.len - a.len);

  for (const { action, keyword } of sortedCandidates) {
    const escaped = escapeRegExp(keyword);
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lower)) {
      return {
        ...action,
        matchedKeyword: keyword,
        confidence: action.confidence || 0.95
      };
    }
  }

  return null;
}
