/** The heading of the export guides. The landing page's step 1 focuses it, so its id is shared. */
export const EXPORT_GUIDES_HEADING_ID = 'export-guides-heading'

/** How to get one service's activity files out, for people who have never exported them. */
export interface ExportGuide {
  service: string
  /** One sentence per step, in the order the export is reached. */
  steps: readonly string[]
  /** One line on what the export holds. */
  contains: string
  helpUrl: string
  helpLabel: string
  /**
   * False when the steps could not be checked against the service's own help page, so they are
   * worded generally and the guide says that menu names and delivery can differ.
   */
  verified: boolean
}

/**
 * Strava's steps were checked on its help page. The Garmin, COROS, Wahoo and Zwift help pages could
 * not be read in full, so their steps come from summaries of them and name no menu items.
 */
export const EXPORT_GUIDES: readonly ExportGuide[] = [
  {
    service: 'Strava',
    steps: [
      'Hover over your name at the top right and choose "Settings".',
      'Open the "My Account" tab. Under "Download your account", click "Get Started".',
      'Click "Request download".',
      'The link arrives by email, at the address on your profile. It can take a few hours. Download the zip.',
      'Drop the zip here as it is. The app reads the .gz files inside, so there is no need to unzip it.',
    ],
    contains: 'Your activities in an activities folder, some of them gzipped (.gz).',
    helpUrl: 'https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data',
    helpLabel: 'Full steps on Strava help',
    verified: true,
  },
  {
    service: 'Garmin Connect',
    steps: [
      'On a computer, sign in to Garmin Connect and open the activity you want.',
      'In the activity’s menu, look for an option that exports the original file.',
      'Save the download. It may be a zip, which you can drop here as it is, or unzip to get the .FIT file.',
    ],
    contains: 'The original file of one activity, usually in FIT format.',
    helpUrl: 'https://support.garmin.com/',
    helpLabel: 'Garmin support',
    verified: false,
  },
  {
    service: 'Wahoo',
    steps: [
      'In the Wahoo app, open History and the activity.',
      'Use the activity’s menu to share it or export it as a FIT file.',
      'Save the file on your phone, or send it to a computer, then drop it here.',
    ],
    contains: 'The activity as a FIT file.',
    helpUrl:
      'https://support.wahoofitness.com/hc/en-us/articles/204280874-Share-an-activity-to-a-third-party-app-Wahoo-app',
    helpLabel: 'Wahoo help',
    verified: false,
  },
  {
    service: 'COROS',
    steps: [
      'On a computer, log in to COROS Training Hub.',
      'Open your activity list and look for the export option.',
      'Choose the FIT or TCX format and follow the delivery steps COROS shows.',
      'Drop the files you receive here.',
    ],
    contains: 'Activity files in FIT or TCX format, as COROS delivers them.',
    helpUrl:
      'https://support.coros.com/hc/en-us/articles/25002333092500-Requesting-a-Bulk-Export-of-COROS-Data',
    helpLabel: 'COROS help',
    verified: false,
  },
  {
    service: 'Zwift',
    steps: [
      'On a computer, sign in to zwift.com and open your activity feed.',
      'Open the activity you want, then use its menu to download it as a FIT file.',
      'Drop the downloaded file here.',
    ],
    contains:
      'One FIT file for each activity. The feed shows recent activities, not necessarily all.',
    helpUrl: 'https://support.zwift.com/en_us/your-activity-history-and-fit-files-SJbHywdNH',
    helpLabel: 'Zwift help',
    verified: false,
  },
]
