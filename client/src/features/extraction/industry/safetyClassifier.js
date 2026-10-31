/**
 * Industrial Safety & Controlled Action Classifier
 * 
 * Inspects parsed instructions for hazardous, irreversible, or high-consequence operations.
 * Separates linguistic understanding from safety compliance authorization.
 * Guarantees that spoken instructions involving safety controls, medical orders,
 * or hazardous machinery are flagged for human supervisor review.
 */

export const SAFETY_HAZARD_PATTERNS = [
  // 1. Ventilation & Atmospheric Life Safety (e.g. "turn off the ventilation if it gets noisy")
  {
    regex: /(?:turn\s+off|shut\s+down|stop|disable|switch\s+off)\s+(?:the\s+)?(?:mine\s+)?ventilation/i,
    hazardType: 'LIFE_SAFETY_VENTILATION',
    warning: 'CRITICAL SAFETY ALERT: Atmospheric ventilation shutdown commands cannot be automated and require certified mine safety engineer authorization.'
  },
  // 2. Lockout / Tagout Bypass (LOTO)
  {
    regex: /(?:bypass|skip|ignore|override)\s+(?:the\s+)?(?:lockout|tagout|interlock|loto|safety\s+guard)/i,
    hazardType: 'SAFETY_INTERLOCK_BYPASS',
    warning: 'PROHIBITED ACTION: Lockout/Tagout (LOTO) or safety interlock bypass instructions violate industrial safety standards.'
  },
  // 3. Clinical & Medical Prescriptions (Healthcare Isolation)
  {
    regex: /(?:administer|inject|prescribe|infuse|increase\s+dose|give\s+morphine|iv\s+drip)\b/i,
    hazardType: 'CLINICAL_PRESCRIPTION_PROHIBITED',
    warning: 'CLINICAL SAFETY HOLD: Task delegation engine cannot authorize patient prescription, dosage alteration, or medical administration without physician directive.'
  },
  // 4. Hazardous Voltage & High Power
  {
    regex: /(?:re-energize|power\s+up|turn\s+on)\s+(?:the\s+)?(?:high\s+voltage|substation|transformer|breaker\s+panel)/i,
    hazardType: 'ELECTRICAL_HAZARD',
    warning: 'ELECTRICAL SAFETY NOTICE: Substation re-energization requires electrical permit-to-work and arc-flash verification.'
  },
  // 5. Chemical & Explosive Discharges
  {
    regex: /(?:dump|release|open\s+valve)\s+(?:the\s+)?(?:toxic|acid|chlorine|gas|ammonia|chemical)/i,
    hazardType: 'HAZMAT_RELEASE',
    warning: 'HAZMAT SAFETY PROTOCOL: Chemical release or tank evacuation requires environmental safety officer verification.'
  }
];

/**
 * Evaluates whether a task draft involves safety-critical or controlled actions
 * @param {string} text Raw or normalized transcript text
 * @param {Object} actionMatch Matched action dictionary entry
 * @returns {{
 *   isSafetyCritical: boolean,
 *   hazardType?: string,
 *   warning?: string,
 *   requiresSupervisorAuthorization: boolean
 * }}
 */
export function evaluateSafetyClassification(text, actionMatch = null) {
  if (!text) {
    return {
      isSafetyCritical: false,
      requiresSupervisorAuthorization: false
    };
  }

  // 1. Check explicit hazard regex patterns
  for (const hazard of SAFETY_HAZARD_PATTERNS) {
    if (hazard.regex.test(text)) {
      return {
        isSafetyCritical: true,
        hazardType: hazard.hazardType,
        warning: hazard.warning,
        requiresSupervisorAuthorization: true
      };
    }
  }

  // 2. Check matched action entry's safety flag
  if (actionMatch?.isSafetyCritical) {
    return {
      isSafetyCritical: true,
      hazardType: actionMatch.category || 'INDUSTRIAL_OPERATION',
      warning: actionMatch.safetyWarning || 'Safety Notice: This operation involves controlled industrial equipment. Requires supervisor sign-off.',
      requiresSupervisorAuthorization: true
    };
  }

  return {
    isSafetyCritical: false,
    requiresSupervisorAuthorization: false
  };
}
