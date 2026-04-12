// All 32 cards: 16 Gridiron Events (Chance) + 16 Commissioner's Office (Community Chest)

const GRIDIRON_EVENTS = [
  {
    id: 'ge_1',
    title: 'ADVANCE TO KICKOFF',
    description: 'Move directly to Kickoff (GO). Collect $2M.',
    historicalNote: 'Program revenue and commissioner salary represent the annual operating income of a major college football program.',
    effect: { type: 'move_to_space', spaceIndex: 0, collectGoIfPass: true },
  },
  {
    id: 'ge_2',
    title: 'WORLD WAR II DRAFT — YOUR SEASON IS CANCELED',
    description: 'Lose your next turn. Your players have been drafted into military service.',
    historicalNote: 'Over 1,000 college football players died in WWII. Many programs canceled full seasons in 1943-1945. The sport was nearly abandoned before a national push to keep games going for morale.',
    effect: { type: 'lose_turn' },
  },
  {
    id: 'ge_3',
    title: 'ESPN SIGNS A LANDMARK TV DEAL',
    description: 'Advance to the nearest TV Contract space. If unowned, you may buy it. If owned, pay double the standard revenue.',
    historicalNote: "ESPN's $7.3 billion deal with the SEC (2023) is the most valuable media rights deal in college sports history. Television transformed college football from a regional game into a national industry.",
    effect: { type: 'move_to_nearest', spaceType: 'tv_contract', doubleIfOwned: true },
  },
  {
    id: 'ge_4',
    title: 'BEAR BRYANT INTEGRATES ALABAMA',
    description: 'Collect $500K from the Bank. Your program\'s integration brings elite talent and elevates your national prestige.',
    historicalNote: "In 1970, USC's integrated team defeated all-white Alabama 42-21. Bear Bryant, recognizing the talent gap, began recruiting Black players immediately. Within 5 years, Alabama's roster was fully integrated — and they won 3 more national titles.",
    effect: { type: 'collect_from_bank', amount: 500_000_000 },
  },
  {
    id: 'ge_5',
    title: 'CONFERENCE REALIGNMENT — ADVANCE TO NEAREST BOWL GAME',
    description: 'Move to the nearest Bowl Game space. If unowned, you may buy it. If owned, pay the standard revenue.',
    historicalNote: 'Conference realignment has shattered geographic traditions since the 1990s. In 2024, USC and UCLA left the Pac-12 for the Big Ten, and Texas and Oklahoma joined the SEC — driven entirely by television revenue.',
    effect: { type: 'move_to_nearest', spaceType: 'bowl_game', doubleIfOwned: false },
  },
  {
    id: 'ge_6',
    title: 'YOUR STAR PLAYER ENTERS THE TRANSFER PORTAL',
    description: 'Pay $300K to the Bank. Your best recruit has transferred to a rival program.',
    historicalNote: 'The NCAA Transfer Portal (opened 2018) allows players to transfer freely. Over 1,500 players enter the portal each year, creating a free-agent marketplace that has fundamentally changed how rosters are built.',
    effect: { type: 'pay_to_bank', amount: 300_000_000 },
  },
  {
    id: 'ge_7',
    title: 'GO DIRECTLY TO NCAA PROBATION',
    description: 'Go directly to NCAA Probation. Do not pass Kickoff. Do not collect $2M.',
    historicalNote: "The NCAA's enforcement arm investigates programs for recruiting violations, improper benefits, and academic fraud. Southern Methodist University received the 'Death Penalty' in 1987 — a complete suspension of their program for repeated violations.",
    effect: { type: 'go_to_jail' },
  },
  {
    id: 'ge_8',
    title: 'NIL DEAL — COLLECT $200K',
    description: 'Your program\'s star athlete lands a major endorsement deal. Collect $200K from the Bank.',
    historicalNote: 'Since July 1, 2021, college athletes can profit from their Name, Image & Likeness. Top quarterbacks earn millions before turning pro. The old model of "amateurism" — which generated billions while paying players nothing — is effectively over.',
    effect: { type: 'collect_from_bank', amount: 200_000_000 },
  },
  {
    id: 'ge_9',
    title: 'ADVANCE TO AUBURN TIGERS',
    description: 'Move to the Auburn Tigers space. If unowned, you may buy it. If owned, pay revenue. Collect $2M if you pass Kickoff.',
    historicalNote: 'Auburn vs. Alabama (The Iron Bowl) is the defining rivalry of Southern football — contested since 1893. It is considered one of the fiercest rivalries in all of American sports.',
    effect: { type: 'move_to_space', spaceIndex: 1, collectGoIfPass: true },
  },
  {
    id: 'ge_10',
    title: 'THE CIVIL RIGHTS MOVEMENT REACHES YOUR CAMPUS',
    description: 'Choice: Pay $100K in administrative costs, OR integrate your roster now and gain a permanent $300K revenue bonus on one of your programs.',
    historicalNote: 'The Civil Rights Movement forced Southern universities to confront segregation on the most public stage possible — the football field. Programs that integrated early gained a massive competitive advantage through access to Black talent.',
    effect: { type: 'choice', choices: [
      { label: 'Pay admin costs ($100K)', effect: { type: 'pay_to_bank', amount: 100_000_000 } },
      { label: 'Integrate roster (permanent $300K bonus on one program)', effect: { type: 'integration_bonus', amount: 300_000_000 } },
    ]},
  },
  {
    id: 'ge_11',
    title: 'YOUR PROGRAM IS FINED FOR RECRUITING VIOLATIONS',
    description: 'Pay $15K for each Recruiting Class you own across all programs.',
    historicalNote: "Recruiting violations are the most common NCAA infractions. The 'pay-for-play' scandals that preceded the NIL era sent multiple programs to probation — including USC, North Carolina, and Auburn.",
    effect: { type: 'per_unit_fine', amountPerHouse: 15_000_000, amountPerHotel: 60_000_000 },
  },
  {
    id: 'ge_12',
    title: 'REVENUE SHARING VOTE PASSES',
    description: 'The new revenue-sharing model is approved. Collect $100K from every other player.',
    historicalNote: "In 2025, the House v. NCAA settlement approved direct revenue sharing between schools and athletes — up to $20M per school per year. This is the most transformative change to college athletics since Title IX.",
    effect: { type: 'collect_from_each', amount: 100_000_000 },
  },
  {
    id: 'ge_13',
    title: 'GO BACK THREE SPACES',
    description: 'Move back three spaces. Follow the instructions on that space.',
    historicalNote: 'Sometimes momentum reverses — a loss to a rival, a key injury, or a sanctions ruling can set any program back.',
    effect: { type: 'move_relative', spaces: -3 },
  },
  {
    id: 'ge_14',
    title: 'ESCAPE NCAA INVESTIGATION',
    description: 'Keep this card. Use it to get out of NCAA Probation for free, or sell it to another player at any agreed price.',
    historicalNote: 'High-powered legal teams and political connections have historically allowed certain programs to escape sanctions. This card reflects those real-world advantages.',
    effect: { type: 'keep_card' },
  },
  {
    id: 'ge_15',
    title: 'YOUR STADIUM SELLS OUT FOR THE SEASON',
    description: 'Collect $50K from every other player. The electricity of a sold-out Southern stadium is unlike anything in American sports.',
    historicalNote: "Southern stadiums routinely sell out seasons years in advance. Alabama, LSU, and Tennessee have had season-ticket waiting lists measured in decades. Football Saturday is a community event that dwarfs any professional sports experience.",
    effect: { type: 'collect_from_each', amount: 50_000_000 },
  },
  {
    id: 'ge_16',
    title: 'YOU MADE THE COLLEGE FOOTBALL PLAYOFF',
    description: 'Collect $300K from the Bank. The CFP distributes over $500M to conferences annually.',
    historicalNote: 'The College Football Playoff (CFP), expanded to 12 teams in 2024, distributes hundreds of millions in revenue. An SEC team in the CFP can earn $6M+ just in appearance fees — before merchandise, travel, and TV bonuses.',
    effect: { type: 'collect_from_bank', amount: 300_000_000 },
  },
];

const COMMISSIONERS_OFFICE = [
  {
    id: 'co_1',
    title: 'SIGNING DAY BONUS',
    description: "It's National Signing Day! Collect $200K from the Bank.",
    historicalNote: 'National Signing Day (first Wednesday in February) is a major media event. ESPN broadcasts live coverage of recruits choosing schools. Top recruiting classes can be worth hundreds of millions in future revenue.',
    effect: { type: 'collect_from_bank', amount: 200_000_000 },
  },
  {
    id: 'co_2',
    title: 'PLAYER INJURY — PAY HOSPITAL BILL',
    description: 'A key player suffers an injury. Pay $100K.',
    historicalNote: "For most of college football's history, injured athletes bore their own medical costs after their eligibility ended. The debate over player welfare and compensation has been central to modern reform efforts.",
    effect: { type: 'pay_to_bank', amount: 100_000_000 },
  },
  {
    id: 'co_3',
    title: 'ADVANCE TO KICKOFF',
    description: 'Move to Kickoff (GO) and collect $2M.',
    historicalNote: 'Program revenue / commissioner salary.',
    effect: { type: 'move_to_space', spaceIndex: 0, collectGoIfPass: false },
  },
  {
    id: 'co_4',
    title: 'YOU ARE ELECTED CONFERENCE COMMISSIONER',
    description: 'Collect $100K from each player.',
    historicalNote: "Conference commissioners are among the highest-paid executives in sports. SEC Commissioner Greg Sankey earns over $4M annually. Their decisions on TV deals and conference membership shape the entire sport.",
    effect: { type: 'collect_from_each', amount: 100_000_000 },
  },
  {
    id: 'co_5',
    title: 'HBCU FOOTBALL HERITAGE — EDUCATIONAL BONUS',
    description: 'Collect $150K from the Bank in recognition of HBCU football history.',
    historicalNote: "Historically Black Colleges and Universities maintained thriving football programs when Black players were barred from white universities. Eddie Robinson (Grambling State, 408 wins) and Jake Gaither (FAMU, .844 winning percentage) were giants of the game — invisible to the mainstream until integration.",
    effect: { type: 'collect_from_bank', amount: 150_000_000 },
  },
  {
    id: 'co_6',
    title: 'TITLE IX COMPLIANCE AUDIT',
    description: 'Your athletic department is audited. Pay $75K.',
    historicalNote: 'Title IX (1972) required universities to provide equal athletic opportunities for women. Compliance forced many programs to add women\'s sports, funded by football revenue. It permanently reshaped athletic department budgets.',
    effect: { type: 'pay_to_bank', amount: 75_000_000 },
  },
  {
    id: 'co_7',
    title: 'YOUR HEAD COACH LEAVES FOR THE NFL',
    description: 'A rival NFL team has poached your coach. Remove one Recruiting Class from any one of your programs (if you own any).',
    historicalNote: "The coaching carousel in college football is relentless. Nick Saban's assistant coaches have become head coaches at major programs nationwide. Losing a coordinator can cost a program a full recruiting class.",
    effect: { type: 'lose_house' },
  },
  {
    id: 'co_8',
    title: 'THE GREAT DEPRESSION',
    description: 'Pay $10K for each program deed you hold.',
    historicalNote: "The Great Depression (1929-1939) devastated college athletic budgets. Multiple programs cut rosters, shortened seasons, or nearly folded. It was the first great financial crisis to test college football's viability as an institution.",
    effect: { type: 'per_deed_fine', amountPerDeed: 10_000_000 },
  },
  {
    id: 'co_9',
    title: 'GO TO NCAA PROBATION',
    description: 'Go directly to NCAA Probation. Do not pass Kickoff. Do not collect $2M.',
    historicalNote: "NCAA Probation is a real and serious penalty. Scholarship reductions, bowl bans, and recruiting restrictions can set a program back by a decade.",
    effect: { type: 'go_to_jail' },
  },
  {
    id: 'co_10',
    title: 'BOWL GAME PAYOUT',
    description: 'Your conference negotiated a strong bowl payout. Collect $25K from every other player.',
    historicalNote: 'Bowl games distribute revenue to participating conferences. An SEC team in a major bowl can generate $8-12M for its conference in bowl revenue alone — before merchandise, travel, and alumni donations.',
    effect: { type: 'collect_from_each', amount: 25_000_000 },
  },
  {
    id: 'co_11',
    title: 'DESEGREGATION ORDER — HISTORICAL MOMENT',
    description: 'No financial effect. Read aloud to all players.',
    historicalNote: "In 1963, Alabama Governor George Wallace stood in the schoolhouse door to block Black students from enrolling — while federal marshals stood by. College football integration followed years later, and the sport became one of the most visible battlegrounds of racial change in America. Programs that embraced integration rose; those that resisted fell behind competitively.",
    effect: { type: 'educational_moment' },
  },
  {
    id: 'co_12',
    title: 'PAY SCHOOL TAXES',
    description: 'Pay $100K to the Bank.',
    historicalNote: "Universities are nonprofit institutions, but their football programs generate taxable revenue. Congressional scrutiny of the NCAA's tax-exempt status has intensified as program revenues have grown.",
    effect: { type: 'pay_to_bank', amount: 100_000_000 },
  },
  {
    id: 'co_13',
    title: 'YOUR PROGRAM GOES ON A BOWL STREAK',
    description: 'Six consecutive bowl appearances bring national attention and recruiting momentum. Collect $300K from the Bank.',
    historicalNote: "Bowl streaks signal program stability and attract recruits. Alabama's streak of 24 consecutive bowl appearances (2000-2023) under multiple coaches is a testament to institutional football culture.",
    effect: { type: 'collect_from_bank', amount: 300_000_000 },
  },
  {
    id: 'co_14',
    title: 'ESCAPE NCAA INVESTIGATION',
    description: 'Keep this card. Use it to get out of NCAA Probation for free, or sell it.',
    historicalNote: 'Some programs have historically avoided punishment through political connections, legal maneuvering, or simply waiting out investigators. This card reflects that reality.',
    effect: { type: 'keep_card' },
  },
  {
    id: 'co_15',
    title: 'TRANSFER PORTAL BRINGS A 5-STAR QUARTERBACK',
    description: 'A star transfer elevates your program\'s profile and ticket sales. Collect $200K from the Bank.',
    historicalNote: "The transfer portal has become a second recruiting class. Programs like Georgia and Alabama use it to reload with experienced players. A 5-star transfer quarterback can single-handedly change a program's trajectory and revenue.",
    effect: { type: 'collect_from_bank', amount: 200_000_000 },
  },
  {
    id: 'co_16',
    title: 'THE CIVIL RIGHTS ACT OF 1964',
    description: 'If you own any Pink (Depression/Wartime) or Orange (Integration Era) programs, collect $250K. Otherwise, collect $50K.',
    historicalNote: 'The Civil Rights Act of 1964 legally mandated desegregation in federally funded institutions — including universities. Programs that integrated early built sustainable competitive advantages. Those that waited lost ground to the talent they had excluded for decades.',
    effect: { type: 'conditional_collect', condition: 'owns_era_group', groups: ['pink', 'orange'], ifTrue: 250_000_000, ifFalse: 50_000_000 },
  },
];

function shuffleDeck(cards) {
  const arr = [...cards.map(c => c.id)];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const GRIDIRON_MAP = Object.fromEntries(GRIDIRON_EVENTS.map(c => [c.id, c]));
const COMMISSIONERS_MAP = Object.fromEntries(COMMISSIONERS_OFFICE.map(c => [c.id, c]));

module.exports = {
  GRIDIRON_EVENTS,
  COMMISSIONERS_OFFICE,
  GRIDIRON_MAP,
  COMMISSIONERS_MAP,
  shuffleDeck,
};
