/* ==========================================================================
   nonprofitRules.js, which IRS records a short "nonprofits near you" preview
   leaves out.

   The rule is narrow on purpose: a preview only skips organizations that
   clearly can't take a teen volunteer. Everything else stays, churches and
   youth sports leagues included, since both run on volunteers. A full search
   on Discover lists every record whatever this rule says, and the preview's
   "See all" link goes there with the true total.

   Left out of previews:
   - 501(c) subsections other than (3) charities and (4) social welfare
     groups. Those are business leagues and chambers (c6), social and
     country clubs (c7), fraternal lodges (c8, c10), unions (c5), employee
     benefit funds (c9) and title-holding shells (c2), none of which take
     outside volunteers.
   - Homeowner and condo associations, which serve their own residents.
   - Booster clubs and PTOs/PTAs, which are parent fundraising groups.
   - Political party and campaign groups.
   - Family foundations and charitable trusts, which give grants and run no
     programs of their own.
   - Building corporations and alumni house corporations, which hold property.
   ========================================================================== */

const KEEP_SUBSECTIONS = new Set([3, 4]);

const SKIP_NAME = new RegExp(
  [
    'home ?owners?', '\\bhoa\\b', 'condominium', 'property owners', 'owners assoc',
    'booster', '\\bpto\\b', '\\bpta\\b', 'parent teacher',
    'democrat', 'republican', '\\bgop\\b', 'political action', '\\bpac\\b', 'for congress', 'campaign committee',
    'family foundation', 'charitable trust', 'irrevocable trust', 'charitable remainder',
    'building corp', 'house corp', 'housing corp of',
  ].join('|'),
  'i'
);

/**
 * True when a search row could plausibly take a teen volunteer.
 * @param {{ name?: string, subsection?: number|null }} o
 */
export function isVolunteerPlace(o) {
  if (!o) return false;
  const sub = Number(o.subsection);
  if (Number.isInteger(sub) && sub > 0 && !KEEP_SUBSECTIONS.has(sub)) return false;
  return !SKIP_NAME.test(String(o.name || ''));
}
