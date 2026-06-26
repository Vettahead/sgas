// Postcode lookup — same service the interpro app uses: the free postcodes.io API.
// It is POSTCODE-LEVEL: it validates a postcode and returns the town/district,
// county and coordinates. It does NOT return a house-by-house address list
// (that needs a paid PAF service such as getAddress.io / Ideal Postcodes — can be
// added later if we want the "pick your house number" dropdown).
//
// Usage:  const a = await lookupPostcode('FY1 4PT')
//         → { postcode, town, county, parish, region, lat, lng }

export async function lookupPostcode(pc) {
  const clean = (pc || '').trim()
  if (!clean) throw new Error('Enter a postcode first')
  let res
  try {
    res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`)
  } catch (e) {
    throw new Error('Lookup failed — check your connection')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.status !== 200 || !body.result) throw new Error('Postcode not found')
  const r = body.result
  return {
    postcode: r.postcode || clean.toUpperCase(),
    town: r.admin_district || r.parish || '',
    county: r.admin_county || '',            // null for unitary authorities — left blank then
    parish: r.parish || '',
    region: r.region || '',
    lat: r.latitude ?? null,
    lng: r.longitude ?? null,
  }
}
