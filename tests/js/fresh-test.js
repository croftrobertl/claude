'use strict';
/**
 * embedIsFresh() — whether the page-embedded availability is recent enough to
 * skip the background revalidate.
 *
 * TWO AGES COMPOUND. The data was already `dataAge` seconds old when the page
 * was rendered, and the page itself may have sat in a full-page cache for
 * hours since. Judging on either alone serves stale availability — which on
 * this site means showing a booked cottage as free.
 */
const E = require('./extract.js');
const { check, done } = E.reporter();

const MAXCONST = (E.src().match(/EMBED_FRESH_MAX_S\s*=\s*(\d+)/) || [])[1];
const F = E.build(['embedIsFresh'], { EMBED_FRESH_MAX_S: Number(MAXCONST) });
const now = () => Math.floor(Date.now() / 1000);
const cfg = o => ({ initial: o });

console.log('-- the constant is read from the source, not retyped --');
check('EMBED_FRESH_MAX_S was found', Number.isFinite(Number(MAXCONST)) && Number(MAXCONST) > 0, MAXCONST);

console.log('\n-- fresh --');
check('just-rendered, just-computed data is fresh',
  F.embedIsFresh(cfg({ renderedAt: now(), ttl: 900, dataAge: 0 })) === true);
check('a little of each still fresh',
  F.embedIsFresh(cfg({ renderedAt: now() - 60, ttl: 900, dataAge: 60 })) === true);

console.log('\n-- stale, and the compounding that makes it stale --');
check('data that was already old at render time is stale even on a new page',
  F.embedIsFresh(cfg({ renderedAt: now(), ttl: 900, dataAge: 899 })) === false);
check('fresh data on a page cached past the TTL is stale',
  F.embedIsFresh(cfg({ renderedAt: now() - 899, ttl: 900, dataAge: 0 })) === false);
check('THE COMPOUNDING CASE: each age alone passes, together they do not',
  F.embedIsFresh(cfg({ renderedAt: now() - 500, ttl: 900, dataAge: 500 })) === false,
  'pageAge 500 + dataAge 500 = 1000 > 900');
check('a page cached for hours is never fresh',
  F.embedIsFresh(cfg({ renderedAt: now() - 7200, ttl: 900, dataAge: 0 })) === false);

console.log('\n-- the hard ceiling, independent of the TTL --');
check('an absurd TTL cannot buy freshness past the ceiling',
  F.embedIsFresh(cfg({ renderedAt: now() - (Number(MAXCONST) + 10), ttl: 86400, dataAge: 0 })) === false,
  'ceiling ' + MAXCONST + 's');
check('...but inside the ceiling a long TTL is honoured',
  F.embedIsFresh(cfg({ renderedAt: now() - 10, ttl: 86400, dataAge: 0 })) === true);

console.log('\n-- missing or nonsensical input fails CLOSED --');
check('no initial payload', F.embedIsFresh({}) === false);
check('null config.initial', F.embedIsFresh(cfg(null)) === false);
check('no renderedAt', F.embedIsFresh(cfg({ ttl: 900, dataAge: 0 })) === false);
check('a non-numeric renderedAt', F.embedIsFresh(cfg({ renderedAt: 'now', ttl: 900, dataAge: 0 })) === false);
check('A CLOCK SKEWED INTO THE FUTURE is refused rather than treated as brand new',
  F.embedIsFresh(cfg({ renderedAt: now() + 600, ttl: 900, dataAge: 0 })) === false);
check('a missing ttl falls back to a default rather than to Infinity',
  F.embedIsFresh(cfg({ renderedAt: now() - 5000, dataAge: 0 })) === false);
check('a missing dataAge is assumed to be the whole TTL, not zero',
  F.embedIsFresh(cfg({ renderedAt: now(), ttl: 900 })) === false,
  'unknown age must not be optimistic');

done();
