/**
 * Approved clinical scope: BHC consultation drafts, including their nested
 * history and program inputs. Ordinary administrative forms are excluded.
 */
export const DRAFTS_ENABLED = true;

/**
 * RHU ITR drafts are independent of the BHC draft flag. Queue Start/Resume
 * opens the RHU workspace on the visit consultation_uuid and autosaves there.
 */
export const RHU_DRAFTS_ENABLED = true;

// Ordinary forms stay excluded; approved new registration opts in explicitly.
export const FORM_DRAFTS_ENABLED = false;
