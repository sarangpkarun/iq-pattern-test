// GET /api/pixel-config  ->  a tiny script that tells the browser which Meta Pixel id to use.
// The id comes from the META_PIXEL_ID environment variable, so there is only one place to set it.
// (A Pixel id is public - it is visible in any website that uses it - so this is safe.)
module.exports = (req, res) => {
  const id = String(process.env.META_PIXEL_ID || '');
  const safe = /^\d{5,20}$/.test(id) ? id : ''; // digits only, so nothing odd can end up inside the script
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(`window.META_PIXEL_ID=${JSON.stringify(safe)};`);
};
