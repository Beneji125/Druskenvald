// Name hashing for the unlock system. Character names (GROUPS) and the
// admin password are only ever shipped to the page as hashes, so they
// can't be read straight out of the page source — light spoiler protection
// against casual peeking, not real security (the lore text itself is still
// in the page's data, just never put on screen until unlocked).
//
// cyrb53: a small, fast, non-cryptographic 53-bit string hash. Shared with
// build.js (which hashes GROUPS at build time via the module.exports line
// below), so both sides always agree. To get the hash for a new admin
// password: `node build.js --hash yourpassword`.
function nameHash(str) {
  const s = String(str).trim().toLowerCase();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

if (typeof module !== 'undefined') module.exports = { nameHash };
