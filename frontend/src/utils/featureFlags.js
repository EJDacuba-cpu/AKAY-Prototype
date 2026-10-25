/**
 * TEMPORARY: unfinished-consultation drafts are switched off while the
 * architecture is being reworked. With this false the workspace neither loads,
 * autosaves, recovers nor resumes drafts, and the patient profile never offers
 * Resume. Nothing server-side changes and existing drafts are left untouched.
 * Set to true to bring drafts back.
 */
export const DRAFTS_ENABLED = false;

/**
 * RHU ITR drafts are independent of the BHC draft flag. Queue Start/Resume
 * opens the RHU workspace on the visit consultation_uuid and autosaves there.
 */
export const RHU_DRAFTS_ENABLED = true;
