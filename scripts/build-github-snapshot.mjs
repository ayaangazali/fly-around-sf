// Bakes public GitHub org stats into src/content/github-snapshot.json for the Commit Towers.
// Needs an authenticated gh CLI. Run: node scripts/build-github-snapshot.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ORGS = {
  stripe: ['stripe'],
  openai: ['openai'],
  anthropic: ['anthropics'],
  airbnb: ['airbnb'],
  uber: ['uber'],
  lyft: ['lyft'],
  slack: ['slackapi'],
  dropbox: ['dropbox'],
  pinterest: ['pinterest'],
  reddit: ['reddit'],
  discord: ['discord'],
  figma: ['figma'],
  notion: ['makenotion'],
  github: ['github'],
  twitter: ['twitter'],
  square: ['square', 'block'],
  'wikimedia-foundation': ['wikimedia'],
  'internet-archive': ['internetarchive'],
  'autodesk-pier-9': ['autodesk'],
  exploratorium: ['exploratorium'],
  noisebridge: ['noisebridge'],
  twitch: ['twitchdev'],
  instacart: ['instacart'],
  doordash: ['doordash'],
  yelp: ['yelp'],
  zynga: ['zynga'],
  'scale-ai': ['scaleapi'],
  databricks: ['databricks'],
  waymo: ['waymo-research'],
  cruise: ['cruise-automation'],
  cloudflare: ['cloudflare'],
  twilio: ['twilio'],
  planet: ['planetlabs'],
  salesforce: ['salesforce'],
  a16z: ['a16z'],
  gusto: ['gusto'],
  'code-for-america': ['codeforamerica'],
};
const DAYS = 30;

const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 256 << 20 }));
const pages = (path) => JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8', maxBuffer: 256 << 20 })).flat();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const since = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
const towers = [];
for (const [card, orgs] of Object.entries(ORGS)) {
  const t = { card, orgs, publicRepos: 0, stars: 0, commits30d: 0, topRepo: '', topStars: 0 };
  for (const org of orgs) {
    t.publicRepos += gh(`orgs/${org}`).public_repos;
    for (const r of pages(`orgs/${org}/repos?type=public&per_page=100`)) {
      t.stars += r.stargazers_count;
      if (r.stargazers_count > t.topStars) [t.topRepo, t.topStars] = [`${org}/${r.name}`, r.stargazers_count];
    }
    t.commits30d += gh(`search/commits?q=${encodeURIComponent(`org:${org} committer-date:>=${since}`)}&per_page=1`).total_count;
    await sleep(2500);
  }
  towers.push(t);
  console.log(`${card.padEnd(22)} repos=${t.publicRepos} stars=${t.stars} commits${DAYS}d=${t.commits30d}`);
}
const head = `"generatedAt": ${JSON.stringify(new Date().toISOString())},\n  "sinceDays": ${DAYS}`;
writeFileSync(new URL('../src/content/github-snapshot.json', import.meta.url), `{\n  ${head},\n  "towers": [\n    ${towers.map((t) => JSON.stringify(t)).join(',\n    ')}\n  ]\n}\n`);
