import { AnalysisSession } from '@rca/core/session'

/**
 * Draws the sample athlete's season when a test file imports this, so the first test that loads the sample
 * does not pay for it: the season is drawn second by second, and its digests are then held for the file
 * (packages/core/src/sessionSample.ts). Import it first in a file whose tests load the sample.
 */
new AnalysisSession().loadSample({ massKg: 75, bikeMassKg: 9 })
