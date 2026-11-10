/** A plain definition of each level below Local, shown on Method. Below 60% the bands are this app's own, not WMA's. */
export const OWN_LEVEL_MEANING: readonly { name: string; meaning: string }[] = [
  { name: 'Club', meaning: 'Club is 50% to 59%: fast enough to hold your own in a club race.' },
  { name: 'Trained', meaning: 'Trained is 40% to 49%: regular, structured training shows.' },
  { name: 'Active', meaning: 'Active is 30% to 39%: you exercise most weeks.' },
  { name: 'Recreational', meaning: 'Recreational is under 30%: you move for fun, not for pace.' },
]

/** Where the own bands are said to be this app's, in one line. */
export const OWN_LEVELS_NOTE = 'Below 60%, the bands are this app’s own, not WMA’s.'
