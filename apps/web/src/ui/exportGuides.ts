/** How much history to bring. Shown in the dropzone and in step 1 of the landing page. */
export const HISTORY_ADVICE = 'A Strava export brings in the most history at once.'

/** The day the guides' steps were read against their sources, as the page says it. */
export const GUIDES_CHECKED_ON = '27 October 2026'

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
  // Checked 2026-10-24 and again 2026-10-27 on Strava's own help article: exporting is "only available on the Strava
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
  // Checked 2026-10-27 on Garmin's own help article, "How Do I Export Data Out of Garmin Connect?":
  // Activities, All Activities, the activity, the settings gear icon at the top right, then the
  // export format, where "Export File" is the original, typically a .fit. The account export is
  // Garmin Account Data Management, "Export Your Data", then "Request Data Export"; its link
  // "typically" comes in 48 hours but can take up to 30 days, with the activities as FIT files.
  // https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8
  {
    service: 'Garmin Connect',
    helpName: 'Garmin',
    steps: [
      'On a computer, sign in to Garmin Connect and choose Activities, then All Activities.',
      'Open the activity, choose the settings gear icon at the top right, then “Export File”.',
      'Drop the download here as it is, zipped or not. It is the original file, usually a .FIT.',
    ],
    contains: 'The original file of one activity, usually a FIT file.',
    alsoAvailable:
      'For everything at once, in Garmin Account Data Management choose “Export Your Data”, then “Request Data Export”. The link usually comes within 48 hours but can take up to 30 days.',
    helpUrl: 'https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8',
    verified: true,
  },
  // Checked 2026-10-27 on Wahoo's own help article, "Share an activity to a third party app [Wahoo
  // app]", under "Download .FIT activity": the History tab, the activity, the three dots at the top
  // right of its summary, "Share activity", then "Download .fit activity", which opens the phone's
  // share menu. Strava is among the partners a workout can be shared to.
  // https://support.wahoofitness.com/hc/en-us/articles/204280874-Share-an-activity-to-a-third-party-app-Wahoo-app
  {
    service: 'Wahoo',
    helpName: 'Wahoo',
    steps: [
      'In the Wahoo app, open the History tab and find the workout.',
      'Choose the three dots at the top right of its summary, then “Share activity”, then “Download .fit activity”.',
      'Save the file from your phone’s share menu, then drop it here.',
    ],
    contains: 'One workout at a time, as a FIT file.',
    alsoAvailable: 'For many at once, share your workouts to Strava, then follow the Strava guide.',
    helpUrl:
      'https://support.wahoofitness.com/hc/en-us/articles/204280874-Share-an-activity-to-a-third-party-app-Wahoo-app',
    verified: true,
  },
  // Checked 2026-10-27 on COROS's own help article, "Requesting a Bulk Export of COROS Data": Training
  // Hub on a desktop computer, the Activity List tab at the top, "Export Data" on the right, then a
  // choice of .FIT or .TCX and an email address to receive the files.
  // https://support.coros.com/hc/en-us/articles/25002333092500-Requesting-a-Bulk-Export-of-COROS-Data
  {
    service: 'COROS',
    helpName: 'COROS',
    steps: [
      'On a computer, sign in to COROS Training Hub.',
      'Open the Activity List tab at the top, then choose “Export Data” on the right.',
      'Choose .FIT, and enter the email address the export should go to.',
      'When the email arrives, download the files and drop them here.',
    ],
    contains: 'Your whole activity history, as FIT files.',
    helpUrl:
      'https://support.coros.com/hc/en-us/articles/25002333092500-Requesting-a-Bulk-Export-of-COROS-Data',
    verified: true,
  },
  // Checked 2026-10-27 on Zwift's own help article, "Locating Your Activity, Log, and Workout Files",
  // under Zwift.com: zwift.com/feed, sign in, JUST ME, the activity, the Cog icon, then DOWNLOAD FIT
  // FILE. Activities are downloaded one at a time; the article gives no export of them all.
  // https://support.zwift.com/en_us/locating-your-activity-log-and-workout-files-BykKO63fr
  {
    service: 'Zwift',
    helpName: 'Zwift',
    steps: [
      'On a computer, go to zwift.com/feed and sign in.',
      'Choose “Just me”, then open the activity.',
      'Choose the cog icon, then “Download FIT file”.',
      'Drop the .FIT file here.',
    ],
    contains: 'One activity at a time, as a FIT file. Repeat the steps for each one.',
    helpUrl:
      'https://support.zwift.com/en_us/locating-your-activity-log-and-workout-files-BykKO63fr',
    verified: true,
  },
]
