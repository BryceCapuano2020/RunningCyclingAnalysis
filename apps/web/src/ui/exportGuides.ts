/** How much history to bring. Shown in the dropzone and in step 1 of the landing page. */
export const HISTORY_ADVICE = 'A Strava export brings in the most history at once.'

/** The day the guides' steps were read against their sources, as the page says it. */
export const GUIDES_CHECKED_ON = '24 October 2026'

/** How to get one service's activity files out, for people who have never exported them. */
export interface ExportGuide {
  service: string
  /** The service's name as its help link names it, such as "Garmin" in "Open Garmin’s help". */
  helpName: string
  /** One sentence per step, in the order the export is reached. */
  steps: readonly string[]
  /** The index of the step that starts a wait for the export, after which the sample can be tried. */
  waitStep?: number
  /** One line on what the export holds. */
  contains: string
  /** A second route, in one line: a whole-history request, or the one-activity export of another guide. */
  alsoAvailable?: string
  helpUrl: string
  /**
   * True when the steps were read on the service's own help page on the check date. The line under
   * a guide says where its steps came from, so a guide that is not verified names no help page.
   */
  verified: boolean
}

export const EXPORT_GUIDES: readonly ExportGuide[] = [
  // Checked 2026-10-24 on Strava's own help article: exporting is "only available on the Strava
  // website", the download link comes by email and the process "may take a few hours", and one
  // activity exports with "Export Original".
  // https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data
  {
    service: 'Strava',
    helpName: 'Strava',
    steps: [
      'On a computer, go to strava.com and sign in. The Strava app cannot export.',
      'Move your cursor over your name in the top-right corner, choose “Settings”, then open the “My Account” tab.',
      'Under “Download your account”, click “Get Started”, then “Request download”.',
      'The download link is emailed to the address on your Strava profile. It may take a few hours.',
      'Download the zip and drop it here as it is. There is no need to unzip it.',
    ],
    waitStep: 3,
    contains: 'The route for many: a zip of your whole account, with your activity files in it.',
    alsoAvailable:
      'One activity: open it, choose the more (…) menu, then “Export Original”. It keeps the format it was uploaded in, often FIT.',
    helpUrl: 'https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data',
    verified: true,
  },
  // Checked 2026-10-24 from search summaries of third-party guides, since TrainingPeaks' help
  // article refused the fetch. Both guides give the gear icon on the activity, then Export Original,
  // and FetchEveryone says the download is a zip holding a FIT file. Garmin's own pages sign in
  // first, so they were not read. The account request and its days come from the same summaries.
  // The importer also reads a bare .fit or a .fit.gz (packages/core session tests), which the
  // download line adds; no cited guide says Garmin sends a .fit.gz.
  // https://help.trainingpeaks.com/hc/en-us/articles/204070844-How-can-I-export-my-Garmin-Connect-Activities-into-TrainingPeaks-
  // https://fetcheveryone.com/feedback-faq-garmin.php
  {
    service: 'Garmin Connect',
    helpName: 'Garmin',
    steps: [
      'On a computer, open the activity on the Garmin Connect website.',
      'Choose the gear menu, then “Export Original”.',
      'Drop the download here as it is. It is a .FIT file, sometimes inside a zip or as a .fit.gz.',
    ],
    contains: 'The original file of one activity, as a FIT file.',
    alsoAvailable:
      'For everything at once, request your account data from garmin.com/account/datamanagement. It can take days, so start early.',
    helpUrl: 'https://support.garmin.com/',
    verified: false,
  },
  // Checked 2026-10-24 from the search summary of Wahoo's share article, since the article refused
  // the fetch. The summary says a completed activity is shared as a FIT file to partners such as
  // Strava, so the steps send the workout to Strava and point to the Strava guide for its file.
  // https://support.wahoofitness.com/hc/en-us/articles/204280874-Share-an-activity-to-a-third-party-app-Wahoo-app
  {
    service: 'Wahoo',
    helpName: 'Wahoo',
    steps: [
      'In the Wahoo app, share the workout to Strava.',
      'Then export that activity from Strava, as the Strava guide describes for one activity.',
    ],
    contains: 'One workout at a time, through Strava.',
    helpUrl:
      'https://support.wahoofitness.com/hc/en-us/articles/204280874-Share-an-activity-to-a-third-party-app-Wahoo-app',
    verified: false,
  },
  // Checked 2026-10-24 from the search summary of COROS's bulk export article, since the article
  // refused the fetch. The summary puts Export Data on the Activity List tab of Training Hub on a
  // desktop browser, offers FIT or TCX, and sends the export to an email address.
  // https://support.coros.com/hc/en-us/articles/25002333092500-Requesting-a-Bulk-Export-of-COROS-Data
  {
    service: 'COROS',
    helpName: 'COROS',
    steps: [
      'On a computer, sign in to COROS Training Hub.',
      'Open the activity list, and choose Export Data.',
      'Choose FIT, and enter the email address the export should go to.',
      'When the email arrives, download the files and drop them here.',
    ],
    contains: 'Your whole activity history, as FIT files.',
    helpUrl:
      'https://support.coros.com/hc/en-us/articles/25002333092500-Requesting-a-Bulk-Export-of-COROS-Data',
    verified: false,
  },
  // Checked 2026-10-24 from ZwiftInsider's guide, last updated 2026-05-06, which describes the gear
  // icon, then "Download Fit File", on a ride at zwift.com. Zwift's own help article could not be
  // read in full. Only one ride is downloaded at a time, so a route for many is not given: a ride
  // from before a Strava link is not uploaded to Strava.
  // https://zwiftinsider.com/retrieve-lost-ride
  {
    service: 'Zwift',
    helpName: 'Zwift',
    steps: [
      'On a computer, sign in at zwift.com and open the activity.',
      'Choose the gear icon, then “Download Fit File”.',
      'Drop the .FIT file here.',
    ],
    contains: 'One ride at a time, as a FIT file. Repeat the steps for each ride.',
    helpUrl: 'https://support.zwift.com/en_us/your-activity-history-and-fit-files-SJbHywdNH',
    verified: false,
  },
]
